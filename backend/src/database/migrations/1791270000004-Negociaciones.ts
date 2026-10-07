import { MigrationInterface, QueryRunner } from 'typeorm';

export class Negociaciones1791270000004 implements MigrationInterface {
  name = 'Negociaciones1791270000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Catálogos (se editan desde Administración, sin programar) =====
      CREATE TABLE planes_servicio (
        id        SMALLSERIAL PRIMARY KEY,
        tipo      VARCHAR(5) NOT NULL CHECK (tipo IN ('MOVIL','FIJA')),
        nombre    VARCHAR(60) NOT NULL,
        cargo_ref NUMERIC(10,2) NULL CHECK (cargo_ref >= 0),   -- cargo fijo de referencia (sugerido)
        activo    BOOLEAN NOT NULL DEFAULT true,
        CONSTRAINT ux_plan_nombre UNIQUE (tipo, nombre)
      );

      CREATE TABLE operadores (
        id     SMALLSERIAL PRIMARY KEY,
        nombre VARCHAR(40) NOT NULL UNIQUE,
        activo BOOLEAN NOT NULL DEFAULT true
      );

      -- Cadena de validación de una venta ganada (orden configurable)
      CREATE TABLE pasos_validacion (
        id          SMALLSERIAL PRIMARY KEY,
        orden       SMALLINT NOT NULL UNIQUE,
        rol_id      SMALLINT NOT NULL REFERENCES roles(id),
        nombre      VARCHAR(60) NOT NULL,
        bloqueante  BOOLEAN NOT NULL DEFAULT true,   -- false = revisa sin frenar la venta
        activo      BOOLEAN NOT NULL DEFAULT true
      );

      -- ===== Oportunidades (negociaciones) =====
      CREATE SEQUENCE oportunidad_codigo_seq;

      CREATE TABLE oportunidades (
        id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo           VARCHAR(20) NOT NULL UNIQUE,              -- OP-2026-000123
        cliente_id       UUID NOT NULL REFERENCES clientes(id),
        asesor_id        UUID NOT NULL REFERENCES usuarios(id),
        tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('NUEVA','AMPLIACION')),
        etapa            VARCHAR(12) NOT NULL DEFAULT 'PROSPECCION'
                         CHECK (etapa IN ('PROSPECCION','CONTACTO','NEGOCIACION','CIERRE')),
        resultado        VARCHAR(8) NOT NULL DEFAULT 'EN_CURSO' CHECK (resultado IN ('EN_CURSO','GANADA','PERDIDA')),
        motivo_perdida   VARCHAR(200) NULL,
        equipo_id        UUID NULL REFERENCES equipos(id),          -- equipo del asesor al ganar; no cambia después
        estado_venta     VARCHAR(13) NULL
                         CHECK (estado_venta IN ('EN_VALIDACION','OBSERVADA','VALIDADA','EN_POSVENTA','ACTIVA','ANULADA')),
        paso_actual_id   SMALLINT NULL REFERENCES pasos_validacion(id),
        correcciones     SMALLINT NOT NULL DEFAULT 0 CHECK (correcciones BETWEEN 0 AND 3),
        fecha_cierre     TIMESTAMPTZ NULL,
        fecha_validacion TIMESTAMPTZ NULL,
        fecha_activacion TIMESTAMPTZ NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT ck_op_perdida   CHECK (resultado <> 'PERDIDA' OR motivo_perdida IS NOT NULL),
        CONSTRAINT ck_op_cierre    CHECK ((resultado = 'EN_CURSO' AND fecha_cierre IS NULL AND etapa <> 'CIERRE')
                                       OR (resultado <> 'EN_CURSO' AND fecha_cierre IS NOT NULL AND etapa = 'CIERRE')),
        CONSTRAINT ck_op_venta     CHECK ((resultado = 'GANADA') = (estado_venta IS NOT NULL)),
        CONSTRAINT ck_op_equipo    CHECK (resultado <> 'GANADA' OR equipo_id IS NOT NULL),
        CONSTRAINT ck_op_validada  CHECK (estado_venta NOT IN ('VALIDADA','EN_POSVENTA','ACTIVA') OR fecha_validacion IS NOT NULL),
        CONSTRAINT ck_op_activa    CHECK (estado_venta <> 'ACTIVA' OR fecha_activacion IS NOT NULL),
        CONSTRAINT ck_op_paso      CHECK ((estado_venta = 'EN_VALIDACION') = (paso_actual_id IS NOT NULL))
      );
      CREATE INDEX ix_op_cliente ON oportunidades (cliente_id, created_at DESC);
      CREATE INDEX ix_op_asesor ON oportunidades (asesor_id, resultado);
      CREATE INDEX ix_op_equipo ON oportunidades (equipo_id, fecha_cierre);
      -- Una sola negociación abierta por empresa
      CREATE UNIQUE INDEX ux_op_abierta ON oportunidades (cliente_id) WHERE resultado = 'EN_CURSO';

      CREATE TABLE oportunidad_items (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oportunidad_id     UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
        plan_id            SMALLINT NOT NULL REFERENCES planes_servicio(id),
        modalidad          VARCHAR(12) NOT NULL CHECK (modalidad IN ('NUEVA','PORTABILIDAD')),
        operador_origen_id SMALLINT NULL REFERENCES operadores(id),
        cantidad           INT NOT NULL CHECK (cantidad > 0),
        cargo_fijo_unit    NUMERIC(10,2) NOT NULL CHECK (cargo_fijo_unit >= 0),   -- mensual por unidad
        CONSTRAINT ck_item_operador CHECK ((modalidad = 'PORTABILIDAD') = (operador_origen_id IS NOT NULL))
      );
      CREATE INDEX ix_items_op ON oportunidad_items (oportunidad_id);

      CREATE TABLE historial_etapas (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        oportunidad_id  UUID NOT NULL REFERENCES oportunidades(id) ON DELETE CASCADE,
        etapa_anterior  VARCHAR(12) NULL,
        etapa_nueva     VARCHAR(12) NOT NULL,
        detalle         VARCHAR(200) NULL,
        usuario_id      UUID NULL REFERENCES usuarios(id),          -- NULL = el sistema
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_hist_etapas_op ON historial_etapas (oportunidad_id, created_at DESC);

      -- ===== Datos iniciales =====
      INSERT INTO planes_servicio (tipo, nombre, cargo_ref) VALUES
        ('MOVIL', 'Línea móvil', 60),
        ('FIJA',  'Mono', 89),
        ('FIJA',  'Dúo',  129),
        ('FIJA',  'Trío', 189);

      INSERT INTO operadores (nombre) VALUES ('Movistar'), ('Entel'), ('Bitel');

      INSERT INTO pasos_validacion (orden, rol_id, nombre, bloqueante)
      SELECT v.orden, r.id, v.nombre, v.bloqueante
      FROM (VALUES (1, 'SUPERVISOR', 'Aprobación del supervisor', true),
                   (2, 'GERENTE',    'Revisión de gerencia',      false),
                   (3, 'BACKOFFICE', 'Validación de back office', true)) AS v(orden, rol, nombre, bloqueante)
      JOIN roles r ON r.codigo = v.rol;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS historial_etapas, oportunidad_items, oportunidades, pasos_validacion, operadores, planes_servicio CASCADE;
      DROP SEQUENCE IF EXISTS oportunidad_codigo_seq;
    `);
  }
}