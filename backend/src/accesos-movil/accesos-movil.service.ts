import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { BitacoraService } from '../bitacora/bitacora.service';
import { CorreoService } from '../correo/correo.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

const Z = `'America/Lima'`;
export const MAX_DIAS = 30;

/** TypeORM devuelve [filas, cantidad] en UPDATE ... RETURNING */
const filasDe = <T>(x: unknown[]): T[] => (Array.isArray(x[0]) ? x[0] : x) as T[];

/** "miércoles 14 de octubre (incluido)": el acceso termina al final de ese día */
const fechaLarga = (d: Date | string) =>
  `${new Date(new Date(d).getTime() - 1).toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')} (incluido)`;

/** Columnas de cada solicitud para las pantallas */
const COLUMNAS = `
  a.id, a.estado, a.motivo, a.dias_solicitados AS "diasSolicitados", a.respuesta, a.desde, a.hasta,
  a.created_at AS "solicitadoAt", a.respondido_at AS "respondidoAt", a.revocado_at AS "revocadoAt",
  a.usuario_id AS "usuarioId", u.nombres || ' ' || u.apellidos AS usuario, r.nombre AS rol, eq.nombre AS equipo,
  ap.nombres || ' ' || ap.apellidos AS "aprobadoPor", rv.nombres || ' ' || rv.apellidos AS "revocadoPor"`;
const UNIONES = `
  FROM accesos_moviles a
  JOIN usuarios u ON u.id = a.usuario_id JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos eq ON eq.id = u.equipo_id
  LEFT JOIN usuarios ap ON ap.id = a.aprobado_por LEFT JOIN usuarios rv ON rv.id = a.revocado_por`;

/**
 * Acceso al CRM desde el celular. Bloqueado por defecto.
 *  - El usuario lo pide (desde el mismo celular al intentar entrar, o desde su perfil en la computadora).
 *  - Gerencia aprueba con fecha de fin (máximo 30 días), rechaza o revoca. También puede darlo directamente.
 *  - Al vencer o al revocarse, el celular queda fuera en su siguiente acción (lo revisa JwtAuthGuard).
 */
@Injectable()
export class AccesosMovilService {
  private readonly log = new Logger('AccesoCelular');

  constructor(
    private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly notificaciones: NotificacionesService,
    private readonly correo: CorreoService,
    private readonly bitacora: BitacoraService,
  ) {}

  // ───────────── Solicitar ─────────────
  /** Desde el celular bloqueado: el login entregó un permiso temporal para pedir acceso */
  async solicitarDesdeCelular(permiso: string, motivo: string, dias: number, ip?: string) {
    let usuarioId: string;
    try {
      const p = await this.jwt.verifyAsync(permiso);
      if (p.tipo !== 'solicitud-movil') throw new Error();
      usuarioId = p.sub;
    } catch {
      throw new UnauthorizedException('Pasó mucho tiempo. Vuelve a ingresar tu correo y contraseña para enviar la solicitud.');
    }
    const r = await this.crear(usuarioId, motivo, dias);
    await this.bitacora.registrar(usuarioId, 'ACCESO_MOVIL_SOLICITAR', { ip, entidad: 'ACCESO', entidadId: r.id, detalle: { dias, desde: 'celular' } });
    return r;
  }

  /** Desde la computadora, con sesión (su perfil) */
  solicitar(motivo: string, dias: number, s: SesionUsuario) {
    return this.crear(s.sub, motivo, dias);
  }

