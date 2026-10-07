import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccesoCelular1791270000012 implements MigrationInterface {
  name = 'AccesoCelular1791270000012';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Acceso desde el celular: solicitud → gerencia aprueba con fecha de fin (máx. 30 días) =====
      ALTER TABLE accesos_moviles
        ADD COLUMN dias_solicitados  SMALLINT NULL CHECK (dias_solicitados BETWEEN 1 AND 30),
        ADD COLUMN respuesta         TEXT NULL,          -- comentario de gerencia al aprobar, rechazar o revocar
        ADD COLUMN respondido_at     TIMESTAMPTZ NULL,
        ADD COLUMN aviso_vencimiento BOOLEAN NOT NULL DEFAULT false;  -- ya se avisó que vence en 2 días

      -- Una sola solicitud pendiente y un solo acceso aprobado por usuario
      CREATE UNIQUE INDEX ux_acceso_pendiente ON accesos_moviles (usuario_id) WHERE estado = 'PENDIENTE';
      CREATE UNIQUE INDEX ux_acceso_aprobado ON accesos_moviles (usuario_id) WHERE estado = 'APROBADA';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS ux_acceso_aprobado;
      DROP INDEX IF EXISTS ux_acceso_pendiente;
      ALTER TABLE accesos_moviles DROP COLUMN aviso_vencimiento, DROP COLUMN respondido_at, DROP COLUMN respuesta, DROP COLUMN dias_solicitados;
    `);
  }
}