import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reunión del 25 nov 2026:
 *  - Cada empresa tomada tiene un plazo (retencion_hasta). Si vence sin gestión, vuelve sola al repositorio.
 *  - "No interesado" libera la empresa y nadie la puede tomar por un tiempo (no se le vuelve a llamar).
 *  - Varias llamadas sin respuesta seguidas: la empresa pasa a otro asesor.
 *  - Se mide el tiempo que el asesor pasa en la ficha de la empresa antes de registrar la gestión.
 */
export class Retencion1791270000018 implements MigrationInterface {
  name = 'Retencion1791270000018';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      -- ===== Plazo de cada empresa asignada =====
      ALTER TABLE clientes
        ADD COLUMN retencion_hasta   TIMESTAMPTZ NULL,
        ADD COLUMN prorrogada        BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN aviso_liberacion  BOOLEAN NOT NULL DEFAULT false,
        -- Bloqueo después de liberar: RECHAZO = nadie la toma · SIN_RESPUESTA = el mismo asesor no la retoma
        ADD COLUMN bloqueo_tipo      VARCHAR(13) NULL CHECK (bloqueo_tipo IN ('RECHAZO', 'SIN_RESPUESTA')),
        ADD COLUMN bloqueo_hasta     TIMESTAMPTZ NULL,
        ADD COLUMN ultimo_asesor_id  UUID NULL REFERENCES usuarios(id) ON DELETE SET NULL;
      CREATE INDEX ix_clientes_retencion ON clientes (retencion_hasta) WHERE asesor_id IS NOT NULL AND retencion_hasta IS NOT NULL;
      CREATE INDEX ix_clientes_asesor_retencion ON clientes (asesor_id, retencion_hasta);

      -- Nuevos motivos en el historial de asignaciones
      ALTER TABLE asignaciones DROP CONSTRAINT IF EXISTS asignaciones_motivo_check;
      ALTER TABLE asignaciones ADD CONSTRAINT asignaciones_motivo_check
        CHECK (motivo IN ('CREACION','TOMA','REASIGNACION','LIBERACION','CARGA','DEVUELTA','SIN_RESPUESTA','RECHAZO'));

      -- ===== Tiempo en la ficha de la empresa =====
      CREATE TABLE visitas_ficha (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        cliente_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
        inicio       TIMESTAMPTZ NOT NULL DEFAULT now(),
        ultimo_pulso TIMESTAMPTZ NOT NULL DEFAULT now(),
        segundos     INTEGER NOT NULL DEFAULT 0 CHECK (segundos >= 0)
      );
      CREATE INDEX ix_visitas_ficha ON visitas_ficha (usuario_id, cliente_id, inicio DESC);

      -- Segundos en la ficha desde la gestión anterior (NULL en gestiones antiguas)
      ALTER TABLE gestiones ADD COLUMN segundos_ficha INTEGER NULL;

      -- ===== Parámetros (se editan en Administración → Sistema) =====
      DELETE FROM parametros WHERE clave IN ('dias_liberacion_inactividad', 'dias_aviso_liberacion');
      INSERT INTO parametros (clave, valor, descripcion, tipo, minimo, maximo, editable) VALUES
        ('horas_primer_contacto',      '24', 'Horas para registrar la primera gestión de una empresa tomada o creada', 'numero', 4, 168, true),
        ('dias_retencion_base',        '7',  'Días para la primera gestión de una empresa que llegó en una base asignada', 'numero', 1, 30, true),
        ('horas_sin_respuesta',        '24', 'Horas para volver a intentar después de "No contestó"', 'numero', 4, 168, true),
        ('horas_extra_whatsapp_correo','24', 'Horas extra cuando el intento sin respuesta fue por WhatsApp o correo', 'numero', 0, 72, true),
        ('dias_retencion_interesado',  '7',  'Días que se guarda una empresa interesada o con "Volver a llamar"', 'numero', 1, 30, true),
        ('dias_retencion_negociacion', '15', 'Días que se guarda una empresa con negociación abierta (y tope para interesadas)', 'numero', 1, 60, true),
        ('max_intentos_sin_respuesta', '5',  'Intentos seguidos sin respuesta antes de pasar la empresa a otro asesor', 'numero', 2, 15, true),
        ('dias_espera_sin_respuesta',  '7',  'Días en que el mismo asesor no puede retomar una empresa que no le contestó', 'numero', 0, 60, true),
        ('dias_bloqueo_rechazo',       '90', 'Días en que nadie puede tomar una empresa que dijo "No interesado"', 'numero', 0, 365, true),
        ('horas_aviso_liberacion',     '3',  'Horas antes de liberar una empresa en que se avisa al asesor', 'numero', 1, 24, true),
        ('segundos_minimos_ficha',     '60', 'Segundos mínimos en la ficha para que una llamada no se marque como rápida', 'numero', 0, 600, true);

      -- ===== Empresas que ya están asignadas: plazo inicial amable para no liberar todo de golpe =====
      UPDATE clientes c SET retencion_hasta = GREATEST(COALESCE(c.ultima_gestion_at, c.asignado_at, now()) + interval '7 days', now() + interval '24 hours')
      WHERE c.asesor_id IS NOT NULL AND c.estado = 'PROSPECTO'
        AND NOT EXISTS (SELECT 1 FROM oportunidades o WHERE o.cliente_id = c.id AND o.resultado = 'GANADA' AND o.estado_venta <> 'ANULADA');
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DELETE FROM parametros WHERE clave IN ('horas_primer_contacto','dias_retencion_base','horas_sin_respuesta','horas_extra_whatsapp_correo',
        'dias_retencion_interesado','dias_retencion_negociacion','max_intentos_sin_respuesta','dias_espera_sin_respuesta',
        'dias_bloqueo_rechazo','horas_aviso_liberacion','segundos_minimos_ficha');
      INSERT INTO parametros (clave, valor, descripcion, tipo, minimo, maximo, editable) VALUES
        ('dias_liberacion_inactividad', '30', 'Días sin gestión para que una empresa vuelva al repositorio', 'numero', 7, 180, true),
        ('dias_aviso_liberacion', '3', 'Días de anticipación para avisar que una empresa volverá al repositorio', 'numero', NULL, NULL, false)
      ON CONFLICT (clave) DO NOTHING;
      ALTER TABLE gestiones DROP COLUMN segundos_ficha;
      DROP TABLE IF EXISTS visitas_ficha;
      UPDATE asignaciones SET motivo = 'LIBERACION' WHERE motivo IN ('DEVUELTA','SIN_RESPUESTA','RECHAZO');
      ALTER TABLE asignaciones DROP CONSTRAINT IF EXISTS asignaciones_motivo_check;
      ALTER TABLE asignaciones ADD CONSTRAINT asignaciones_motivo_check
        CHECK (motivo IN ('CREACION','TOMA','REASIGNACION','LIBERACION','CARGA'));
      DROP INDEX IF EXISTS ix_clientes_asesor_retencion;
      DROP INDEX IF EXISTS ix_clientes_retencion;
      ALTER TABLE clientes DROP COLUMN ultimo_asesor_id, DROP COLUMN bloqueo_hasta, DROP COLUMN bloqueo_tipo,
        DROP COLUMN aviso_liberacion, DROP COLUMN prorrogada, DROP COLUMN retencion_hasta;
    `);
  }
}
