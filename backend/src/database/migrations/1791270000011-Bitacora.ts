import { MigrationInterface, QueryRunner } from 'typeorm';

export class Bitacora1791270000011 implements MigrationInterface {
  name = 'Bitacora1791270000011';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Bitácora de auditoría: quién hizo qué, cuándo y desde dónde =====
      CREATE TABLE bitacora (
        id          BIGSERIAL PRIMARY KEY,
        usuario_id  UUID NULL REFERENCES usuarios(id),   -- NULL: alguien que no se identificó (login fallido de un correo inexistente)
        accion      VARCHAR(40) NOT NULL,
        entidad     VARCHAR(20) NULL,                    -- EMPRESA, NEGOCIACION, DOCUMENTO, CARGA...
        entidad_id  VARCHAR(64) NULL,
        detalle     JSONB NULL,
        ip          VARCHAR(64) NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_bitacora_fecha ON bitacora (created_at DESC);
      CREATE INDEX ix_bitacora_usuario ON bitacora (usuario_id, created_at DESC);
      CREATE INDEX ix_bitacora_accion ON bitacora (accion, created_at DESC);

      -- Nadie (ni el propio CRM) puede modificar o borrar lo registrado
      CREATE FUNCTION bitacora_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'La bitácora no se puede modificar ni borrar';
      END $$;
      CREATE TRIGGER tr_bitacora_inmutable BEFORE UPDATE OR DELETE ON bitacora
        FOR EACH ROW EXECUTE FUNCTION bitacora_inmutable();

      INSERT INTO permisos (codigo, modulo, descripcion) VALUES ('BITACORA_VER', 'sistema', 'Ver la bitácora de auditoría');
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p WHERE r.codigo IN ('GERENTE', 'ADMIN') AND p.codigo = 'BITACORA_VER';
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM rol_permisos WHERE permiso_id = (SELECT id FROM permisos WHERE codigo = 'BITACORA_VER');
      DELETE FROM permisos WHERE codigo = 'BITACORA_VER';
      DROP TABLE IF EXISTS bitacora;
      DROP FUNCTION IF EXISTS bitacora_inmutable();
    `);
  }
}