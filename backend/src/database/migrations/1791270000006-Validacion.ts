import { MigrationInterface, QueryRunner } from 'typeorm';

export class Validacion1791270000006 implements MigrationInterface {
  name = 'Validacion1791270000006';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Cada decisión de la cadena de validación =====
      CREATE TABLE validaciones (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oportunidad_id UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
        paso_id        SMALLINT NULL REFERENCES pasos_validacion(id),   -- NULL = acción del asesor (reenvío)
        usuario_id     UUID NOT NULL REFERENCES usuarios(id),
        decision       VARCHAR(10) NOT NULL
                       CHECK (decision IN ('APROBADA','REVISADA','OBSERVADA','DETENIDA','VALIDADA','REENVIADA','ANULADA')),
        comentario     TEXT NULL,
        intento        SMALLINT NOT NULL DEFAULT 1,                     -- 1 + número de correcciones
        created_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),  -- hora real (dos decisiones seguidas no empatan)
        CONSTRAINT ck_validacion_comentario CHECK (decision NOT IN ('OBSERVADA','DETENIDA') OR length(trim(comentario)) >= 3)
      );
      CREATE INDEX ix_validaciones_op ON validaciones (oportunidad_id, created_at DESC);

      -- ===== Posventa: chips, portabilidad y activación =====
      CREATE TABLE posventa_eventos (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oportunidad_id UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
        evento         VARCHAR(25) NOT NULL CHECK (evento IN ('CHIPS_ENTREGADOS','PORTABILIDAD_EJECUTADA','SERVICIO_ACTIVO')),
        usuario_id     UUID NOT NULL REFERENCES usuarios(id),
        fecha          TIMESTAMPTZ NOT NULL DEFAULT now(),
        comentario     TEXT NULL,
        CONSTRAINT ux_posventa_evento UNIQUE (oportunidad_id, evento)
      );
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS posventa_eventos, validaciones CASCADE;`);
  }
}