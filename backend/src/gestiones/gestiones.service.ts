import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { AgendaDto } from './dto/agenda.dto';
import { CrearGestionDto } from './dto/crear-gestion.dto';
import { ReprogramarDto } from './dto/reprogramar.dto';

const ZONA = 'America/Lima';
const UN_ANIO_MS = 366 * 24 * 60 * 60 * 1000;

/** Columnas de una gestión para la línea de tiempo y la agenda */
const COLUMNAS = `
  g.id, g.cliente_id AS "clienteId", c.razon_social AS "razonSocial", g.oportunidad_id AS "oportunidadId", o.codigo AS "codigoNegociacion",
  g.canal, g.resultado, g.comentario, g.proxima_accion AS "proximaAccion", g.proximo_canal AS "proximoCanal",
  g.proxima_hecha_at AS "proximaHechaAt", g.reprogramaciones, g.created_at AS fecha,
  u.nombres || ' ' || u.apellidos AS usuario`;
const UNIONES = `
  FROM gestiones g
  JOIN clientes c ON c.id = g.cliente_id
  JOIN usuarios u ON u.id = g.usuario_id
  LEFT JOIN oportunidades o ON o.id = g.oportunidad_id`;

@Injectable()
export class GestionesService {
  constructor(private readonly db: DataSource) {}

