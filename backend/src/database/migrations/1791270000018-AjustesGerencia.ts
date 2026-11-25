import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajustes pedidos por gerencia (12/10):
 *  - Etapas: la negociación nace en "Negociación", pasa a "Cierre" y desde ahí se marca ganada o perdida.
 *    "Cierre" ya no significa cerrada: es una etapa en curso (el cliente aceptó y se envía el expediente).
 *  - Sin validación: al marcarla ganada la venta queda activa y suma a la meta.
 *  - Cada servicio negociado puede ir con o sin equipo.
 *  - El asesor ya no carga bases.
 */
export class AjustesGerencia1791270000018 implements MigrationInterface {
  name = 'AjustesGerencia1791270000018';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- 1. "Cierre" puede estar en curso; cerrada = ganada o perdida (con fecha de cierre)
      ALTER TABLE oportunidades DROP CONSTRAINT ck_op_cierre;
      ALTER TABLE oportunidades ADD CONSTRAINT ck_op_cierre CHECK ((resultado = 'EN_CURSO') = (fecha_cierre IS NULL));
      ALTER TABLE oportunidades ALTER COLUMN etapa SET DEFAULT 'NEGOCIACION';

      -- 2. Prospección y contacto desaparecen: lo abierto pasa a Negociación
      UPDATE oportunidades SET etapa = 'NEGOCIACION' WHERE etapa IN ('PROSPECCION', 'CONTACTO');

      -- 3. Las perdidas quedan en la etapa donde se perdieron (antes todas quedaban en "Cierre")
      UPDATE oportunidades o SET etapa = 'NEGOCIACION' WHERE o.resultado = 'PERDIDA';

      -- 4. Sin validación: las ventas que estaban en el proceso quedan activas
      UPDATE oportunidades
      SET estado_venta = 'ACTIVA', paso_actual_id = NULL,
          fecha_validacion = COALESCE(fecha_validacion, fecha_cierre),
          fecha_activacion = COALESCE(fecha_activacion, fecha_cierre), updated_at = now()
      WHERE estado_venta IN ('EN_VALIDACION', 'OBSERVADA', 'VALIDADA', 'EN_POSVENTA');

      -- 5. Con equipo / sin equipo, por cada servicio negociado
      ALTER TABLE oportunidad_items ADD COLUMN con_equipo BOOLEAN NOT NULL DEFAULT false;

      -- 6. El asesor ya no carga bases (lo hacen supervisor y gerencia)
      DELETE FROM rol_permisos
      WHERE rol_id = (SELECT id FROM roles WHERE codigo = 'ASESOR')
        AND permiso_id = (SELECT id FROM permisos WHERE codigo = 'BASE_CARGAR');
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p WHERE r.codigo = 'ASESOR' AND p.codigo = 'BASE_CARGAR'
      ON CONFLICT DO NOTHING;
      ALTER TABLE oportunidad_items DROP COLUMN con_equipo;
      ALTER TABLE oportunidades ALTER COLUMN etapa SET DEFAULT 'PROSPECCION';
      UPDATE oportunidades SET etapa = 'CIERRE' WHERE resultado <> 'EN_CURSO';
      UPDATE oportunidades SET etapa = 'NEGOCIACION' WHERE resultado = 'EN_CURSO' AND etapa = 'CIERRE';
      ALTER TABLE oportunidades DROP CONSTRAINT ck_op_cierre;
      ALTER TABLE oportunidades ADD CONSTRAINT ck_op_cierre CHECK ((resultado = 'EN_CURSO' AND fecha_cierre IS NULL AND etapa <> 'CIERRE')
        OR (resultado <> 'EN_CURSO' AND fecha_cierre IS NOT NULL AND etapa = 'CIERRE'));
    `);
  }
}