  private async crear(usuarioId: string, motivo: string, dias: number) {
    const [u] = await this.db.query(
      `SELECT u.nombres || ' ' || u.apellidos AS nombre, u.activo,
              (SELECT hasta FROM accesos_moviles WHERE usuario_id = u.id AND estado = 'APROBADA' AND hasta > now()) AS vigente
       FROM usuarios u WHERE u.id = $1`, [usuarioId],
    );
    if (!u?.activo) throw new BadRequestException('Tu usuario no está activo');
    // Con acceso vigente solo se puede pedir la renovación en los últimos 3 días
    if (u.vigente && new Date(u.vigente).getTime() - Date.now() > 3 * 86400_000) {
      throw new BadRequestException(`Ya tienes acceso desde el celular hasta el ${fechaLarga(u.vigente)}.`);
    }
    let id: string;
    try {
      [{ id }] = await this.db.query(
        `INSERT INTO accesos_moviles (usuario_id, motivo, dias_solicitados) VALUES ($1, $2, $3) RETURNING id`,
        [usuarioId, motivo.trim(), dias],
      );
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Ya tienes una solicitud pendiente. Gerencia te avisará cuando la revise.');
      throw e;
    }
    const gerentes: { id: string }[] = await this.db.query(
      `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.codigo = 'GERENTE' AND u.activo`,
    );
    for (const g of gerentes) {
      await this.notificaciones.crear(g.id, {
        tipo: 'ACCESO_MOVIL', titulo: 'Solicitud de acceso desde celular',
        mensaje: `${u.nombre} pide acceso por ${dias} ${dias === 1 ? 'día' : 'días'}: “${motivo.trim()}”`, entidad: 'ACCESO', entidadId: id,
      });
    }
    return { id, estado: 'PENDIENTE' as const };
  }

  /** Estado del propio usuario (para su perfil) */
  async mio(s: SesionUsuario) {
    const filas = await this.db.query(`SELECT ${COLUMNAS} ${UNIONES} WHERE a.usuario_id = $1 ORDER BY a.created_at DESC LIMIT 6`, [s.sub]);
    return {
      vigente: filas.find((f: { estado: string; hasta: string }) => f.estado === 'APROBADA' && new Date(f.hasta) > new Date()) ?? null,
      pendiente: filas.find((f: { estado: string }) => f.estado === 'PENDIENTE') ?? null,
      historial: filas,
      maxDias: MAX_DIAS,
    };
  }

  // ───────────── Gerencia ─────────────
  async listar(vista: 'pendientes' | 'vigentes' | 'historial') {
    const filtro = vista === 'pendientes' ? `a.estado = 'PENDIENTE'`
      : vista === 'vigentes' ? `a.estado = 'APROBADA' AND a.hasta > now()`
      : `a.estado NOT IN ('PENDIENTE')`;
    const orden = vista === 'vigentes' ? 'a.hasta' : vista === 'pendientes' ? 'a.created_at' : 'COALESCE(a.revocado_at, a.respondido_at, a.created_at) DESC';
    const filas = await this.db.query(`SELECT ${COLUMNAS} ${UNIONES} WHERE ${filtro} ORDER BY ${orden} LIMIT 200`);
    const [c] = await this.db.query(
      `SELECT count(*) FILTER (WHERE estado = 'PENDIENTE')::int AS pendientes,
              count(*) FILTER (WHERE estado = 'APROBADA' AND hasta > now())::int AS vigentes
       FROM accesos_moviles`,
    );
    return { filas, contadores: c, maxDias: MAX_DIAS };
  }

