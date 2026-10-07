import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackOffice1791270000009 implements MigrationInterface {
  name = 'BackOffice1791270000009';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Checklist que back office revisa antes de validar (perfil de puesto de Ann) =====
      CREATE TABLE checklist_validacion (
        id                SMALLSERIAL PRIMARY KEY,
        orden             SMALLINT NOT NULL,
        texto             VARCHAR(150) NOT NULL,
        solo_portabilidad BOOLEAN NOT NULL DEFAULT false,   -- solo aplica si la venta tiene portabilidades
        activo            BOOLEAN NOT NULL DEFAULT true
      );
      INSERT INTO checklist_validacion (orden, texto, solo_portabilidad) VALUES
        (1, 'Documentos del cliente y del representante legal verificados (RUC, DNI)', false),
        (2, 'Contrato o solicitud de servicio firmada', false),
        (3, 'Carta de portabilidad firmada', true),
        (4, 'Planes, cantidades y cargo fijo coinciden con lo negociado', false),
        (5, 'Cumple las políticas comerciales del operador', false);

      -- Qué puntos marcó back office en cada validación
      ALTER TABLE validaciones ADD COLUMN checklist SMALLINT[] NULL;

      -- N° de orden o pedido registrado en la plataforma del operador
      ALTER TABLE oportunidades ADD COLUMN orden_operador VARCHAR(40) NULL;

      -- Back office mantiene actualizada la base de clientes
      INSERT INTO permisos (codigo, modulo, descripcion)
      VALUES ('EMPRESA_EDITAR', 'empresas', 'Corregir datos y contactos de cualquier empresa');
      INSERT INTO rol_permisos (rol_id, permiso_id)
      SELECT r.id, p.id FROM roles r, permisos p WHERE r.codigo IN ('BACKOFFICE', 'ADMIN') AND p.codigo = 'EMPRESA_EDITAR';

      CREATE INDEX ix_validaciones_fecha ON validaciones (decision, created_at);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP INDEX IF EXISTS ix_validaciones_fecha;
      DELETE FROM rol_permisos WHERE permiso_id = (SELECT id FROM permisos WHERE codigo = 'EMPRESA_EDITAR');
      DELETE FROM permisos WHERE codigo = 'EMPRESA_EDITAR';
      ALTER TABLE oportunidades DROP COLUMN orden_operador;
      ALTER TABLE validaciones DROP COLUMN checklist;
      DROP TABLE IF EXISTS checklist_validacion;
    `);
  }
}