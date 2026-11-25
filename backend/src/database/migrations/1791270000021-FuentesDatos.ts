import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fuentes de datos de empresas y ajustes de sesión (25 nov 2026):
 *  - Consulta a SUNAT (apiconsulta.dev): estado y condición del contribuyente, y cola para completar
 *    representantes legales de las empresas que llegan por bases.
 *  - El representante legal puede guardarse sin teléfono (SUNAT da nombre y DNI, no el teléfono).
 *    El "otro contacto" sigue necesitando teléfono.
 *  - Bases internas o compradas: si el RUC ya existe, la fila completa los datos que faltan
 *    (o los reemplaza, si así se elige al aprobar) en vez de crear una empresa repetida.
 *  - Minutos de inactividad para cerrar la sesión (editable por administración).
 */
export class FuentesDatos1791270000021 implements MigrationInterface {
  name = 'FuentesDatos1791270000021';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE contactos ALTER COLUMN celular DROP NOT NULL;
      ALTER TABLE contactos ADD CONSTRAINT ck_contacto_telefono CHECK (posicion = 1 OR celular IS NOT NULL);

      ALTER TABLE clientes
        ADD COLUMN sunat_estado        VARCHAR(40) NULL,
        ADD COLUMN sunat_condicion     VARCHAR(40) NULL,
        ADD COLUMN sunat_consultado_at TIMESTAMPTZ NULL,
        ADD COLUMN sunat_pendiente     BOOLEAN NOT NULL DEFAULT false;
      CREATE INDEX ix_clientes_sunat_pendiente ON clientes (created_at) WHERE sunat_pendiente;

      ALTER TABLE lotes_importacion
        ADD COLUMN origen                VARCHAR(10) NOT NULL DEFAULT 'INTERNA' CHECK (origen IN ('INTERNA', 'COMPRADA')),
        ADD COLUMN proveedor             VARCHAR(100) NULL,
        ADD COLUMN en_diferencias        VARCHAR(4) NULL CHECK (en_diferencias IN ('CRM', 'BASE')),
        ADD COLUMN filas_actualizar      INT NOT NULL DEFAULT 0,
        ADD COLUMN filas_iguales         INT NOT NULL DEFAULT 0,
        ADD COLUMN empresas_creadas      INT NOT NULL DEFAULT 0,
        ADD COLUMN empresas_actualizadas INT NOT NULL DEFAULT 0;

      -- Fila que corresponde a una empresa que ya está en el CRM: qué completa y en qué difiere
      ALTER TABLE lote_filas
        ADD COLUMN cliente_id UUID NULL REFERENCES clientes(id) ON DELETE CASCADE,
        ADD COLUMN cambios    JSONB NULL;

      INSERT INTO parametros (clave, valor, descripcion, tipo, minimo, maximo, editable) VALUES
        ('minutos_inactividad_sesion', '7', 'Minutos sin usar el CRM para cerrar la sesión (0 = no se cierra por inactividad)', 'numero', 0, 240, true)
      ON CONFLICT (clave) DO NOTHING;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM parametros WHERE clave = 'minutos_inactividad_sesion';
      ALTER TABLE lote_filas DROP COLUMN cambios, DROP COLUMN cliente_id;
      ALTER TABLE lotes_importacion DROP COLUMN empresas_actualizadas, DROP COLUMN empresas_creadas, DROP COLUMN filas_iguales,
        DROP COLUMN filas_actualizar, DROP COLUMN en_diferencias, DROP COLUMN proveedor, DROP COLUMN origen;
      DROP INDEX IF EXISTS ix_clientes_sunat_pendiente;
      ALTER TABLE clientes DROP COLUMN sunat_pendiente, DROP COLUMN sunat_consultado_at, DROP COLUMN sunat_condicion, DROP COLUMN sunat_estado;
      ALTER TABLE contactos DROP CONSTRAINT ck_contacto_telefono;
      -- Los representantes sin teléfono no se pueden conservar con la restricción anterior
      DELETE FROM contactos WHERE celular IS NULL;
      ALTER TABLE contactos ALTER COLUMN celular SET NOT NULL;
    `);
  }
}
