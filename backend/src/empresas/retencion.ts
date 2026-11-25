import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ParametrosService } from '../sistema/parametros.service';

/**
 * Reglas de retención de empresas (reunión del 25 nov 2026).
 *
 * Cada empresa asignada a un asesor tiene un plazo: retencion_hasta. Si vence, vuelve al repositorio.
 * El plazo se recalcula cada vez que el asesor registra una gestión:
 *  - Sin gestión todavía (recién tomada o creada) ....... horas_primer_contacto (24 h)
 *  - Sin gestión, llegó en una base asignada ............ dias_retencion_base (7 días)
 *  - Última gestión "No contestó" / "Otro" .............. horas_sin_respuesta (24 h), + horas_extra_whatsapp_correo si fue por WhatsApp o correo
 *  - Última gestión "Interesado" / "Volver a llamar" .... dias_retencion_interesado (7 días), o hasta 1 día después de la próxima acción agendada,
 *                                                          con tope de dias_retencion_negociacion
 *  - Con negociación abierta ............................ al menos dias_retencion_negociacion (15 días) desde la última gestión
 *  - Si el plazo cae en sábado o domingo, pasa al lunes a la misma hora.
 *  - "Mantener 24 h más" suma 24 horas una sola vez hasta la siguiente gestión.
 *  - Una venta ganada no vence nunca (NULL).
 */

export interface Reglas {
  horasPrimerContacto: number;
  diasRetencionBase: number;
  horasSinRespuesta: number;
  horasExtraWhatsappCorreo: number;
  diasRetencionInteresado: number;
  diasRetencionNegociacion: number;
  maxIntentosSinRespuesta: number;
  diasEsperaSinRespuesta: number;
  diasBloqueoRechazo: number;
  horasAvisoLiberacion: number;
  segundosMinimosFicha: number;
}

export interface EstadoCuenta {
  asignadoAt: Date;
  /** La asignación vino de una base cargada (más tiempo para el primer contacto) */
  deBase: boolean;
  /** Última gestión del asesor actual desde que la tiene */
  ultima: { fecha: Date; resultado: string; canal: string; proximaAccion: Date | null } | null;
  negociando: boolean;
  ganada: boolean;
  prorrogada: boolean;
}

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Sábado → lunes, domingo → lunes (misma hora, en Lima) */
export function saltarFinDeSemana(d: Date): Date {
  const dia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', weekday: 'short' }).format(d);
  if (dia === 'Sat') return new Date(+d + 2 * DIA);
  if (dia === 'Sun') return new Date(+d + DIA);
  return d;
}

/** Calcula hasta cuándo el asesor conserva la empresa. NULL = no vence. */
export function calcularRetencion(e: EstadoCuenta, r: Reglas): Date | null {
  if (e.ganada) return null;
  let hasta: number;
  const u = e.ultima;
  if (!u) {
    hasta = +e.asignadoAt + (e.deBase ? r.diasRetencionBase * DIA : r.horasPrimerContacto * HORA);
  } else if (u.resultado === 'INTERESADO' || u.resultado === 'VOLVER_A_LLAMAR') {
    hasta = +u.fecha + r.diasRetencionInteresado * DIA;
    if (u.proximaAccion) hasta = Math.max(hasta, +u.proximaAccion + DIA);
    hasta = Math.min(hasta, +u.fecha + Math.max(r.diasRetencionNegociacion, r.diasRetencionInteresado) * DIA);
  } else {
    const extra = u.canal === 'WHATSAPP' || u.canal === 'CORREO' ? r.horasExtraWhatsappCorreo : 0;
    hasta = +u.fecha + (r.horasSinRespuesta + extra) * HORA;
  }
  if (e.negociando) hasta = Math.max(hasta, +(u?.fecha ?? e.asignadoAt) + r.diasRetencionNegociacion * DIA);
  let fecha = saltarFinDeSemana(new Date(hasta));
  if (e.prorrogada) fecha = saltarFinDeSemana(new Date(+fecha + DIA));
  return fecha;
}

@Injectable()
export class RetencionService {
  constructor(private readonly parametros: ParametrosService) {}

  async reglas(): Promise<Reglas> {
    const n = (clave: string, defecto: number) => this.parametros.numero(clave, defecto);
    return {
      horasPrimerContacto: await n('horas_primer_contacto', 24),
      diasRetencionBase: await n('dias_retencion_base', 7),
      horasSinRespuesta: await n('horas_sin_respuesta', 24),
      horasExtraWhatsappCorreo: await n('horas_extra_whatsapp_correo', 24),
      diasRetencionInteresado: await n('dias_retencion_interesado', 7),
      diasRetencionNegociacion: await n('dias_retencion_negociacion', 15),
      maxIntentosSinRespuesta: await n('max_intentos_sin_respuesta', 5),
      diasEsperaSinRespuesta: await n('dias_espera_sin_respuesta', 7),
      diasBloqueoRechazo: await n('dias_bloqueo_rechazo', 90),
      horasAvisoLiberacion: await n('horas_aviso_liberacion', 3),
      segundosMinimosFicha: await n('segundos_minimos_ficha', 60),
    };
  }

  /** Plazo de una empresa recién asignada (tomada, creada, reasignada) */
  async inicial(deBase = false): Promise<Date> {
    return calcularRetencion(
      { asignadoAt: new Date(), deBase, ultima: null, negociando: false, ganada: false, prorrogada: false },
      await this.reglas(),
    )!;
  }

  /** Vuelve a calcular el plazo de la empresa con su estado actual y lo guarda */
  async recalcular(tx: EntityManager, clienteId: string): Promise<Date | null> {
    const [c] = await tx.query(
      `SELECT c.asesor_id AS "asesorId", c.asignado_at AS "asignadoAt", c.estado, c.prorrogada,
              (SELECT a.motivo FROM asignaciones a WHERE a.cliente_id = c.id ORDER BY a.created_at DESC LIMIT 1) = 'CARGA' AS "deBase",
              EXISTS (SELECT 1 FROM oportunidades o WHERE o.cliente_id = c.id AND o.resultado = 'EN_CURSO') AS negociando,
              EXISTS (SELECT 1 FROM oportunidades o WHERE o.cliente_id = c.id AND o.resultado = 'GANADA' AND o.estado_venta <> 'ANULADA') AS ganada
       FROM clientes c WHERE c.id = $1`, [clienteId],
    );
    if (!c?.asesorId) return null;
    const [u] = await tx.query(
      `SELECT created_at AS fecha, resultado, canal, proxima_accion AS "proximaAccion" FROM gestiones
       WHERE cliente_id = $1 AND usuario_id = $2 AND created_at >= $3 ORDER BY created_at DESC LIMIT 1`,
      [clienteId, c.asesorId, c.asignadoAt ?? new Date(0)],
    );
    const hasta = calcularRetencion({
      asignadoAt: c.asignadoAt ?? new Date(),
      deBase: !!c.deBase,
      ultima: u ? { fecha: u.fecha, resultado: u.resultado, canal: u.canal, proximaAccion: u.proximaAccion } : null,
      negociando: c.negociando,
      ganada: c.ganada || c.estado === 'VENTA',
      prorrogada: c.prorrogada,
    }, await this.reglas());
    await tx.query(`UPDATE clientes SET retencion_hasta = $1, aviso_liberacion = false WHERE id = $2`, [hasta, clienteId]);
    return hasta;
  }
}
