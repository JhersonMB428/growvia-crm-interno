import { MigrationInterface, QueryRunner } from 'typeorm';

export class Administracion1791270000014 implements MigrationInterface {
  name = 'Administracion1791270000014';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- Contraseña temporal (usuario nuevo o restablecida): al entrar debe elegir una propia
      ALTER TABLE usuarios ADD COLUMN clave_temporal BOOLEAN NOT NULL DEFAULT false;

      -- Un supervisor dirige un solo equipo
      CREATE UNIQUE INDEX ux_equipo_supervisor ON equipos (supervisor_id) WHERE supervisor_id IS NOT NULL;

      -- Parámetros editables desde la pantalla, con sus límites
      ALTER TABLE parametros
        ADD COLUMN tipo     VARCHAR(10) NOT NULL DEFAULT 'numero' CHECK (tipo IN ('numero', 'hora')),
        ADD COLUMN minimo   INT NULL,
        ADD COLUMN maximo   INT NULL,
        ADD COLUMN editable BOOLEAN NOT NULL DEFAULT true;
      UPDATE parametros SET minimo = 7,  maximo = 180  WHERE clave = 'dias_liberacion_inactividad';
      UPDATE parametros SET minimo = 0,  maximo = 1000 WHERE clave = 'limite_toma_repositorio';
      UPDATE parametros SET minimo = 0,  maximo = 10   WHERE clave = 'max_correcciones_venta';
      UPDATE parametros SET minimo = 0,  maximo = 240  WHERE clave = 'minutos_recordatorio_defecto';
      UPDATE parametros SET minimo = 1,  maximo = 30   WHERE clave = 'dias_dispositivo_confiable';
      UPDATE parametros SET minimo = 3,  maximo = 30   WHERE clave = 'minutos_validez_codigo';
      UPDATE parametros SET minimo = 3,  maximo = 10   WHERE clave = 'max_intentos_codigo';
      UPDATE parametros SET tipo = 'hora' WHERE clave = 'hora_resumen_diario';
      -- Fijos: el acceso celular está limitado a 30 días en la base de datos; el aviso de liberación aún no se usa
      UPDATE parametros SET editable = false WHERE clave IN ('dias_max_acceso_movil', 'dias_aviso_liberacion');
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE parametros DROP COLUMN editable, DROP COLUMN maximo, DROP COLUMN minimo, DROP COLUMN tipo;
      DROP INDEX IF EXISTS ux_equipo_supervisor;
      ALTER TABLE usuarios DROP COLUMN clave_temporal;
    `);
  }
}