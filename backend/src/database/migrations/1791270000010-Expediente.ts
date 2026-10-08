import { MigrationInterface, QueryRunner } from 'typeorm';

export class Expediente1791270000010 implements MigrationInterface {
  name = 'Expediente1791270000010';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Expediente digital: documentos de cada venta (contrato, DNI, carta de portabilidad...) =====
      -- El archivo vive en el almacenamiento (disco en desarrollo, Azure Blob en producción); aquí solo su ficha
      CREATE TABLE documentos_venta (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oportunidad_id UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
        tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('CONTRATO','DNI','FICHA_RUC','CARTA_PORTABILIDAD','OTRO')),
        nombre         VARCHAR(200) NOT NULL,          -- nombre original del archivo
        clave          VARCHAR(300) NOT NULL UNIQUE,   -- ruta dentro del almacenamiento
        mime           VARCHAR(60) NOT NULL,
        tamano         INT NOT NULL,
        subido_por     UUID NOT NULL REFERENCES usuarios(id),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- No se borra: queda oculto para auditoría
        eliminado_at   TIMESTAMPTZ NULL,
        eliminado_por  UUID NULL REFERENCES usuarios(id)
      );
      CREATE INDEX ix_documentos_venta ON documentos_venta (oportunidad_id) WHERE eliminado_at IS NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS documentos_venta;`);
  }
}