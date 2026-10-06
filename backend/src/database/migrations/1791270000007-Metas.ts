import { MigrationInterface, QueryRunner } from 'typeorm';

export class Metas1791270000007 implements MigrationInterface {
  name = 'Metas1791270000007';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Metas mensuales (principalmente en líneas), por asesor o por equipo =====
      CREATE TABLE metas (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        periodo         DATE NOT NULL CHECK (extract(day FROM periodo) = 1),   -- primer día del mes
        alcance         VARCHAR(6) NOT NULL CHECK (alcance IN ('ASESOR','EQUIPO')),
        asesor_id       UUID NULL REFERENCES usuarios(id),
        equipo_id       UUID NULL REFERENCES equipos(id),
        meta_lineas     INT NOT NULL CHECK (meta_lineas >= 0),
        meta_ventas     INT NULL CHECK (meta_ventas >= 0),
        meta_cargo_fijo NUMERIC(12,2) NULL CHECK (meta_cargo_fijo >= 0),
        definida_por    UUID NOT NULL REFERENCES usuarios(id),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_meta_alcance CHECK ((alcance = 'ASESOR' AND asesor_id IS NOT NULL AND equipo_id IS NULL)
                                       OR (alcance = 'EQUIPO' AND equipo_id IS NOT NULL AND asesor_id IS NULL))
      );
      CREATE UNIQUE INDEX ux_meta_asesor ON metas (periodo, asesor_id) WHERE alcance = 'ASESOR';
      CREATE UNIQUE INDEX ux_meta_equipo ON metas (periodo, equipo_id) WHERE alcance = 'EQUIPO';

      -- Para los reportes: ventas activas por mes de activación
      CREATE INDEX ix_op_activacion ON oportunidades (fecha_activacion) WHERE estado_venta = 'ACTIVA';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS ix_op_activacion; DROP TABLE IF EXISTS metas CASCADE;`);
  }
}