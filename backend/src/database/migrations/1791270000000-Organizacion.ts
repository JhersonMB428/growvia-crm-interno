import { MigrationInterface, QueryRunner } from 'typeorm';

export class Organizacion1791270000000 implements MigrationInterface {
  name = 'Organizacion1791270000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Roles y permisos =====
      CREATE TABLE roles (
        id      SMALLSERIAL PRIMARY KEY,
        codigo  VARCHAR(30) NOT NULL UNIQUE,
        nombre  VARCHAR(60) NOT NULL
      );

      CREATE TABLE permisos (
        id          SMALLSERIAL PRIMARY KEY,
        codigo      VARCHAR(60)  NOT NULL UNIQUE,
        modulo      VARCHAR(40)  NOT NULL,
        descripcion VARCHAR(200) NOT NULL
      );

      CREATE TABLE rol_permisos (
        rol_id     SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permiso_id SMALLINT NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
        PRIMARY KEY (rol_id, permiso_id)
      );

      -- ===== Usuarios y equipos =====
      CREATE TABLE usuarios (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombres              VARCHAR(80)  NOT NULL,
        apellidos            VARCHAR(80)  NOT NULL,
        email                VARCHAR(150) NOT NULL,
        password_hash        VARCHAR(100) NOT NULL,
        rol_id               SMALLINT NOT NULL REFERENCES roles(id),
        equipo_id            UUID NULL,
        activo               BOOLEAN NOT NULL DEFAULT TRUE,
        aviso_correo         BOOLEAN NOT NULL DEFAULT TRUE,
        minutos_recordatorio SMALLINT NOT NULL DEFAULT 30 CHECK (minutos_recordatorio BETWEEN 0 AND 240),
        creado_por           UUID NULL REFERENCES usuarios(id),
        created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX ux_usuarios_email ON usuarios (lower(email));
      CREATE INDEX ix_usuarios_rol ON usuarios (rol_id);

      CREATE TABLE equipos (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre        VARCHAR(60) NOT NULL UNIQUE,
        supervisor_id UUID NULL REFERENCES usuarios(id),
        activo        BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE usuarios
        ADD CONSTRAINT fk_usuarios_equipo FOREIGN KEY (equipo_id) REFERENCES equipos(id);
      CREATE INDEX ix_usuarios_equipo ON usuarios (equipo_id);

      CREATE TABLE historial_equipos (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id      UUID NOT NULL REFERENCES usuarios(id),
        equipo_anterior UUID NULL REFERENCES equipos(id),
        equipo_nuevo    UUID NULL REFERENCES equipos(id),
        cambiado_por    UUID NOT NULL REFERENCES usuarios(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX ix_hist_equipos_usuario ON historial_equipos (usuario_id, created_at DESC);

      -- ===== Acceso desde celular =====
      CREATE TABLE accesos_moviles (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id   UUID NOT NULL REFERENCES usuarios(id),
        motivo       TEXT NOT NULL,
        estado       VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                     CHECK (estado IN ('PENDIENTE','APROBADA','RECHAZADA','VENCIDA','REVOCADA')),
        aprobado_por UUID NULL REFERENCES usuarios(id),
        desde        TIMESTAMPTZ NULL,
        hasta        TIMESTAMPTZ NULL,
        revocado_por UUID NULL REFERENCES usuarios(id),
        revocado_at  TIMESTAMPTZ NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_acceso_aprobado CHECK (
          estado <> 'APROBADA'
          OR (desde IS NOT NULL AND hasta IS NOT NULL AND hasta > desde AND hasta <= desde + INTERVAL '30 days')
        )
      );
      CREATE INDEX ix_accesos_usuario_estado ON accesos_moviles (usuario_id, estado);

      -- ===== Verificación en dos pasos =====
      CREATE TABLE codigos_verificacion (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id  UUID NOT NULL REFERENCES usuarios(id),
        codigo_hash VARCHAR(100) NOT NULL,
        proposito   VARCHAR(10) NOT NULL CHECK (proposito IN ('LOGIN','RECUPERAR')),
        expira_at   TIMESTAMPTZ NOT NULL,
        intentos    SMALLINT NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 5),
        usado_at    TIMESTAMPTZ NULL,
        ip          INET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ck_codigo_expira CHECK (expira_at > created_at)
      );
      CREATE INDEX ix_codigos_usuario ON codigos_verificacion (usuario_id, created_at DESC);

      CREATE TABLE dispositivos_confiables (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id    UUID NOT NULL REFERENCES usuarios(id),
        huella_hash   VARCHAR(100) NOT NULL,
        nombre        VARCHAR(120) NULL,
        expira_at     TIMESTAMPTZ NOT NULL,
        ultimo_uso_at TIMESTAMPTZ NULL,
        revocado_at   TIMESTAMPTZ NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT ux_dispositivo UNIQUE (usuario_id, huella_hash)
      );

      -- ===== Ubigeo (INEI) =====
      CREATE TABLE departamentos (
        id     CHAR(2) PRIMARY KEY,
        nombre VARCHAR(60) NOT NULL
      );
      CREATE TABLE provincias (
        id              CHAR(4) PRIMARY KEY,
        departamento_id CHAR(2) NOT NULL REFERENCES departamentos(id),
        nombre          VARCHAR(60) NOT NULL
      );
      CREATE INDEX ix_provincias_dep ON provincias (departamento_id);
      CREATE TABLE distritos (
        id           CHAR(6) PRIMARY KEY,
        provincia_id CHAR(4) NOT NULL REFERENCES provincias(id),
        nombre       VARCHAR(80) NOT NULL
      );
      CREATE INDEX ix_distritos_prov ON distritos (provincia_id);

      -- ===== Parámetros del sistema =====
      CREATE TABLE parametros (
        clave           VARCHAR(60) PRIMARY KEY,
        valor           VARCHAR(200) NOT NULL,
        descripcion     VARCHAR(200) NULL,
        actualizado_por UUID NULL REFERENCES usuarios(id),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TABLE IF EXISTS parametros, distritos, provincias, departamentos,
        dispositivos_confiables, codigos_verificacion, accesos_moviles, historial_equipos CASCADE;
      ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS fk_usuarios_equipo;
      DROP TABLE IF EXISTS equipos, usuarios, rol_permisos, permisos, roles CASCADE;
    `);
  }
}