import { api } from './cliente';

export type Canal = 'LLAMADA' | 'WHATSAPP' | 'CORREO' | 'VISITA';
export type ResultadoGestion = 'INTERESADO' | 'NO_CONTESTA' | 'VOLVER_A_LLAMAR' | 'RECHAZA' | 'OTRO';

export interface Gestion {
  id: string;
  clienteId: string;
  razonSocial: string;
  oportunidadId: string | null;
  codigoNegociacion: string | null;
  canal: Canal;
  resultado: ResultadoGestion;
  comentario: string;
  proximaAccion: string | null;
  proximoCanal: Canal | null;
  proximaHechaAt: string | null;
  reprogramaciones: number;
  fecha: string;
  usuario: string;
}

export interface NuevaGestion {
  clienteId: string;
  canal: Canal;
  resultado: ResultadoGestion;
  comentario: string;
  proximaAccion?: string;
  proximoCanal?: Canal;
}

export interface Notificacion {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  entidad: 'EMPRESA' | 'NEGOCIACION' | 'GESTION' | 'LOTE' | 'ACCESO' | null;
  entidadId: string | null;
  fecha: string;
  leida: boolean;
}

export const gestionesApi = {
  crear: (g: NuevaGestion) => api<Gestion>('/gestiones', { metodo: 'POST', cuerpo: g }),
  deEmpresa: (clienteId: string) => api<{ filas: Gestion[]; puedeRegistrar: boolean }>(`/empresas/${clienteId}/gestiones`),
  reprogramar: (id: string, proximaAccion: string, proximoCanal?: Canal) =>
    api<Gestion>(`/gestiones/${id}/reprogramar`, { metodo: 'PUT', cuerpo: { proximaAccion, proximoCanal } }),
  agenda: (desde: string, hasta: string) => api<{ items: Gestion[]; atrasadas: Gestion[] }>(`/agenda?desde=${desde}&hasta=${hasta}`),
};

/** Avisa a la campanita que cambió el número de no leídas */
export const avisarCampana = () => window.dispatchEvent(new Event('gv-notificaciones'));

export const notificacionesApi = {
  listar: (soloSinLeer: boolean) => api<{ filas: Notificacion[]; sinLeer: number }>(`/notificaciones${soloSinLeer ? '?filtro=sin-leer' : ''}`),
  contador: () => api<{ sinLeer: number }>('/notificaciones/contador'),
  leida: (id: string) => api<{ sinLeer: number }>(`/notificaciones/${id}/leida`, { metodo: 'POST' }),
  leerTodas: () => api<{ sinLeer: number }>('/notificaciones/leer-todas', { metodo: 'POST' }),
};

// ───────── Textos y fechas ─────────
export const CANALES: { valor: Canal; texto: string }[] = [
  { valor: 'LLAMADA', texto: 'Llamada' },
  { valor: 'WHATSAPP', texto: 'WhatsApp' },
  { valor: 'CORREO', texto: 'Correo' },
  { valor: 'VISITA', texto: 'Visita' },
];
export const TEXTO_CANAL: Record<Canal, string> = { LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp', CORREO: 'Correo', VISITA: 'Visita' };
export const RESULTADOS: { valor: ResultadoGestion; texto: string }[] = [
  { valor: 'INTERESADO', texto: 'Interesado' },
  { valor: 'NO_CONTESTA', texto: 'No contesta' },
  { valor: 'VOLVER_A_LLAMAR', texto: 'Volver a llamar' },
  { valor: 'RECHAZA', texto: 'Rechaza' },
  { valor: 'OTRO', texto: 'Otro' },
];
export const TEXTO_RESULTADO = Object.fromEntries(RESULTADOS.map((r) => [r.valor, r.texto])) as Record<ResultadoGestion, string>;

/** Horas que se ofrecen para agendar (cada 30 min, de 7:00 a 20:00) */
export const HORAS = Array.from({ length: 27 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** "2026-10-06" en hora local */
export const fechaISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Une fecha (AAAA-MM-DD) y hora (HH:MM) locales y devuelve ISO */
export const unirFechaHora = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00`).toISOString();
export const horaCorta = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
export const diaCorto = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' });

/**
 * Estado de la acción agendada:
 * - hecha: ya se registró la gestión siguiente
 * - no_realizada: su día ya pasó y no se registró nada (se puede hacer tarde o reprogramar)
 * - pendiente: todavía está a tiempo
 */
export function estadoProxima(g: Pick<Gestion, 'proximaAccion' | 'proximaHechaAt'>): 'hecha' | 'no_realizada' | 'pendiente' | null {
  if (!g.proximaAccion) return null;
  if (g.proximaHechaAt) return 'hecha';
  return new Date(g.proximaAccion) < new Date(new Date().setHours(0, 0, 0, 0)) ? 'no_realizada' : 'pendiente';
}