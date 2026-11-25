import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { RetencionService, saltarFinDeSemana } from './retencion';

export type MotivoLiberacion = 'LIBERACION' | 'DEVUELTA' | 'SIN_RESPUESTA' | 'RECHAZO';

const filasDe = <T>(r: unknown): T[] => (Array.isArray((r as unknown[])[0]) ? (r as T[][])[0] : (r as T[]));
const DETALLE: Record<MotivoLiberacion, string> = {
  LIBERACION: 'Empresa liberada: venció su plazo sin gestión',
  DEVUELTA: 'Empresa devuelta al repositorio por el asesor',
  SIN_RESPUESTA: 'Empresa liberada: no contestó en varios intentos',
  RECHAZO: 'Empresa liberada: no está interesada',
};

/**
 * Devuelve empresas al repositorio:
 *  - Cada 10 minutos, las que vencieron su plazo (retencion_hasta).
 *  - Cuando el asesor la devuelve ("Liberar"), marca "No interesado" o llega al máximo de intentos sin respuesta.
 * Avisa al asesor unas horas antes de que venza el plazo.
 * Las empresas con una venta ganada nunca se liberan.
 */
@Injectable()
export class LiberacionService {
  private readonly logger = new Logger('Liberación');

  constructor(
    private readonly db: DataSource,
    private readonly retencion: RetencionService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  @Cron('*/10 * * * *', { timeZone: 'America/Lima' })
  async tarea() {
    await this.avisarPorVencer();
    await this.liberarVencidas();
  }

  /** Empresas cuyo plazo venció */
  async liberarVencidas(): Promise<number> {
    const porAsesor = await this.db.transaction(async (tx) => {
      const vencidas = filasDe<{ id: string; asesor_id: string }>(await tx.query(
        `SELECT c.id, c.asesor_id FROM clientes c
         WHERE c.asesor_id IS NOT NULL AND c.estado = 'PROSPECTO' AND c.retencion_hasta < now()
           AND NOT EXISTS (SELECT 1 FROM oportunidades o WHERE o.cliente_id = c.id
                           AND o.resultado = 'GANADA' AND o.estado_venta <> 'ANULADA')
         ORDER BY c.retencion_hasta LIMIT 2000
         FOR UPDATE OF c SKIP LOCKED`,
      ));
      const cuenta = new Map<string, number>();
      for (const v of vencidas) {
        await this.liberar(tx, v.id, v.asesor_id, 'LIBERACION', null);
        cuenta.set(v.asesor_id, (cuenta.get(v.asesor_id) ?? 0) + 1);
      }
      return cuenta;
    });
    let total = 0;
    for (const [asesorId, n] of porAsesor) {
      total += n;
      await this.notificaciones.crear(asesorId, {
        tipo: 'EMPRESAS_LIBERADAS',
        titulo: 'Empresas devueltas al repositorio',
        mensaje: `${n} ${n === 1 ? 'empresa volvió' : 'empresas volvieron'} al repositorio porque venció su plazo sin gestión.`,
      });
    }
    if (total) this.logger.log(`${total} empresa(s) volvieron al repositorio por plazo vencido`);
    return total;
  }

  /** Un aviso por empresa, unas horas antes de que venza */
  async avisarPorVencer(): Promise<number> {
    const horas = (await this.retencion.reglas()).horasAvisoLiberacion;
    const filas = filasDe<{ id: string; asesor_id: string; razon_social: string; retencion_hasta: Date }>(await this.db.query(
      `WITH p AS (
         SELECT c.id FROM clientes c
         WHERE c.asesor_id IS NOT NULL AND c.estado = 'PROSPECTO' AND NOT c.aviso_liberacion
           AND c.retencion_hasta > now() AND c.retencion_hasta <= now() + make_interval(hours => $1)
         FOR UPDATE SKIP LOCKED
       )
       UPDATE clientes c SET aviso_liberacion = true FROM p WHERE c.id = p.id
       RETURNING c.id, c.asesor_id, c.razon_social, c.retencion_hasta`, [horas],
    ));
    for (const f of filas) {
      const hora = new Date(f.retencion_hasta).toLocaleString('es-PE', {
        timeZone: 'America/Lima', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      });
      await this.notificaciones.crear(f.asesor_id, {
        tipo: 'EMPRESA_POR_LIBERAR',
        titulo: 'Empresa por liberarse',
        mensaje: `${f.razon_social} vuelve al repositorio el ${hora}. Registra una gestión o pulsa “Mantener 24 h más”.`,
        entidad: 'EMPRESA',
        entidadId: f.id,
      });
    }
    return filas.length;
  }

  /** El asesor a cargo suma 24 horas al plazo (una vez hasta su siguiente gestión) */
  async mantener(clienteId: string, s: SesionUsuario) {
    return this.db.transaction(async (tx) => {
      const [c] = await tx.query(
        `SELECT asesor_id AS "asesorId", prorrogada, retencion_hasta AS "hasta" FROM clientes WHERE id = $1 FOR UPDATE`, [clienteId],
      );
      if (!c) throw new NotFoundException('La empresa no existe');
      if (c.asesorId !== s.sub) throw new ForbiddenException('Solo el asesor a cargo puede mantener esta empresa');
      if (!c.hasta) throw new BadRequestException('Esta empresa no tiene plazo de liberación');
      if (c.prorrogada) throw new BadRequestException('Ya usaste las 24 h extra. Registra una gestión para renovar el plazo.');
      const hasta = saltarFinDeSemana(new Date(+new Date(c.hasta) + 24 * 3_600_000));
      await tx.query(`UPDATE clientes SET prorrogada = true, aviso_liberacion = false, retencion_hasta = $2 WHERE id = $1`, [clienteId, hasta]);
      return { retencionHasta: hasta };
    });
  }

  /** El asesor a cargo devuelve la empresa al repositorio */
  async devolver(clienteId: string, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const [c] = await tx.query(`SELECT asesor_id AS "asesorId", estado FROM clientes WHERE id = $1 FOR UPDATE`, [clienteId]);
      if (!c) throw new NotFoundException('La empresa no existe');
      if (c.asesorId !== s.sub) throw new ForbiddenException('Solo el asesor a cargo puede liberar esta empresa');
      if (c.estado === 'VENTA') throw new BadRequestException('Una empresa con venta no se puede liberar');
      await this.liberar(tx, clienteId, s.sub, 'DEVUELTA', s.sub);
    });
    return { ok: true };
  }

  /**
   * Quita la empresa al asesor, deja el historial y cierra como perdida la negociación abierta.
   * RECHAZO: nadie la puede tomar por dias_bloqueo_rechazo. SIN_RESPUESTA: el mismo asesor no la retoma por dias_espera_sin_respuesta.
   */
  async liberar(tx: EntityManager, clienteId: string, asesorId: string, motivo: MotivoLiberacion, hechoPor: string | null) {
    const r = await this.retencion.reglas();
    const dias = motivo === 'RECHAZO' ? r.diasBloqueoRechazo : motivo === 'SIN_RESPUESTA' ? r.diasEsperaSinRespuesta : 0;
    const bloqueo = dias > 0 && (motivo === 'RECHAZO' || motivo === 'SIN_RESPUESTA') ? motivo : null;
    await tx.query(
      `UPDATE clientes SET asesor_id = NULL, asignado_at = NULL, retencion_hasta = NULL, prorrogada = false, aviso_liberacion = false,
              ultimo_asesor_id = $2, bloqueo_tipo = $3::varchar,
              bloqueo_hasta = CASE WHEN $3::varchar IS NULL THEN NULL ELSE now() + make_interval(days => $4) END,
              updated_at = now()
       WHERE id = $1`,
      [clienteId, asesorId, bloqueo, dias],
    );
    await tx.query(
      `INSERT INTO asignaciones (cliente_id, asesor_anterior, motivo, asignado_por) VALUES ($1, $2, $3, $4)`,
      [clienteId, asesorId, motivo, hechoPor],
    );
    // Si tenía una negociación abierta, se cierra como perdida
    const abiertas = filasDe<{ id: string; etapa: string }>(await tx.query(
      `UPDATE oportunidades SET etapa = 'CIERRE', resultado = 'PERDIDA', fecha_cierre = now(), updated_at = now(), motivo_perdida = $2
       FROM (SELECT id, etapa FROM oportunidades WHERE cliente_id = $1 AND resultado = 'EN_CURSO' FOR UPDATE) a
       WHERE oportunidades.id = a.id RETURNING oportunidades.id, a.etapa`,
      [clienteId, DETALLE[motivo]],
    ));
    for (const o of abiertas) {
      await tx.query(
        `INSERT INTO historial_etapas (oportunidad_id, etapa_anterior, etapa_nueva, detalle, usuario_id) VALUES ($1, $2, 'CIERRE', $3, $4)`,
        [o.id, o.etapa, `Perdida: ${DETALLE[motivo].toLowerCase()}`, hechoPor],
      );
    }
  }
}
