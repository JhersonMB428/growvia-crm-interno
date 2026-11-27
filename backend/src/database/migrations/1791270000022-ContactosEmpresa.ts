import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personas y medios de contacto de cada empresa (27 nov 2026):
 *  - Sin límite de personas: además del representante legal (posición 1) y el otro contacto (posición 2),
 *    los demás representantes de SUNAT, el contacto que traía la base y las personas que agrega la asesora
 *    (por ejemplo, quien de verdad toma la decisión). Cada una con cargo y marca de "decide la compra".
 *  - Teléfonos y correos de la empresa (los que declaró a SUNAT o trajo la base), cada uno con su estado:
 *    sin probar, funciona, no contesta, no existe o equivocado.
 *  - Cada gestión guarda con quién se habló y a qué número o correo.
 */
export class ContactosEmpresa1791270000022 implements MigrationInterface {
  name = 'ContactosEmpresa1791270000022';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE contactos DROP CONSTRAINT IF EXISTS contactos_posicion_check;
      ALTER TABLE contactos ADD CONSTRAINT contactos_posicion_check CHECK (posicion >= 1);
      -- Solo el "otro contacto" (posición 2) exige teléfono; el representante y las demás personas pueden venir sin él
      ALTER TABLE contactos DROP CONSTRAINT IF EXISTS ck_contacto_telefono;
      ALTER TABLE contactos ADD CONSTRAINT ck_contacto_telefono CHECK (posicion <> 2 OR celular IS NOT NULL);
      ALTER TABLE contactos
        ADD COLUMN cargo      VARCHAR(80) NULL,
        ADD COLUMN decisor    BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN origen     VARCHAR(10) NOT NULL DEFAULT 'ASESORA' CHECK (origen IN ('SUNAT', 'BASE', 'ASESORA')),
        ADD COLUMN nota       VARCHAR(200) NULL,
        ADD COLUMN creado_por UUID NULL REFERENCES usuarios(id),
        ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
      UPDATE contactos k SET origen = 'BASE' FROM clientes c WHERE c.id = k.cliente_id AND c.origen = 'BASE';

      CREATE TABLE medios_contacto (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        tipo            VARCHAR(8) NOT NULL CHECK (tipo IN ('TELEFONO', 'CORREO')),
        valor           VARCHAR(150) NOT NULL,
        origen          VARCHAR(10) NOT NULL DEFAULT 'BASE' CHECK (origen IN ('SUNAT', 'BASE', 'ASESORA')),
        estado          VARCHAR(12) NOT NULL DEFAULT 'SIN_PROBAR'
                        CHECK (estado IN ('SIN_PROBAR', 'FUNCIONA', 'NO_CONTESTA', 'NO_EXISTE', 'EQUIVOCADO')),
        nota            VARCHAR(200) NULL,
        actualizado_por UUID NULL REFERENCES usuarios(id),
        actualizado_at  TIMESTAMPTZ NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ux_medio UNIQUE (cliente_id, tipo, valor)
      );
      -- Los teléfonos y correos que ya tenían los contactos pasan también a la lista de la empresa
      INSERT INTO medios_contacto (cliente_id, tipo, valor, origen)
      SELECT cliente_id, 'TELEFONO', celular, origen FROM contactos WHERE celular IS NOT NULL
      ON CONFLICT DO NOTHING;
      INSERT INTO medios_contacto (cliente_id, tipo, valor, origen)
      SELECT cliente_id, 'CORREO', lower(correo), origen FROM contactos WHERE correo IS NOT NULL
      ON CONFLICT DO NOTHING;

      ALTER TABLE gestiones
        ADD COLUMN contacto_id UUID NULL REFERENCES contactos(id) ON DELETE SET NULL,
        ADD COLUMN medio       VARCHAR(150) NULL;

      -- Otros contactos, teléfonos y correos que trae una base (se guardan al aprobarla)
      ALTER TABLE lote_filas ADD COLUMN extras JSONB NOT NULL DEFAULT '{}';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE lote_filas DROP COLUMN extras;
      ALTER TABLE gestiones DROP COLUMN medio, DROP COLUMN contacto_id;
      DROP TABLE medios_contacto;
      DELETE FROM contactos WHERE posicion > 2;
      ALTER TABLE contactos DROP COLUMN created_at, DROP COLUMN creado_por, DROP COLUMN nota, DROP COLUMN origen, DROP COLUMN decisor, DROP COLUMN cargo;
      ALTER TABLE contactos DROP CONSTRAINT ck_contacto_telefono;
      ALTER TABLE contactos ADD CONSTRAINT ck_contacto_telefono CHECK (posicion = 1 OR celular IS NOT NULL);
      ALTER TABLE contactos DROP CONSTRAINT contactos_posicion_check;
      ALTER TABLE contactos ADD CONSTRAINT contactos_posicion_check CHECK (posicion IN (1, 2));
    `);
  }
}
