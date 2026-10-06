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
      }
      return lista;
    });
    if (liberadas.length) this.logger.log(`${liberadas.length} empresa(s) volvieron al repositorio por ${dias} días sin gestión`);
    return liberadas.length;
  }
}