import { MigrationInterface, QueryRunner } from 'typeorm';

export class Renovaciones1791270000015 implements MigrationInterface {
  name = 'Renovaciones1791270000015';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Plazo del contrato de cada venta y renovaciones =====
      -- 0 = sin plazo forzoso (no se sigue su renovación)
      ALTER TABLE oportunidades
        ADD COLUMN plazo_meses SMALLINT NOT NULL DEFAULT 18 CHECK (plazo_meses IN (0, 6, 12, 18, 24, 36)),
        ADD COLUMN renueva_id  UUID NULL REFERENCES oportunidades(id);

      ALTER TABLE oportunidades DROP CONSTRAINT oportunidades_tipo_check;
      ALTER TABLE oportunidades ADD CONSTRAINT oportunidades_tipo_check CHECK (tipo IN ('NUEVA', 'AMPLIACION', 'RENOVACION'));
      ALTER TABLE oportunidades ADD CONSTRAINT ck_op_renovacion CHECK ((tipo = 'RENOVACION') = (renueva_id IS NOT NULL));

      -- Un contrato solo puede tener una renovación viva (en curso o ganada)
      CREATE UNIQUE INDEX ux_op_renueva ON oportunidades (renueva_id) WHERE renueva_id IS NOT NULL AND resultado <> 'PERDIDA';
      -- Para buscar rápido los contratos activos por fecha de activación
      CREATE INDEX ix_op_activas ON oportunidades (fecha_activacion) WHERE estado_venta = 'ACTIVA';

      -- ===== Contrato del prospecto con su operador actual (el mejor momento para la portabilidad) =====
      ALTER TABLE clientes
        ADD COLUMN operador_actual_id  SMALLINT NULL REFERENCES operadores(id),
        ADD COLUMN fin_contrato_actual DATE NULL;
      CREATE INDEX ix_clientes_fin_contrato ON clientes (fin_contrato_actual) WHERE fin_contrato_actual IS NOT NULL;

      -- ===== Avisos ya enviados (para no repetirlos) =====
      CREATE TABLE avisos_vencimiento (
        tipo      VARCHAR(9) NOT NULL CHECK (tipo IN ('VENTA', 'PROSPECTO')),
        ref_id    UUID NOT NULL,
        fecha_fin DATE NOT NULL,
        dias      SMALLINT NOT NULL,
        enviado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (tipo, ref_id, fecha_fin, dias)
      );

      -- ===== Parámetro: con cuántos días de anticipación empieza a avisar =====
      INSERT INTO parametros (clave, valor, descripcion, tipo, minimo, maximo, editable) VALUES
        ('dias_primer_aviso_renovacion', '90', 'Días antes del fin de contrato en que llega el primer aviso de renovación', 'numero', 30, 180, true);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM parametros WHERE clave = 'dias_primer_aviso_renovacion';
      DROP TABLE IF EXISTS avisos_vencimiento;
      DROP INDEX IF EXISTS ix_clientes_fin_contrato;
      ALTER TABLE clientes DROP COLUMN fin_contrato_actual, DROP COLUMN operador_actual_id;
      DROP INDEX IF EXISTS ix_op_activas;
      DROP INDEX IF EXISTS ux_op_renueva;
      ALTER TABLE oportunidades DROP CONSTRAINT ck_op_renovacion;
      DELETE FROM oportunidades WHERE tipo = 'RENOVACION';
      ALTER TABLE oportunidades DROP CONSTRAINT oportunidades_tipo_check;
      ALTER TABLE oportunidades ADD CONSTRAINT oportunidades_tipo_check CHECK (tipo IN ('NUEVA', 'AMPLIACION'));
      ALTER TABLE oportunidades DROP COLUMN renueva_id, DROP COLUMN plazo_meses;
    `);
  }
}