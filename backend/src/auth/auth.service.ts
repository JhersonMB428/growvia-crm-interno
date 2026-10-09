import {
  ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomInt } from 'crypto';
import { IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { CorreoService } from '../correo/correo.service';
import { ParametrosService } from '../sistema/parametros.service';
import { Usuario } from '../usuarios/entities/usuario.entity';
import { nombreDelEquipo } from './clave';
import { LoginDto } from './dto/login.dto';
import { VerificarDto } from './dto/verificar.dto';
import { AccesoMovil } from './entities/acceso-movil.entity';
import { CodigoVerificacion } from './entities/codigo-verificacion.entity';
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

  // ───────────────────────── Ayudantes ─────────────────────────
  /** También lo usa el perfil para dar un token nuevo al cambiar la contraseña */
  async emitirSesion(usuarioId: string) {
    const usuario = await this.perfil(usuarioId);
    const token = await this.jwt.signAsync(
      { sub: usuario.id, tipo: 'acceso', rol: usuario.rol.codigo, equipoId: usuario.equipo?.id ?? null, permisos: usuario.permisos },
      { expiresIn: aSegundos(this.config.get('JWT_EXPIRES_IN'), 8 * 3600) },
    );
    return { requiereCodigo: false, token, usuario };
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
      `<p>Hola ${usuario.nombres}:</p><p>Tu código para ingresar al CRM es</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px">${codigo}</p>` +
        `<p>Vence en ${minutos} minutos. Si no intentaste ingresar, avisa a tu supervisor.</p>`,
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
