import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CorreoService } from '../correo/correo.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ParametrosService } from '../sistema/parametros.service';

const ZONA = 'America/Lima';
const HOY_LIMA = `(now() AT TIME ZONE '${ZONA}')::date`;
const INICIO_HOY = `date_trunc('day', now() AT TIME ZONE '${ZONA}') AT TIME ZONE '${ZONA}'`;
/** Pendiente y la empresa sigue siendo del asesor */
const PENDIENTE = `g.proxima_accion IS NOT NULL AND g.proxima_hecha_at IS NULL AND c.asesor_id = g.usuario_id AND u.activo`;

const VERBO: Record<string, string> = {
  LLAMADA: 'llamar a', WHATSAPP: 'escribir por WhatsApp a', CORREO: 'enviar un correo a', VISITA: 'visitar a',
};
const hora = (d: Date) => new Date(d).toLocaleTimeString('es-PE', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
/** Evita el doble punto en "S.A.C.." */
const cerrar = (t: string) => (t.endsWith('.') ? t : `${t}.`);
const filasDe = <T>(r: unknown): T[] => (Array.isArray((r as unknown[])[0]) ? (r as T[][])[0] : (r as T[]));

/**
 * Avisos automáticos de la agenda:
 * - Recordatorio X minutos antes de cada gestión (X = preferencia del usuario).
 * - Resumen del día a la hora del parámetro hora_resumen_diario (campanita + correo si lo tiene activado).
 * - Gestiones atrasadas: al día siguiente, al asesor y a su supervisor.
 */
@Injectable()
export class RecordatoriosService {
  private readonly logger = new Logger('Agenda');

  constructor(
    private readonly db: DataSource,
    private readonly notificaciones: NotificacionesService,
    private readonly correo: CorreoService,
    private readonly parametros: ParametrosService,
  ) {}

  @Cron('* * * * *')
  async recordatorios(): Promise<number> {
    const filas = filasDe<{ id: string; usuario_id: string; proxima_accion: Date; proximo_canal: string; razon_social: string; cliente_id: string }>(
      await this.db.query(
        `WITH vencen AS (
           SELECT g.id, g.usuario_id, g.proxima_accion, g.proximo_canal, c.razon_social, g.cliente_id
           FROM gestiones g JOIN clientes c ON c.id = g.cliente_id JOIN usuarios u ON u.id = g.usuario_id
           WHERE ${PENDIENTE} AND NOT g.recordatorio_enviado
             AND g.proxima_accion <= now() + make_interval(mins => u.minutos_recordatorio)
             AND g.proxima_accion > now() - interval '30 minutes'
           FOR UPDATE OF g SKIP LOCKED
         )
         UPDATE gestiones SET recordatorio_enviado = true FROM vencen WHERE gestiones.id = vencen.id
         RETURNING vencen.*`,
      ),
    );
    for (const g of filas) {
      await this.notificaciones.crear(g.usuario_id, {
        tipo: 'GESTION_PROXIMA',
        titulo: 'Recordatorio',
        mensaje: cerrar(`A las ${hora(g.proxima_accion)}: ${VERBO[g.proximo_canal] ?? 'contactar a'} ${g.razon_social}`),
        entidad: 'EMPRESA',
        entidadId: g.cliente_id,
      });
    }
    return filas.length;
  }

  @Cron('*/5 * * * *')
  async tareasDelDia() {
    await this.resumenDiario();
    await this.atrasadas();
  }

  /** Un aviso por asesor y por día, a partir de la hora configurada */
  async resumenDiario(forzar = false): Promise<number> {
    const horaParam = await this.parametros.texto('hora_resumen_diario', '08:00');
    const ahora = new Date().toLocaleTimeString('es-PE', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false });
    if (!forzar && ahora < horaParam) return 0;

    const asesores: { id: string; email: string; nombres: string; avisoCorreo: boolean; n: number; primera: Date }[] = await this.db.query(
      `SELECT u.id, u.email, u.nombres, u.aviso_correo AS "avisoCorreo", count(*)::int AS n, min(g.proxima_accion) AS primera
       FROM gestiones g JOIN usuarios u ON u.id = g.usuario_id JOIN clientes c ON c.id = g.cliente_id
       WHERE ${PENDIENTE} AND (g.proxima_accion AT TIME ZONE '${ZONA}')::date = ${HOY_LIMA}
         AND NOT EXISTS (SELECT 1 FROM notificaciones n WHERE n.usuario_id = u.id AND n.tipo = 'GESTION_HOY'
                         AND (n.created_at AT TIME ZONE '${ZONA}')::date = ${HOY_LIMA})
       GROUP BY u.id`,
    );
    for (const a of asesores) {
      const idNotif = await this.notificaciones.crear(a.id, {
        tipo: 'GESTION_HOY',
        titulo: 'Tus gestiones de hoy',
        mensaje: `Tienes ${a.n} ${a.n === 1 ? 'gestión agendada' : 'gestiones agendadas'} para hoy. La primera es a las ${hora(a.primera)}.`,
      });
      if (a.avisoCorreo) {
        const lista: { proxima_accion: Date; proximo_canal: string; razon_social: string }[] = await this.db.query(
          `SELECT g.proxima_accion, g.proximo_canal, c.razon_social
           FROM gestiones g JOIN clientes c ON c.id = g.cliente_id JOIN usuarios u ON u.id = g.usuario_id
           WHERE g.usuario_id = $1 AND ${PENDIENTE} AND (g.proxima_accion AT TIME ZONE '${ZONA}')::date = ${HOY_LIMA}
           ORDER BY g.proxima_accion`, [a.id],
        );
        const texto = `Hola ${a.nombres}:\n\nEstas son tus gestiones de hoy:\n`
          + lista.map((g) => `• ${hora(g.proxima_accion)} · ${VERBO[g.proximo_canal] ?? 'contactar a'} ${g.razon_social}`).join('\n')
          + '\n\nRegístralas en el CRM cuando las hagas.';
        try {
          await this.correo.enviar(a.email, `Growvia CRM · ${a.n} ${a.n === 1 ? 'gestión' : 'gestiones'} para hoy`, texto);
          await this.db.query(`UPDATE notificaciones SET enviada_correo = true WHERE id = $1`, [idNotif]);
        } catch (e) {
          this.logger.error(`No se pudo enviar el resumen a ${a.email}: ${(e as Error).message}`);
        }
      }
    }
    return asesores.length;
  }

  /** Gestiones de días anteriores sin hacer: avisa una sola vez al asesor y a su supervisor */
  async atrasadas(): Promise<number> {
    const filas = filasDe<{ usuario_id: string }>(
      await this.db.query(
        `WITH a AS (
           SELECT g.id, g.usuario_id FROM gestiones g
           JOIN clientes c ON c.id = g.cliente_id JOIN usuarios u ON u.id = g.usuario_id
           WHERE ${PENDIENTE} AND NOT g.atraso_avisado AND g.proxima_accion < ${INICIO_HOY}
           FOR UPDATE OF g SKIP LOCKED
         )
         UPDATE gestiones SET atraso_avisado = true FROM a WHERE gestiones.id = a.id RETURNING a.usuario_id`,
      ),
    );
    const porAsesor = new Map<string, number>();
    for (const f of filas) porAsesor.set(f.usuario_id, (porAsesor.get(f.usuario_id) ?? 0) + 1);

    for (const [asesorId, n] of porAsesor) {
      const [u] = await this.db.query(
        `SELECT u.nombres || ' ' || u.apellidos AS nombre, e.supervisor_id AS "supervisorId"
         FROM usuarios u LEFT JOIN equipos e ON e.id = u.equipo_id WHERE u.id = $1`, [asesorId],
      );
      const texto = `${n} ${n === 1 ? 'gestión no realizada' : 'gestiones no realizadas'}`;
      await this.notificaciones.crear(asesorId, {
        tipo: 'GESTIONES_ATRASADAS',
        titulo: 'Gestiones no realizadas',
        mensaje: `Tienes ${texto} de días anteriores. ${n === 1 ? 'Márcala como hecha o reprográmala' : 'Márcalas como hechas o reprográmalas'} desde tu agenda.`,
      });
      if (u?.supervisorId && u.supervisorId !== asesorId) {
        await this.notificaciones.crear(u.supervisorId, {
          tipo: 'GESTIONES_ATRASADAS',
          titulo: 'No realizadas en tu equipo',
          mensaje: `${u.nombre} tiene ${texto}.`,
        });
      }
    }
    return filas.length;
  }
}