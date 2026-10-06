import { MigrationInterface, QueryRunner } from 'typeorm';

export class Empresas1791270000003 implements MigrationInterface {
  name = 'Empresas1791270000003';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Lotes de importación (bases cargadas desde Excel) =====
      CREATE TABLE lotes_importacion (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subido_por     UUID NOT NULL REFERENCES usuarios(id),
        aprobado_por   UUID NULL REFERENCES usuarios(id),
        archivo_nombre VARCHAR(200) NOT NULL,
        total_filas    INT NOT NULL DEFAULT 0,
        filas_ok       INT NOT NULL DEFAULT 0,
        filas_error    INT NOT NULL DEFAULT 0,
        estado         VARCHAR(25) NOT NULL DEFAULT 'PENDIENTE_APROBACION'
                       CHECK (estado IN ('PENDIENTE_APROBACION','PROCESANDO','LISTO','ERROR','RECHAZADO')),
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        procesado_at   TIMESTAMPTZ NULL,
        CONSTRAINT ck_lote_totales CHECK (estado <> 'LISTO' OR filas_ok + filas_error = total_filas)
      );

      CREATE TABLE lote_errores (
        id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lote_id UUID NOT NULL REFERENCES lotes_importacion(id) ON DELETE CASCADE,
        fila    INT NOT NULL,
        ruc     VARCHAR(20) NULL,
        motivo  VARCHAR(20) NOT NULL
                CHECK (motivo IN ('RUC_INVALIDO','RUC_DUPLICADO','UBIGEO_INVALIDO','DATO_FALTANTE')),
        detalle TEXT NULL,
        datos   JSONB NULL
      );
      CREATE INDEX ix_lote_errores_lote ON lote_errores (lote_id, fila);

      -- ===== Empresas (clientes y prospectos) =====
      CREATE TABLE clientes (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ruc               CHAR(11) NOT NULL UNIQUE CHECK (ruc ~ '^(10|20)[0-9]{9}$'),
        razon_social      VARCHAR(200) NOT NULL,
        distrito_id       CHAR(6) NULL REFERENCES distritos(id),
        asesor_id         UUID NULL REFERENCES usuarios(id),   -- NULL = libre en el repositorio
        origen            VARCHAR(12) NOT NULL CHECK (origen IN ('BASE','PROSPECCION')),
        estado            VARCHAR(10) NOT NULL DEFAULT 'PROSPECTO' CHECK (estado IN ('PROSPECTO','VENTA')),
        lote_id           UUID NULL REFERENCES lotes_importacion(id),
        ultima_gestion_at TIMESTAMPTZ NULL,
        asignado_at       TIMESTAMPTZ NULL,
        creado_por        UUID NULL REFERENCES usuarios(id),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_cliente_asignado CHECK (asesor_id IS NULL OR asignado_at IS NOT NULL)
      );
      CREATE INDEX ix_clientes_asesor ON clientes (asesor_id);
      CREATE INDEX ix_clientes_distrito ON clientes (distrito_id);
      CREATE INDEX ix_clientes_razon ON clientes (lower(razon_social) varchar_pattern_ops);
      CREATE INDEX ix_clientes_libres ON clientes (created_at DESC) WHERE asesor_id IS NULL;

      -- ===== Contactos: máximo 2 por empresa =====
      CREATE TABLE contactos (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        nombre     VARCHAR(100) NOT NULL,
        celular    CHAR(9) NOT NULL CHECK (celular ~ '^9[0-9]{8}$'),
        correo     VARCHAR(150) NULL,
        posicion   SMALLINT NOT NULL CHECK (posicion IN (1, 2)),
        CONSTRAINT ux_contacto_posicion UNIQUE (cliente_id, posicion)
      );

      -- ===== Historial de asignaciones =====
      CREATE TABLE asignaciones (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        asesor_anterior UUID NULL REFERENCES usuarios(id),
        asesor_nuevo    UUID NULL REFERENCES usuarios(id),
        motivo          VARCHAR(15) NOT NULL
                        CHECK (motivo IN ('CREACION','TOMA','REASIGNACION','LIBERACION','CARGA')),
        asignado_por    UUID NULL REFERENCES usuarios(id),  -- NULL = el sistema (liberación automática)
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_asignaciones_cliente ON asignaciones (cliente_id, created_at DESC);
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS asignaciones, contactos, clientes, lote_errores, lotes_importacion CASCADE;`);
  }
}