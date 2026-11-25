import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estructura de datos de cada empresa pedida por Ann (25 nov 2026):
 * RUC · Razón social · Representante legal SUNAT · DNI · Teléfono · Correo · Departamento · Provincia · Distrito
 * · Cantidad de líneas · Operador.
 *  - El contacto 1 es el representante legal (SUNAT): ahora guarda también su DNI.
 *  - El teléfono acepta celular (9…) o fijo con código de ciudad (01…, 044…): siempre 9 dígitos.
 *  - Cantidad de líneas que la empresa tiene hoy con su operador actual.
 */
export class DatosEmpresa1791270000020 implements MigrationInterface {
  name = 'DatosEmpresa1791270000020';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE contactos ADD COLUMN dni CHAR(8) NULL CHECK (dni ~ '^[0-9]{8}$');
      ALTER TABLE contactos DROP CONSTRAINT contactos_celular_check;
      ALTER TABLE contactos ADD CONSTRAINT contactos_celular_check CHECK (celular ~ '^[90][0-9]{8}$');

      ALTER TABLE clientes ADD COLUMN lineas_actuales SMALLINT NULL CHECK (lineas_actuales BETWEEN 0 AND 10000);
      -- Para filtrar el repositorio por operador y cantidad de líneas
      CREATE INDEX ix_clientes_operador_lineas ON clientes (operador_actual_id, lineas_actuales);

      -- Claro también como operador actual de las empresas (y origen de portabilidad)
      INSERT INTO operadores (nombre) SELECT 'Claro' WHERE NOT EXISTS (SELECT 1 FROM operadores WHERE lower(nombre) = 'claro');

      -- Datos nuevos que llegan en la carga de bases
      ALTER TABLE lote_filas
        ADD COLUMN lineas      SMALLINT NULL,
        ADD COLUMN operador_id SMALLINT NULL REFERENCES operadores(id);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE lote_filas DROP COLUMN operador_id, DROP COLUMN lineas;
      -- Claro se quita solo si nada lo usa
      DELETE FROM operadores o WHERE o.nombre = 'Claro'
        AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.operador_actual_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM oportunidad_items i WHERE i.operador_origen_id = o.id);
      DROP INDEX IF EXISTS ix_clientes_operador_lineas;
      ALTER TABLE clientes DROP COLUMN lineas_actuales;
      -- NOT VALID: los teléfonos fijos que ya se guardaron se conservan
      ALTER TABLE contactos DROP CONSTRAINT contactos_celular_check;
      ALTER TABLE contactos ADD CONSTRAINT contactos_celular_check CHECK (celular ~ '^9[0-9]{8}$') NOT VALID;
      ALTER TABLE contactos DROP COLUMN dni;
    `);
  }
}