  /** Usuarios a los que gerencia puede dar acceso directamente */
  usuarios() {
    return this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, r.nombre AS rol, eq.nombre AS equipo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos eq ON eq.id = u.equipo_id
       WHERE u.activo AND r.codigo <> 'ADMIN' ORDER BY u.nombres, u.apellidos`,
    );
  }

  async aprobar(id: string, hasta: string, respuesta: string | undefined, s: SesionUsuario) {
    const a = await this.db.transaction(async (tx) => {
      const [p] = await tx.query(`SELECT usuario_id AS "usuarioId", estado FROM accesos_moviles WHERE id = $1 FOR UPDATE`, [id]);
      if (!p) throw new NotFoundException('La solicitud no existe');
      if (p.estado !== 'PENDIENTE') throw new BadRequestException('Esta solicitud ya fue atendida');
      await this.reemplazarVigente(tx, p.usuarioId, s);
      const [r] = filasDe<{ usuarioId: string; hasta: string }>(await tx.query(
        `UPDATE accesos_moviles SET estado = 'APROBADA', aprobado_por = $2, desde = now(), hasta = ${this.finDe('$3')},
                respuesta = $4, respondido_at = now(), aviso_vencimiento = false
         WHERE id = $1 RETURNING usuario_id AS "usuarioId", hasta`,
        [id, s.sub, this.validarFecha(hasta), respuesta?.trim() || null],
      ));
      return r;
    });
    await this.avisar(a.usuarioId, '¡Ya puedes entrar desde tu celular!',
      `Gerencia aprobó tu acceso desde el celular hasta el ${fechaLarga(a.hasta)}.${respuesta?.trim() ? ` Nota: “${respuesta.trim()}”` : ''}`);
    return { ok: true, hasta: a.hasta };
  }

  async rechazar(id: string, respuesta: string, s: SesionUsuario) {
    const [r] = await this.db.query(
      `UPDATE accesos_moviles SET estado = 'RECHAZADA', aprobado_por = $2, respuesta = $3, respondido_at = now()
       WHERE id = $1 AND estado = 'PENDIENTE' RETURNING usuario_id AS "usuarioId"`, [id, s.sub, respuesta.trim()],
    ).then((x: unknown[]) => filasDe<{ usuarioId: string }>(x));
    if (!r) throw new BadRequestException('Esta solicitud ya fue atendida o no existe');
    await this.avisar(r.usuarioId, 'Solicitud de acceso desde celular rechazada', `Gerencia no aprobó tu acceso desde el celular: “${respuesta.trim()}”`);
    return { ok: true };
  }

  async revocar(id: string, respuesta: string | undefined, s: SesionUsuario) {
    const [r] = await this.db.query(
      `UPDATE accesos_moviles SET estado = 'REVOCADA', revocado_por = $2, revocado_at = now(), respuesta = COALESCE($3, respuesta)
       WHERE id = $1 AND estado = 'APROBADA' RETURNING usuario_id AS "usuarioId"`, [id, s.sub, respuesta?.trim() || null],
    ).then((x: unknown[]) => filasDe<{ usuarioId: string }>(x));
    if (!r) throw new BadRequestException('Este acceso ya no está vigente');
    await this.avisar(r.usuarioId, 'Se retiró tu acceso desde el celular',
      `Gerencia retiró tu acceso al CRM desde el celular.${respuesta?.trim() ? ` Motivo: “${respuesta.trim()}”` : ''} Sigue usándolo desde la computadora.`);
    return { ok: true };
  }

  /** Gerencia da acceso sin que lo pidan (si había una solicitud pendiente, la aprueba) */
  async otorgar(usuarioId: string, hasta: string, motivo: string, s: SesionUsuario) {
    const [pendiente] = await this.db.query(`SELECT id FROM accesos_moviles WHERE usuario_id = $1 AND estado = 'PENDIENTE'`, [usuarioId]);
    if (pendiente) return this.aprobar(pendiente.id, hasta, motivo, s);
    const [u] = await this.db.query(
      `SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 AND u.activo AND r.codigo <> 'ADMIN'`, [usuarioId],
    );
    if (!u) throw new NotFoundException('El usuario no existe o no está activo');
    const a = await this.db.transaction(async (tx) => {
      await this.reemplazarVigente(tx, usuarioId, s);
      const [r] = await tx.query(
        `INSERT INTO accesos_moviles (usuario_id, motivo, estado, aprobado_por, desde, hasta, respondido_at)
         VALUES ($1, $2, 'APROBADA', $3, now(), ${this.finDe('$4')}, now()) RETURNING hasta`,
        [usuarioId, `Otorgado por gerencia: ${motivo.trim()}`, s.sub, this.validarFecha(hasta)],
      );
      return r as { hasta: string };
    });
    await this.avisar(usuarioId, '¡Ya puedes entrar desde tu celular!', `Gerencia te dio acceso desde el celular hasta el ${fechaLarga(a.hasta)}.`);
    return { ok: true, hasta: a.hasta };
  }

  // ───────────── Vencimientos (cada hora) ─────────────
  @Cron('0 7 * * * *', { timeZone: 'America/Lima' })
  async revisarVencimientos() {
    try {
      const vencidos: { usuarioId: string }[] = await this.db.query(
        `UPDATE accesos_moviles SET estado = 'VENCIDA' WHERE estado = 'APROBADA' AND hasta <= now() RETURNING usuario_id AS "usuarioId"`,
      ).then((x: unknown[]) => filasDe<{ usuarioId: string }>(x));
      for (const v of vencidos) {
        await this.notificaciones.crear(v.usuarioId, {
          tipo: 'ACCESO_MOVIL', titulo: 'Venció tu acceso desde el celular', mensaje: 'Si lo sigues necesitando, pide uno nuevo desde tu perfil.',
        });
      }
      const porVencer: { usuarioId: string; hasta: string }[] = await this.db.query(
        `UPDATE accesos_moviles SET aviso_vencimiento = true
         WHERE estado = 'APROBADA' AND NOT aviso_vencimiento AND hasta <= now() + interval '2 days' AND hasta > now()
         RETURNING usuario_id AS "usuarioId", hasta`,
      ).then((x: unknown[]) => filasDe<{ usuarioId: string; hasta: string }>(x));
      for (const p of porVencer) {
        await this.notificaciones.crear(p.usuarioId, {
          tipo: 'ACCESO_MOVIL', titulo: 'Tu acceso desde el celular vence pronto',
          mensaje: `Vence el ${fechaLarga(p.hasta)}. Si lo necesitas, pide la renovación desde tu perfil.`,
        });
      }
      if (vencidos.length || porVencer.length) this.log.log(`${vencidos.length} vencidos, ${porVencer.length} avisados`);
    } catch (e) {
      this.log.error(`Error revisando vencimientos: ${(e as Error).message}`);
    }
  }

  // ───────────── Ayudantes ─────────────
  /** Fin del día elegido (hora de Lima), sin pasar de 30 días desde ahora */
  private finDe(param: string) {
    return `LEAST((((${param})::date + 1)::timestamp AT TIME ZONE ${Z}), now() + interval '${MAX_DIAS} days')`;
  }

  /** AAAA-MM-DD entre hoy y hoy + 30 días */
  private validarFecha(f: string) {
    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    const max = new Date(Date.parse(`${hoy}T12:00:00Z`) + MAX_DIAS * 86400_000).toISOString().slice(0, 10);
    if (f < hoy) throw new BadRequestException('La fecha de fin no puede ser anterior a hoy');
    if (f > max) throw new BadRequestException(`El acceso puede durar como máximo ${MAX_DIAS} días`);
    return f;
  }

  /** Un solo acceso aprobado por usuario: el anterior queda revocado */
  private reemplazarVigente(tx: EntityManager, usuarioId: string, s: SesionUsuario) {
    return tx.query(
      `UPDATE accesos_moviles SET estado = 'REVOCADA', revocado_por = $2, revocado_at = now(), respuesta = COALESCE(respuesta, 'Reemplazado por un acceso nuevo')
       WHERE usuario_id = $1 AND estado = 'APROBADA'`, [usuarioId, s.sub],
    );
  }

  /** Campanita y correo (lo verá en el celular aunque no tenga el CRM abierto) */
  private async avisar(usuarioId: string, titulo: string, mensaje: string) {
    await this.notificaciones.crear(usuarioId, { tipo: 'ACCESO_MOVIL', titulo, mensaje });
    const [u] = await this.db.query(`SELECT email, nombres FROM usuarios WHERE id = $1`, [usuarioId]);
    if (u) await this.correo.enviar(u.email, titulo, `Hola ${u.nombres}:\n\n${mensaje}\n\nGrowvia CRM`).catch(() => undefined);
  }
}