import { MigrationInterface, QueryRunner } from 'typeorm';

export class Gestiones1791270000005 implements MigrationInterface {
  name = 'Gestiones1791270000005';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Gestiones: cada llamada, WhatsApp, correo o visita =====
      CREATE TABLE gestiones (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cliente_id           UUID NOT NULL REFERENCES clientes(id),          -- obligatorio
        oportunidad_id       UUID NULL REFERENCES oportunidades(id),         -- la negociación abierta, si había
        usuario_id           UUID NOT NULL REFERENCES usuarios(id),
        canal                VARCHAR(10) NOT NULL CHECK (canal IN ('LLAMADA','WHATSAPP','CORREO','VISITA')),
        resultado            VARCHAR(16) NOT NULL
                             CHECK (resultado IN ('INTERESADO','NO_CONTESTA','VOLVER_A_LLAMAR','RECHAZA','OTRO')),
        comentario           TEXT NOT NULL CHECK (length(trim(comentario)) >= 3),
        -- Próxima acción (alimenta la agenda)
        proxima_accion       TIMESTAMPTZ NULL,
        proximo_canal        VARCHAR(10) NULL CHECK (proximo_canal IN ('LLAMADA','WHATSAPP','CORREO','VISITA')),
        proxima_hecha_at     TIMESTAMPTZ NULL,       -- se llena cuando se registra la siguiente gestión
        reprogramaciones     SMALLINT NOT NULL DEFAULT 0,
        recordatorio_enviado BOOLEAN NOT NULL DEFAULT false,
        atraso_avisado       BOOLEAN NOT NULL DEFAULT false,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_gestion_proxima CHECK ((proxima_accion IS NULL) = (proximo_canal IS NULL)),
        CONSTRAINT ck_gestion_hecha   CHECK (proxima_hecha_at IS NULL OR proxima_accion IS NOT NULL)
      );
      CREATE INDEX ix_gestiones_cliente ON gestiones (cliente_id, created_at DESC);
      CREATE INDEX ix_gestiones_usuario ON gestiones (usuario_id, created_at DESC);
      -- Agenda pendiente (lo que más se consulta)
      CREATE INDEX ix_gestiones_agenda ON gestiones (usuario_id, proxima_accion)
        WHERE proxima_accion IS NOT NULL AND proxima_hecha_at IS NULL;

      -- ===== Notificaciones (campanita y correo) =====
      CREATE TABLE notificaciones (
        id               BIGSERIAL PRIMARY KEY,
        usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo             VARCHAR(30) NOT NULL,
        titulo           VARCHAR(120) NOT NULL,
        mensaje          TEXT NOT NULL,
        entidad          VARCHAR(20) NULL CHECK (entidad IN ('EMPRESA','NEGOCIACION','GESTION','LOTE','ACCESO')),
        entidad_id       UUID NULL,
        programada_para  TIMESTAMPTZ NOT NULL DEFAULT now(),   -- no aparece antes de esta hora
        enviada_correo   BOOLEAN NOT NULL DEFAULT false,
        leida_at         TIMESTAMPTZ NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_notif_usuario ON notificaciones (usuario_id, programada_para DESC);
      CREATE INDEX ix_notif_sin_leer ON notificaciones (usuario_id) WHERE leida_at IS NULL;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS notificaciones, gestiones CASCADE;`);
  }
}