  // ───────────── Registrar una gestión (solo el asesor a cargo) ─────────────
  async crear(dto: CrearGestionDto, s: SesionUsuario) {
    const [cliente] = await this.db.query(`SELECT asesor_id AS "asesorId" FROM clientes WHERE id = $1`, [dto.clienteId]);
    if (!cliente) throw new NotFoundException('La empresa no existe');
    if (cliente.asesorId !== s.sub) throw new ForbiddenException('Solo el asesor a cargo puede registrar gestiones de esta empresa');
    if (dto.proximaAccion) this.validarFecha(dto.proximaAccion);

    const id = await this.db.transaction(async (tx) => {
      // La gestión que estaba agendada para esta empresa queda hecha
      await tx.query(
        `UPDATE gestiones SET proxima_hecha_at = now()
         WHERE cliente_id = $1 AND proxima_accion IS NOT NULL AND proxima_hecha_at IS NULL`,
        [dto.clienteId],
      );
      const [g] = await tx.query(
        `INSERT INTO gestiones (cliente_id, oportunidad_id, usuario_id, canal, resultado, comentario, proxima_accion, proximo_canal)
         VALUES ($1, (SELECT id FROM oportunidades WHERE cliente_id = $1 AND resultado = 'EN_CURSO'), $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [dto.clienteId, s.sub, dto.canal, dto.resultado, dto.comentario.trim(),
          dto.proximaAccion ?? null, dto.proximaAccion ? dto.proximoCanal : null],
      );
      await tx.query(`UPDATE clientes SET ultima_gestion_at = now(), updated_at = now() WHERE id = $1`, [dto.clienteId]);
      return g.id as string;
    });
    const [creada] = await this.db.query(`SELECT ${COLUMNAS} ${UNIONES} WHERE g.id = $1`, [id]);
    return creada;
  }

  // ───────────── Línea de tiempo de una empresa ─────────────
  async deEmpresa(clienteId: string, s: SesionUsuario) {
    const [c] = await this.db.query(
      `SELECT c.asesor_id AS "asesorId", u.equipo_id AS "equipoId"
       FROM clientes c LEFT JOIN usuarios u ON u.id = c.asesor_id WHERE c.id = $1`, [clienteId],
    );
    if (!c) throw new NotFoundException('La empresa no existe');
    if (!this.puedeVer(s, c.asesorId, c.equipoId)) throw new ForbiddenException('No tienes acceso a las gestiones de esta empresa');
    const filas = await this.db.query(
      `SELECT ${COLUMNAS} ${UNIONES} WHERE g.cliente_id = $1 ORDER BY g.created_at DESC LIMIT 100`, [clienteId],
    );
    return { filas, puedeRegistrar: c.asesorId === s.sub && s.permisos.includes('NEGOCIACION_GESTIONAR') };
  }

  // ───────────── Agenda del usuario (rango de días + atrasadas) ─────────────
  async agenda(f: AgendaDto, s: SesionUsuario) {
    const desde = new Date(`${f.desde}T00:00:00`);
    const hasta = new Date(`${f.hasta}T00:00:00`);
    if (isNaN(+desde) || isNaN(+hasta) || hasta < desde) throw new BadRequestException('Rango de fechas no válido');
    if ((+hasta - +desde) / 86_400_000 > 62) throw new BadRequestException('El rango máximo es de 2 meses');

    // Lo agendado en el rango (pendiente o hecho), contado en hora de Lima
    const items = await this.db.query(
      `SELECT ${COLUMNAS} ${UNIONES}
       WHERE g.usuario_id = $1 AND g.proxima_accion IS NOT NULL
         -- lo pendiente solo cuenta si la empresa sigue siendo suya (si se liberó o reasignó, sale de su agenda)
         AND (g.proxima_hecha_at IS NOT NULL OR c.asesor_id = g.usuario_id)
         AND g.proxima_accion >= ($2::date)::timestamp AT TIME ZONE '${ZONA}'
         AND g.proxima_accion <  ($3::date + 1)::timestamp AT TIME ZONE '${ZONA}'
       ORDER BY g.proxima_accion`,
      [s.sub, f.desde, f.hasta],
    );
    // Atrasadas: pendientes de días anteriores a hoy
    const atrasadas = await this.db.query(
      `SELECT ${COLUMNAS} ${UNIONES}
       WHERE g.usuario_id = $1 AND g.proxima_accion IS NOT NULL AND g.proxima_hecha_at IS NULL
         AND c.asesor_id = g.usuario_id
         AND g.proxima_accion < date_trunc('day', now() AT TIME ZONE '${ZONA}') AT TIME ZONE '${ZONA}'
       ORDER BY g.proxima_accion LIMIT 100`,
      [s.sub],
    );
    return { items, atrasadas };
  }

  // ───────────── Reprogramar ("llámame en diciembre") ─────────────
  async reprogramar(id: string, dto: ReprogramarDto, s: SesionUsuario) {
    this.validarFecha(dto.proximaAccion);
    const [g] = await this.db.query(
      `SELECT g.usuario_id AS "usuarioId", g.proxima_accion AS "proximaAccion", g.proxima_hecha_at AS "hecha", c.asesor_id AS "duenoId"
       FROM gestiones g JOIN clientes c ON c.id = g.cliente_id WHERE g.id = $1`, [id],
    );
    if (!g) throw new NotFoundException('La gestión no existe');
    if (g.usuarioId !== s.sub || g.duenoId !== s.sub) throw new ForbiddenException('Solo puedes reprogramar gestiones de tus empresas');
    if (!g.proximaAccion) throw new BadRequestException('Esta gestión no tiene una próxima acción agendada');
    if (g.hecha) throw new BadRequestException('Esta gestión ya se hizo; registra una nueva para agendar otra');

    await this.db.query(
      `UPDATE gestiones SET proxima_accion = $1, proximo_canal = COALESCE($2, proximo_canal),
              reprogramaciones = reprogramaciones + 1, recordatorio_enviado = false, atraso_avisado = false
       WHERE id = $3`,
      [dto.proximaAccion, dto.proximoCanal ?? null, id],
    );
    const [act] = await this.db.query(`SELECT ${COLUMNAS} ${UNIONES} WHERE g.id = $1`, [id]);
    return act;
  }

  // ───────────── Ayudantes ─────────────
  private validarFecha(fecha: Date) {
    const ms = +fecha;
    if (ms < Date.now() - 5 * 60_000) throw new BadRequestException('La próxima acción debe ser una fecha futura');
    if (ms > Date.now() + UN_ANIO_MS) throw new BadRequestException('La próxima acción no puede ser a más de un año');
  }

  /** Asesor: lo suyo · Supervisor: su equipo · Gerencia, back office y admin: todo */
  private puedeVer(s: SesionUsuario, asesorId: string | null, equipoId: string | null) {
    if (['GERENTE', 'BACKOFFICE', 'ADMIN'].includes(s.rol)) return true;
    if (s.rol === 'SUPERVISOR') return !!equipoId && equipoId === s.equipoId;
    return asesorId === s.sub;
  }
}