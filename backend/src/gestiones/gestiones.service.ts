import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { LiberacionService, MotivoLiberacion } from '../empresas/liberacion.service';
import { RetencionService } from '../empresas/retencion';
import { AgendaDto } from './dto/agenda.dto';
import { CrearGestionDto } from './dto/crear-gestion.dto';
import { ReprogramarDto } from './dto/reprogramar.dto';

const ZONA = 'America/Lima';
const UN_ANIO_MS = 366 * 24 * 60 * 60 * 1000;

/** Columnas de una gestión para la línea de tiempo y la agenda */
const COLUMNAS = `
  g.id, g.cliente_id AS "clienteId", c.razon_social AS "razonSocial", g.oportunidad_id AS "oportunidadId", o.codigo AS "codigoNegociacion",
  g.canal, g.resultado, g.comentario, g.proxima_accion AS "proximaAccion", g.proximo_canal AS "proximoCanal",
  g.proxima_hecha_at AS "proximaHechaAt", g.reprogramaciones, g.created_at AS fecha, g.segundos_ficha AS "segundosFicha",
  u.nombres || ' ' || u.apellidos AS usuario,
  g.contacto_id AS "contactoId", k.nombre AS contacto, k.cargo AS "contactoCargo", g.medio`;
const UNIONES = `
  FROM gestiones g
  JOIN clientes c ON c.id = g.cliente_id
  JOIN usuarios u ON u.id = g.usuario_id
  LEFT JOIN oportunidades o ON o.id = g.oportunidad_id
  LEFT JOIN contactos k ON k.id = g.contacto_id`;

@Injectable()
export class GestionesService {
  constructor(
    private readonly db: DataSource,
    private readonly retencion: RetencionService,
    private readonly liberacion: LiberacionService,
  ) {}

