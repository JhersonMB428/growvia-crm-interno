import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ParametrosService } from '../sistema/parametros.service';

/**
 * Todos los días a las 2:00 a. m. (hora de Lima) devuelve al repositorio los prospectos
 * sin gestión por más de N días (parámetro dias_liberacion_inactividad, 30 al inicio).
 * Las empresas que ya son VENTA no se liberan.
 */
@Injectable()
export class LiberacionService {
  private readonly logger = new Logger('Liberación');

  constructor(private readonly db: DataSource, private readonly parametros: ParametrosService) {}

  @Cron('0 2 * * *', { timeZone: 'America/Lima' })
  async liberarInactivas(): Promise<number> {
    const dias = await this.parametros.numero('dias_liberacion_inactividad', 30);
    const liberadas: { id: string; asesor_id: string }[] = await this.db.transaction(async (tx) => {
      const filas = await tx.query(
        `WITH vencidas AS (
           SELECT id, asesor_id FROM clientes
           WHERE asesor_id IS NOT NULL AND estado = 'PROSPECTO'
             AND COALESCE(ultima_gestion_at, asignado_at) < now() - make_interval(days => $1)
             -- una venta ganada que sigue en validación o posventa no se libera
             AND NOT EXISTS (SELECT 1 FROM oportunidades o WHERE o.cliente_id = clientes.id
                             AND o.resultado = 'GANADA' AND o.estado_venta <> 'ANULADA')
           FOR UPDATE
         )
         UPDATE clientes c SET asesor_id = NULL, asignado_at = NULL, updated_at = now()
         FROM vencidas v WHERE c.id = v.id
         RETURNING c.id, v.asesor_id`,
        [dias],
      );
      const lista = Array.isArray(filas[0]) ? filas[0] : filas;
      for (const l of lista) {
        await tx.query(
          `INSERT INTO asignaciones (cliente_id, asesor_anterior, motivo) VALUES ($1, $2, 'LIBERACION')`,
          [l.id, l.asesor_id],
        );
        // Si tenía una negociación abierta, se cierra como perdida (usuario NULL = el sistema)
        const abiertas = await tx.query(
          `UPDATE oportunidades SET etapa = 'CIERRE', resultado = 'PERDIDA', fecha_cierre = now(), updated_at = now(),
                  motivo_perdida = 'Empresa liberada por inactividad'
           FROM (SELECT id, etapa FROM oportunidades WHERE cliente_id = $1 AND resultado = 'EN_CURSO' FOR UPDATE) a
           WHERE oportunidades.id = a.id RETURNING oportunidades.id, a.etapa`,
          [l.id],
        );
        for (const o of Array.isArray(abiertas[0]) ? abiertas[0] : abiertas) {
          await tx.query(
            `INSERT INTO historial_etapas (oportunidad_id, etapa_anterior, etapa_nueva, detalle) VALUES ($1, $2, 'CIERRE', $3)`,
            [o.id, o.etapa, 'Perdida: la empresa volvió al repositorio por inactividad'],
          );
        }
      }
      return lista;
    });
    if (liberadas.length) this.logger.log(`${liberadas.length} empresa(s) volvieron al repositorio por ${dias} días sin gestión`);
    return liberadas.length;
  }
}