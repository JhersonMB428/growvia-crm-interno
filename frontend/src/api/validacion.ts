import { api } from './cliente';
import type { EstadoVenta } from './negociaciones';

export type Bandeja = 'aprobar' | 'revisar' | 'validar' | 'posventa';
export type EventoPosventa = 'CHIPS_ENTREGADOS' | 'PORTABILIDAD_EJECUTADA' | 'SERVICIO_ACTIVO';

export interface VentaEnBandeja {
  id: string;
  codigo: string;
  tipo: 'NUEVA' | 'AMPLIACION';
  estadoVenta: EstadoVenta;
  correcciones: number;
  fechaCierre: string;
  fechaValidacion: string | null;
  ordenOperador: string | null;
  clienteId: string;
  razonSocial: string;
  ruc: string;
  asesor: string;
  equipo: string | null;
  pasoActual: string | null;
  lineas: number;
  portabilidades: number;
  total: number;
  ultimaObservacion: string | null;
  revisada: boolean;
  eventos: EventoPosventa[];
  documentos: number;
}

export interface PuntoChecklist { id: number; texto: string; soloPortabilidad: boolean }

export interface ResumenBackoffice {
  porValidar: number; enPosventa: number; validadasHoy: number; validadasMes: number; observadasMes: number;
  activadasMes: number; horasProcesamiento: number; diasActivacion: number; activas90: number; validadas90: number;
  porDia: { dia: string; validadas: number }[];
  esperando: { id: string; codigo: string; razonSocial: string; asesor: string; horas: number | null }[];
}

const post = (ruta: string, cuerpo: object = {}) => api<{ ok: boolean; anulada?: boolean }>(ruta, { metodo: 'POST', cuerpo });

export const validacionApi = {
  bandeja: (tipo: Bandeja) => api<{ filas: VentaEnBandeja[] }>(`/validacion/bandeja/${tipo}`),
  contadores: () => api<Record<Bandeja, number>>('/validacion/contadores'),
  aprobar: (id: string, comentario?: string) => post(`/validacion/${id}/aprobar`, { comentario }),
  revisar: (id: string, comentario?: string) => post(`/validacion/${id}/revisar`, { comentario }),
  observar: (id: string, comentario: string) => post(`/validacion/${id}/observar`, { comentario }),
  detener: (id: string, comentario: string) => post(`/validacion/${id}/detener`, { comentario }),
  validar: (id: string, checklist: number[], comentario?: string) => post(`/validacion/${id}/validar`, { checklist, comentario }),
  posventa: (id: string, evento: EventoPosventa, ordenOperador?: string) => post(`/validacion/${id}/posventa`, { evento, ordenOperador }),
  checklist: () => api<PuntoChecklist[]>('/validacion/checklist'),
  resumen: () => api<ResumenBackoffice>('/validacion/resumen'),
  reenviar: (id: string) => post(`/negociaciones/${id}/reenviar`),
};

export const TEXTO_DECISION: Record<string, string> = {
  APROBADA: 'Aprobó', REVISADA: 'Dio visto bueno', OBSERVADA: 'Observó', DETENIDA: 'Detuvo la venta',
  VALIDADA: 'Validó', REENVIADA: 'Corrigió y reenvió', ANULADA: 'Venta anulada',
};
export const TEXTO_EVENTO: Record<EventoPosventa, string> = {
  CHIPS_ENTREGADOS: 'Chips entregados', PORTABILIDAD_EJECUTADA: 'Portabilidad ejecutada', SERVICIO_ACTIVO: 'Servicio activo',
};