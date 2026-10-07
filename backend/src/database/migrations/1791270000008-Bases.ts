import { MigrationInterface, QueryRunner } from 'typeorm';

export class Bases1791270000008 implements MigrationInterface {
  name = 'Bases1791270000008';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- A quién se asignan las empresas del lote (NULL = quedan libres en el repositorio)
      ALTER TABLE lotes_importacion
        ADD COLUMN asignar_a     UUID NULL REFERENCES usuarios(id),
        ADD COLUMN revisado_at   TIMESTAMPTZ NULL,
        ADD COLUMN motivo_rechazo VARCHAR(300) NULL;

      -- Errores: se agrega "dato inválido" (celular o correo mal escrito)
      ALTER TABLE lote_errores DROP CONSTRAINT lote_errores_motivo_check;
      ALTER TABLE lote_errores ADD CONSTRAINT lote_errores_motivo_check
        CHECK (motivo IN ('RUC_INVALIDO','RUC_DUPLICADO','UBIGEO_INVALIDO','DATO_FALTANTE','DATO_INVALIDO'));

      -- Filas válidas que esperan la aprobación (se insertan como empresas al aprobar)
      CREATE TABLE lote_filas (
        id          BIGSERIAL PRIMARY KEY,
        lote_id     UUID NOT NULL REFERENCES lotes_importacion(id) ON DELETE CASCADE,
        fila        INT NOT NULL,
        ruc         CHAR(11) NOT NULL,
        razon_social VARCHAR(200) NOT NULL,
        distrito_id CHAR(6) NULL REFERENCES distritos(id),
        contactos   JSONB NOT NULL DEFAULT '[]'
      );
      CREATE INDEX ix_lote_filas_lote ON lote_filas (lote_id, fila);
      CREATE INDEX ix_lotes_estado ON lotes_importacion (estado, created_at DESC);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS lote_filas;
      DROP INDEX IF EXISTS ix_lotes_estado;
      ALTER TABLE lote_errores DROP CONSTRAINT lote_errores_motivo_check;
      ALTER TABLE lote_errores ADD CONSTRAINT lote_errores_motivo_check
        CHECK (motivo IN ('RUC_INVALIDO','RUC_DUPLICADO','UBIGEO_INVALIDO','DATO_FALTANTE'));
      ALTER TABLE lotes_importacion DROP COLUMN asignar_a, DROP COLUMN revisado_at, DROP COLUMN motivo_rechazo;
    `);
  }
}