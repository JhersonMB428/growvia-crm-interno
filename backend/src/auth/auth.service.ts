import {
  ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { BitacoraService } from '../bitacora/bitacora.service';
import { CorreoService } from '../correo/correo.service';
import { SesionUsuario } from './decorators/usuario-actual.decorator';
import { ParametrosService } from '../sistema/parametros.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { nombreDelEquipo } from './clave';
import { LoginDto } from './dto/login.dto';
import { VerificarDto } from './dto/verificar.dto';
import { AccesoMovil } from './entities/acceso-movil.entity';
import { CodigoVerificacion } from './entities/codigo-verificacion.entity';
import { escapar, plantillaCorreo } from '../correo/plantilla';
import { DispositivoConfiable } from './entities/dispositivo-confiable.entity';

const ES_CELULAR = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i;

/** Convierte "8h", "30m" o "3600" a segundos */
function aSegundos(valor: string | undefined, porDefecto: number): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec((valor ?? '').trim());
  if (!m) return porDefecto;
  const factor = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2] as '' | 's' | 'm' | 'h' | 'd'];
  return Number(m[1]) * factor;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(CodigoVerificacion) private readonly codigos: Repository<CodigoVerificacion>,
    @InjectRepository(DispositivoConfiable) private readonly dispositivos: Repository<DispositivoConfiable>,
    @InjectRepository(AccesoMovil) private readonly accesos: Repository<AccesoMovil>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly parametros: ParametrosService,
    private readonly correo: CorreoService,
    private readonly bitacora: BitacoraService,
  ) {}

  // ───────────────────────── 1. Correo + contraseña ─────────────────────────
  async login(dto: LoginDto, userAgent: string, ip: string) {
    const usuario = await this.usuarios
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('lower(u.email) = lower(:email)', { email: dto.email.trim() })
      .getOne();

    const claveOk = usuario ? await bcrypt.compare(dto.password, usuario.passwordHash) : false;
    if (!usuario || !claveOk || !usuario.activo) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    // Desde el celular solo entra quien tiene un acceso aprobado y vigente
    if (ES_CELULAR.test(userAgent)) await this.exigirAccesoMovil(usuario.id);

    // Equipo de confianza: entra sin código
    if (dto.huella) {
      const disp = await this.dispositivos.findOne({
        where: { usuarioId: usuario.id, huellaHash: this.hash(dto.huella), revocadoAt: IsNull(), expiraAt: MoreThan(new Date()) },
      });
      if (disp) {
        await this.dispositivos.update(disp.id, { ultimoUsoAt: new Date() });
        return this.emitirSesion(usuario.id);
      }
    }

    // Equipo nuevo o pasaron 7 días: se envía un código al correo
    await this.enviarCodigo(usuario, ip);
    const desafio = await this.jwt.signAsync({ sub: usuario.id, tipo: 'desafio' }, { expiresIn: 15 * 60 });
    return { requiereCodigo: true, desafio, correo: this.ocultarCorreo(usuario.email) };
  }

  // ───────────────────────── 2. Código del correo ─────────────────────────
  async verificar(dto: VerificarDto, userAgent = '') {
    const usuarioId = await this.leerDesafio(dto.desafio);
    const maxIntentos = await this.parametros.numero('max_intentos_codigo', 5);

    const codigo = await this.codigos.findOne({
      where: { usuarioId, proposito: 'LOGIN', usadoAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    if (!codigo || codigo.expiraAt <= new Date()) {
      throw new UnauthorizedException('El código venció. Pide uno nuevo');
    }
    if (codigo.intentos >= maxIntentos) {
      throw new UnauthorizedException('Superaste los intentos permitidos. Pide un código nuevo');
    }

    if (!(await bcrypt.compare(dto.codigo, codigo.codigoHash))) {
      const intentos = codigo.intentos + 1;
      await this.codigos.update(codigo.id, { intentos });
      const quedan = maxIntentos - intentos;
      throw new UnauthorizedException(
        quedan > 0 ? `Código incorrecto. Te quedan ${quedan} intento(s)` : 'Superaste los intentos permitidos. Pide un código nuevo',
      );
    }

    await this.codigos.update(codigo.id, { usadoAt: new Date() });

    if (dto.recordar && dto.huella) {
      const dias = await this.parametros.numero('dias_dispositivo_confiable', 7);
      const expiraAt = new Date(Date.now() + dias * 86_400_000);
      const huellaHash = this.hash(dto.huella);
      const existente = await this.dispositivos.findOne({ where: { usuarioId, huellaHash } });
      if (existente) {
        await this.dispositivos.update(existente.id, { expiraAt, revocadoAt: null, ultimoUsoAt: new Date(), nombre: nombreDelEquipo(userAgent) });
      } else {
        await this.dispositivos.insert({ usuarioId, huellaHash, expiraAt, ultimoUsoAt: new Date(), nombre: nombreDelEquipo(userAgent) });
      }
    }
    return this.emitirSesion(usuarioId);
  }

  // ───────────────────────── 3. Reenviar código ─────────────────────────
  async reenviar(desafio: string, ip: string) {
    const usuarioId = await this.leerDesafio(desafio);
    const ultimo = await this.codigos.findOne({ where: { usuarioId, proposito: 'LOGIN' }, order: { createdAt: 'DESC' } });
    if (ultimo) {
      const segundos = Math.ceil(60 - (Date.now() - ultimo.createdAt.getTime()) / 1000);
      if (segundos > 0) {
        throw new HttpException(`Espera ${segundos} segundos para pedir otro código`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    const usuario = await this.usuarios.findOneByOrFail({ id: usuarioId });
    await this.enviarCodigo(usuario, ip);
    return { enviado: true, correo: this.ocultarCorreo(usuario.email) };
  }

  // ───────────────────────── 4. Perfil de la sesión ─────────────────────────
  async perfil(usuarioId: string) {
    const u = await this.usuarios.findOne({
      where: { id: usuarioId },
      relations: { rol: { permisos: true }, equipo: true },
    });
    if (!u || !u.activo) throw new UnauthorizedException('Tu usuario no está activo');
    return {
      id: u.id,
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email,
      rol: { codigo: u.rol.codigo, nombre: u.rol.nombre },
      equipo: u.equipo ? { id: u.equipo.id, nombre: u.equipo.nombre } : null,
      permisos: u.rol.permisos.map((p) => p.codigo).sort(),
      debeCambiarClave: u.claveTemporal,
      guiaVista: !!u.guiaVistaAt,
      /** Cambia cada vez que se cambia la foto (null = sin foto) */
      fotoVersion: u.fotoAt ? u.fotoAt.getTime() : null,
    };
  }

  // ───────────────────────── Ver el CRM como otro usuario (soporte) ─────────────────────────
  /**
   * Solo los correos de la variable CORREOS_SOPORTE (Jherson y Samuel), con rol de administrador.
   * Pueden ver cualquier pantalla tal como la ve otro usuario, sin poder cambiar nada (lo bloquea JwtAuthGuard).
   */
  async esSoporte(usuarioId: string): Promise<boolean> {
    const lista = (this.config.get<string>('CORREOS_SOPORTE') ?? '').split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (!lista.length) return false;
    const u = await this.usuarios.findOne({ where: { id: usuarioId }, relations: { rol: true } });
    return !!u?.activo && u.rol.codigo === 'ADMIN' && lista.includes(u.email.toLowerCase());
  }

  /** Datos del usuario en pantalla; en modo "ver como" dice quién está mirando */
  async yo(s: SesionUsuario) {
    const perfil = await this.perfil(s.sub);
    if (s.vistaDe) {
      const [admin] = await this.usuarios.query(`SELECT nombres || ' ' || apellidos AS nombre FROM usuarios WHERE id = $1`, [s.vistaDe]);
      // Mientras mira no se le pide cambiar contraseña ni se le muestra el recorrido al otro usuario
      return { ...perfil, debeCambiarClave: false, guiaVista: true, vista: { de: admin?.nombre ?? 'Soporte' }, puedeVerComo: false, soporte: false, rolElegido: false };
    }
    const soporte = await this.esSoporte(s.sub);
    // Soporte con otro rol elegido: la pantalla usa el rol y los permisos de la sesión, no los de su cuenta
    if (soporte && s.rolElegido && s.rol !== perfil.rol.codigo) {
      const r = await this.datosRol(s.rol);
      if (r) return { ...perfil, rol: { codigo: r.codigo, nombre: r.nombre }, permisos: r.permisos, guiaVista: true, vista: null, puedeVerComo: true, soporte, rolElegido: true };
    }
    return { ...perfil, vista: null, puedeVerComo: soporte, soporte, rolElegido: !!s.rolElegido };
  }

  // ───────────────────────── Soporte: elegir con qué rol entrar ─────────────────────────
  private async datosRol(codigo: string): Promise<{ codigo: string; nombre: string; permisos: string[] } | undefined> {
    const [r] = await this.usuarios.query(
      `SELECT r.codigo, r.nombre, COALESCE(array_agg(p.codigo ORDER BY p.codigo) FILTER (WHERE p.codigo IS NOT NULL), '{}') AS permisos
       FROM roles r LEFT JOIN rol_permisos rp ON rp.rol_id = r.id LEFT JOIN permisos p ON p.id = rp.permiso_id
       WHERE r.codigo = $1 GROUP BY r.codigo, r.nombre`, [codigo],
    );
    return r;
  }

  /** Equipos para entrar como supervisor o asesor */
  async equiposParaRol(s: SesionUsuario) {
    if (s.vistaDe || !(await this.esSoporte(s.sub))) throw new ForbiddenException('Esta opción es solo para soporte del CRM');
    return this.usuarios.query(`SELECT id, nombre FROM equipos WHERE activo ORDER BY nombre`);
  }

  /**
   * La cuenta de soporte entra con el rol que elija, con su propio usuario (no es solo lectura).
   * Supervisor y asesor necesitan un equipo: queda guardado en su cuenta. Su rol real sigue siendo administrador,
   * así que no aparece en los rankings ni en las listas de asesores.
   */
  async entrarConRol(s: SesionUsuario, rol: string, equipoId: string | undefined, ip: string) {
    if (s.vistaDe) throw new BadRequestException('Primero vuelve a tu cuenta');
    if (!(await this.esSoporte(s.sub))) throw new ForbiddenException('Esta opción es solo para soporte del CRM');
    const r = await this.datosRol(rol);
    if (!r) throw new BadRequestException('Rol no válido');
    const conEquipo = rol === 'SUPERVISOR' || rol === 'ASESOR';
    if (conEquipo) {
      if (!equipoId) throw new BadRequestException('Elige el equipo con el que vas a entrar');
      const [eq] = await this.usuarios.query(`SELECT 1 FROM equipos WHERE id = $1 AND activo`, [equipoId]);
      if (!eq) throw new BadRequestException('El equipo no existe');
    }
    await this.usuarios.query(`UPDATE usuarios SET equipo_id = $2 WHERE id = $1`, [s.sub, conEquipo ? equipoId : null]);
    await this.bitacora.registrar(s.sub, 'ROL_ELEGIR', { ip, detalle: { rol, ...(conEquipo ? { equipoId } : {}) } });
    return this.sesionConRol(s.sub, rol);
  }

  /** Token con el rol elegido (lo usan "entrar con rol" y "volver a mi cuenta") */
  private async sesionConRol(usuarioId: string, rol: string) {
    const perfil = await this.perfil(usuarioId);
    const r = (await this.datosRol(rol))!;
    const token = await this.jwt.signAsync(
      { sub: usuarioId, tipo: 'acceso', rol: r.codigo, equipoId: perfil.equipo?.id ?? null, permisos: r.permisos, rolElegido: true },
      { expiresIn: aSegundos(this.config.get('JWT_EXPIRES_IN'), 8 * 3600) },
    );
    const usuario = await this.yo({ sub: usuarioId, rol: r.codigo, equipoId: perfil.equipo?.id ?? null, permisos: r.permisos, rolElegido: true });
    return { requiereCodigo: false, token, usuario };
  }

  /** Usuarios activos que se pueden mirar, agrupados por rol en la pantalla */
  async usuariosParaVer(s: SesionUsuario) {
    if (s.vistaDe || !(await this.esSoporte(s.sub))) throw new ForbiddenException('Esta opción es solo para soporte del CRM');
    return this.usuarios.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, u.email, r.codigo AS rol, r.nombre AS "rolNombre", e.nombre AS equipo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos e ON e.id = u.equipo_id
       WHERE u.activo AND u.id <> $1
       ORDER BY CASE r.codigo WHEN 'ASESOR' THEN 1 WHEN 'SUPERVISOR' THEN 2 WHEN 'GERENTE' THEN 3 WHEN 'BACKOFFICE' THEN 4 ELSE 5 END,
                e.nombre NULLS LAST, u.nombres`, [s.sub],
    );
  }

  /** Token de solo lectura con los datos del otro usuario (vence en 2 horas) */
  async verComo(s: SesionUsuario, usuarioId: string, ip: string) {
    if (s.vistaDe) throw new BadRequestException('Primero vuelve a tu cuenta');
    if (!(await this.esSoporte(s.sub))) throw new ForbiddenException('Esta opción es solo para soporte del CRM');
    if (usuarioId === s.sub) throw new BadRequestException('Elige a otro usuario');
    const usuario = await this.perfil(usuarioId).catch(() => { throw new BadRequestException('El usuario no existe o no está activo'); });
    const token = await this.jwt.signAsync(
      { sub: usuario.id, tipo: 'acceso', rol: usuario.rol.codigo, equipoId: usuario.equipo?.id ?? null, permisos: usuario.permisos, vistaDe: s.sub },
      { expiresIn: 2 * 3600 },
    );
    await this.bitacora.registrar(s.sub, 'VISTA_INICIAR', { ip, entidad: 'USUARIO', entidadId: usuario.id, detalle: { email: usuario.email, rol: usuario.rol.codigo } });
    return { token, usuario: await this.yo({ ...s, sub: usuario.id, vistaDe: s.sub }) };
  }

  /** Vuelve a la sesión normal del administrador */
  async salirDeVista(s: SesionUsuario, ip: string) {
    if (!s.vistaDe) throw new BadRequestException('No estás viendo el CRM como otro usuario');
    await this.bitacora.registrar(s.vistaDe, 'VISTA_SALIR', { ip, entidad: 'USUARIO', entidadId: s.sub });
    // Vuelve como administrador, sin pasar otra vez por la elección de rol
    return this.sesionConRol(s.vistaDe, 'ADMIN');
  }

  async minutosInactividad() {
    return Math.max(0, await this.parametros.numero('minutos_inactividad_sesion', 7));
  }

  // ───────────────────────── Ayudantes ─────────────────────────
  /** También lo usa el perfil para dar un token nuevo al cambiar la contraseña */
  async emitirSesion(usuarioId: string) {
    const usuario = await this.perfil(usuarioId);
    const token = await this.jwt.signAsync(
      { sub: usuario.id, tipo: 'acceso', rol: usuario.rol.codigo, equipoId: usuario.equipo?.id ?? null, permisos: usuario.permisos },
      { expiresIn: aSegundos(this.config.get('JWT_EXPIRES_IN'), 8 * 3600) },
    );
    // Igual que /auth/yo: así la opción "ver como" aparece apenas entra, sin recargar la página
    const soporte = await this.esSoporte(usuario.id);
    return { requiereCodigo: false, token, usuario: { ...usuario, vista: null, puedeVerComo: soporte, soporte, rolElegido: false } };
  }

  private async enviarCodigo(usuario: Usuario, ip: string) {
    const minutos = await this.parametros.numero('minutos_validez_codigo', 10);
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');

    // Los códigos anteriores sin usar dejan de servir
    await this.codigos.update(
      { usuarioId: usuario.id, proposito: 'LOGIN', usadoAt: IsNull(), expiraAt: MoreThan(new Date()) },
      { expiraAt: new Date(Date.now() + 1000) },
    );
    await this.codigos.insert({
      usuarioId: usuario.id,
      proposito: 'LOGIN',
      codigoHash: await bcrypt.hash(codigo, 8),
      expiraAt: new Date(Date.now() + minutos * 60_000),
      ip: ip || null,
    });

    await this.correo.enviar(
      usuario.email,
      `${codigo} es tu código de Growvia CRM`,
      `Hola ${usuario.nombres}:\n\nTu código para ingresar al CRM es ${codigo}. Vence en ${minutos} minutos.\n` +
        `Si no intentaste ingresar, avisa a tu supervisor.`,
      plantillaCorreo({
        resumen: `Tu código es ${codigo}. Vence en ${minutos} minutos.`,
        titulo: 'Tu código para ingresar',
        saludo: `Hola ${escapar(usuario.nombres)}:`,
        parrafos: ['Escribe este código en la pantalla de ingreso del CRM para terminar de iniciar sesión.'],
        destacado: { etiqueta: 'Código de ingreso', valor: codigo, nota: `Vence en ${minutos} minutos` },
        aviso: 'Si no intentaste ingresar, no compartas este código y avisa a tu supervisor.',
      }),
    );
  }

  private async exigirAccesoMovil(usuarioId: string) {
    const ahora = new Date();
    const vigente = await this.accesos.findOne({
      where: { usuarioId, estado: 'APROBADA', desde: LessThanOrEqual(ahora), hasta: MoreThan(ahora) },
    });
    if (!vigente) {
      const pendiente = await this.accesos.findOne({ where: { usuarioId, estado: 'PENDIENTE' } });
      throw new ForbiddenException({
        codigo: 'MOVIL_BLOQUEADO',
        message: 'Tu cuenta no tiene acceso desde el celular. Solicítalo a gerencia.',
        // Permiso de 15 minutos para pedir el acceso desde esta misma pantalla (ya validó su contraseña)
        permiso: await this.jwt.signAsync({ sub: usuarioId, tipo: 'solicitud-movil' }, { expiresIn: 15 * 60 }),
        pendienteDesde: pendiente?.createdAt ?? null,
      });
    }
  }

  private async leerDesafio(desafio: string): Promise<string> {
    try {
      const p = await this.jwt.verifyAsync(desafio);
      if (p.tipo !== 'desafio') throw new Error();
      return p.sub;
    } catch {
      throw new UnauthorizedException('La verificación venció. Vuelve a ingresar tu contraseña');
    }
  }

  private hash(valor: string) {
    return createHash('sha256').update(valor).digest('hex');
  }

  private ocultarCorreo(email: string) {
    const [local, dominio] = email.split('@');
    return `${local[0]}•••${local.length > 1 ? local[local.length - 1] : ''}@${dominio}`;
  }
}
