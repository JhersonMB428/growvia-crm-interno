import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

export type TipoNotificacion =
  | 'GESTION_HOY' | 'GESTION_PROXIMA' | 'GESTIONES_ATRASADAS'
  | 'VENTA_POR_APROBAR' | 'VENTA_OBSERVADA' | 'VENTA_APROBADA' | 'VENTA_VALIDADA' | 'VENTA_ACTIVA' | 'VENTA_ANULADA'
  | 'EMPRESA_ASIGNADA' | 'BASE_APROBADA' | 'ACCESO_MOVIL';

export interface NuevaNotificacion {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidad?: 'EMPRESA' | 'NEGOCIACION' | 'GESTION' | 'LOTE' | 'ACCESO';
  entidadId?: string;
  programadaPara?: Date;
}

/** Avisos de la campanita. Otros módulos la usan con crear(); se puede pasar la transacción en curso. */
@Injectable()
export class NotificacionesService {
  constructor(private readonly db: DataSource) {}

  async crear(usuarioId: string, n: NuevaNotificacion, tx?: EntityManager): Promise<string> {
    const [fila] = await (tx ?? this.db).query(
      `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, entidad, entidad_id, programada_para)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now())) RETURNING id`,
      [usuarioId, n.tipo, n.titulo, n.mensaje, n.entidad ?? null, n.entidadId ?? null, n.programadaPara ?? null],
    );
    return String(fila.id);
  }

  /** Las últimas 50 que ya deben verse (las programadas a futuro todavía no) */
  async listar(usuarioId: string, soloSinLeer: boolean) {
    const filas = await this.db.query(
      `SELECT id::text, tipo, titulo, mensaje, entidad, entidad_id AS "entidadId",
              programada_para AS fecha, leida_at IS NOT NULL AS leida
       FROM notificaciones
       WHERE usuario_id = $1 AND programada_para <= now() ${soloSinLeer ? 'AND leida_at IS NULL' : ''}
       ORDER BY programada_para DESC LIMIT 50`,
      [usuarioId],
    );
    return { filas, sinLeer: await this.contador(usuarioId) };
  }

  async contador(usuarioId: string): Promise<number> {
    const [{ n }] = await this.db.query(
      `SELECT count(*)::int AS n FROM notificaciones WHERE usuario_id = $1 AND leida_at IS NULL AND programada_para <= now()`,
      [usuarioId],
    );
    return n;
  }

  async marcarLeida(id: string, usuarioId: string) {
    const r = await this.db.query(
      `UPDATE notificaciones SET leida_at = COALESCE(leida_at, now()) WHERE id = $1 AND usuario_id = $2 RETURNING id`,
      [id, usuarioId],
    );
    if (!(Array.isArray(r[0]) ? r[0] : r).length) throw new NotFoundException('La notificación no existe');
    return { sinLeer: await this.contador(usuarioId) };
  }

  async marcarTodas(usuarioId: string) {
    await this.db.query(
      `UPDATE notificaciones SET leida_at = now() WHERE usuario_id = $1 AND leida_at IS NULL AND programada_para <= now()`,
      [usuarioId],
    );
    return { sinLeer: 0 };
  }
}