  // ───────────── Registrar una gestión (solo el asesor a cargo) ─────────────
  /**
   * Además de guardar la gestión:
   *  - Calcula el tiempo que el asesor pasó en la ficha desde su gestión anterior.
   *  - "No interesado": la empresa vuelve al repositorio y nadie la puede tomar por un tiempo.
   *  - Varios días seguidos sin respuesta: la empresa vuelve al repositorio para otro asesor.
   *  - En los demás casos renueva el plazo de liberación.
   */
  async crear(dto: CrearGestionDto, s: SesionUsuario) {
    if (dto.proximaAccion) this.validarFecha(dto.proximaAccion);
    const reglas = await this.retencion.reglas();

    const { id, liberada, retencionHasta } = await this.db.transaction(async (tx) => {
      const [cliente] = await tx.query(
        `SELECT c.asesor_id AS "asesorId", c.asignado_at AS "asignadoAt", c.estado,
                EXISTS (SELECT 1 FROM oportunidades o WHERE o.cliente_id = c.id AND o.resultado = 'GANADA' AND o.estado_venta <> 'ANULADA') AS ganada,
                EXISTS (SELECT 1 FROM oportunidades o WHERE o.cliente_id = c.id AND o.resultado = 'EN_CURSO') AS negociando
         FROM clientes c WHERE c.id = $1 FOR UPDATE OF c`, [dto.clienteId],
      );
      if (!cliente) throw new NotFoundException('La empresa no existe');
      if (cliente.asesorId !== s.sub) throw new ForbiddenException('Solo el asesor a cargo puede registrar gestiones de esta empresa');
      const desde = cliente.asignadoAt ?? new Date(0);

      // La gestión que estaba agendada para esta empresa queda hecha
      await tx.query(
        `UPDATE gestiones SET proxima_hecha_at = now()
         WHERE cliente_id = $1 AND proxima_accion IS NOT NULL AND proxima_hecha_at IS NULL`,
        [dto.clienteId],
      );
      // Cierra el tramo de la visita abierta hasta este momento (si el último pulso fue hace menos de 40 s)
      await tx.query(
        `UPDATE visitas_ficha
         SET segundos = segundos + LEAST(GREATEST(extract(epoch FROM now() - ultimo_pulso), 0), 40)::int, ultimo_pulso = now()
         WHERE usuario_id = $1 AND cliente_id = $2 AND ultimo_pulso > now() - interval '40 seconds'`,
        [s.sub, dto.clienteId],
      );
      // Tiempo en la ficha: todo lo acumulado desde que la tiene, menos lo que ya se contó en sus gestiones anteriores
      const [{ segundos }] = await tx.query(
        `SELECT GREATEST(
                  COALESCE((SELECT sum(segundos) FROM visitas_ficha WHERE usuario_id = $1 AND cliente_id = $2 AND inicio >= $3), 0)
                - COALESCE((SELECT sum(segundos_ficha) FROM gestiones WHERE usuario_id = $1 AND cliente_id = $2 AND created_at >= $3), 0),
                0)::int AS segundos`,
        [s.sub, dto.clienteId, desde],
      );
      const comentario = dto.comentario?.trim() || (dto.resultado === 'RECHAZA' ? 'No está interesado.' : 'No contestó.');
      if (dto.contactoId) {
        const [k] = await tx.query(`SELECT 1 FROM contactos WHERE id = $1 AND cliente_id = $2`, [dto.contactoId, dto.clienteId]);
        if (!k) throw new BadRequestException('Esa persona no es de esta empresa');
      }
      const medio = dto.medio?.trim() ? (dto.medio.includes('@') ? dto.medio.trim().toLowerCase() : dto.medio.replace(/\D/g, '')) : null;
      const [g] = await tx.query(
        `INSERT INTO gestiones (cliente_id, oportunidad_id, usuario_id, canal, resultado, comentario, proxima_accion, proximo_canal, segundos_ficha,
                                contacto_id, medio)
         VALUES ($1, (SELECT id FROM oportunidades WHERE cliente_id = $1 AND resultado = 'EN_CURSO'), $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [dto.clienteId, s.sub, dto.canal, dto.resultado, comentario,
          dto.proximaAccion ?? null, dto.proximaAccion ? dto.proximoCanal : null, segundos, dto.contactoId ?? null, medio || null],
      );
      // El número o correo usado queda marcado: contestaron → funciona; no contestaron → no contesta (si no se sabía que funcionaba)
      if (medio && dto.resultado !== 'OTRO') {
        const contesto = dto.resultado !== 'NO_CONTESTA';
        await tx.query(
          `UPDATE medios_contacto SET estado = $4, actualizado_por = $5, actualizado_at = now()
           WHERE cliente_id = $1 AND tipo = $2 AND valor = $3 AND ($6 OR estado IN ('SIN_PROBAR', 'NO_CONTESTA'))`,
          [dto.clienteId, medio.includes('@') ? 'CORREO' : 'TELEFONO', medio, contesto ? 'FUNCIONA' : 'NO_CONTESTA', s.sub, contesto],
        );
      }
      await tx.query(`UPDATE clientes SET ultima_gestion_at = now(), prorrogada = false, updated_at = now() WHERE id = $1`, [dto.clienteId]);

      // Las ventas no se liberan nunca
      const liberable = cliente.estado === 'PROSPECTO' && !cliente.ganada;
      let motivo: MotivoLiberacion | null = null;
      if (liberable && dto.resultado === 'RECHAZA') {
        motivo = 'RECHAZO';
      } else if (liberable && dto.resultado === 'NO_CONTESTA' && !cliente.negociando) {
        // Días distintos seguidos sin respuesta (varias llamadas el mismo día cuentan como un intento)
        const [{ intentos }] = await tx.query(
          `SELECT count(DISTINCT (created_at AT TIME ZONE '${ZONA}')::date)::int AS intentos FROM gestiones
           WHERE cliente_id = $1 AND usuario_id = $2 AND created_at >= $3 AND resultado = 'NO_CONTESTA'
             AND created_at > COALESCE((SELECT max(created_at) FROM gestiones WHERE cliente_id = $1 AND usuario_id = $2
                                        AND created_at >= $3 AND resultado <> 'NO_CONTESTA'), '-infinity')`,
          [dto.clienteId, s.sub, desde],
        );
        if (intentos >= reglas.maxIntentosSinRespuesta) motivo = 'SIN_RESPUESTA';
      }
      if (motivo) {
        await this.liberacion.liberar(tx, dto.clienteId, s.sub, motivo, s.sub);
        return { id: g.id as string, liberada: motivo, retencionHasta: null };
      }
      return { id: g.id as string, liberada: null, retencionHasta: await this.retencion.recalcular(tx, dto.clienteId) };
    });
    const [creada] = await this.db.query(`SELECT ${COLUMNAS} ${UNIONES} WHERE g.id = $1`, [id]);
    return { ...this.sinTiempo(creada, s), liberada, retencionHasta };
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
    return {
      filas: filas.map((f: { segundosFicha: number | null }) => this.sinTiempo(f, s)),
      puedeRegistrar: c.asesorId === s.sub && s.permisos.includes('NEGOCIACION_GESTIONAR'),
      // Supervisión: llamadas con muy poco tiempo en la ficha se marcan como rápidas
      segundosMinimos: s.rol === 'ASESOR' ? null : (await this.retencion.reglas()).segundosMinimosFicha,
    };
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
    return { items: items.map((g: { segundosFicha: number | null }) => this.sinTiempo(g, s)), atrasadas: atrasadas.map((g: { segundosFicha: number | null }) => this.sinTiempo(g, s)) };
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
    return this.sinTiempo(act, s);
  }

  // ───────────── Ayudantes ─────────────
  /** El tiempo en la ficha es un dato de supervisión: el asesor no lo ve */
  private sinTiempo<T extends { segundosFicha: number | null }>(g: T, s: SesionUsuario): T {
    return s.rol === 'ASESOR' ? { ...g, segundosFicha: null } : g;
  }

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