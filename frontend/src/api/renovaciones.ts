import { api } from './cliente';

export type FiltroRenovacion = 'proximas' | 'vencidas' | 'renovadas' | 'todas';
export type EstadoRenovacion = 'PENDIENTE' | 'EN_NEGOCIACION' | 'RENOVADA' | 'PERDIDA';

export interface ContratoPorVencer {
  id: string;
  codigo: string;
  clienteId: string;
  razonSocial: string;
  ruc: string;
  asesorId: string | null;
  asesor: string | null;
  equipo: string | null;
  plazoMeses: number;
  activadaAt: string;
  fin: string;
  dias: number;
  lineas: number;
  total: number;
  renovacionId: string | null;
  renovacionCodigo: string | null;
  estado: EstadoRenovacion;
}

export interface ResumenRenovaciones {
  vencen30: number;
  vencenVentana: number;
  vencidos: number;
  enNegociacion: number;
  renovadas: number;
  /** % de contratos vencidos en los últimos 12 meses que se renovaron (null si aún no venció ninguno) */
  tasaRenovacion: number | null;
}

export interface ContratoCompetencia {
  id: string;
  razonSocial: string;
  ruc: string;
  asesorId: string | null;
  asesor: string | null;
  equipo: string | null;
  operador: string | null;
  fin: string;
  dias: number;
  negociacionId: string | null;
}

const query = (f: { filtro: FiltroRenovacion; dias?: number; q?: string }) => {
  const p = new URLSearchParams({ filtro: f.filtro });
  if (f.dias) p.set('dias', String(f.dias));
  if (f.q?.trim()) p.set('q', f.q.trim());
  return p.toString();
};

export const renovacionesApi = {
  contratos: (f: { filtro: FiltroRenovacion; dias?: number; q?: string }) =>
    api<{ ventana: number; resumen: ResumenRenovaciones; filas: ContratoPorVencer[] }>(`/renovaciones/contratos?${query(f)}`),
  competencia: (f: { filtro: FiltroRenovacion; dias?: number; q?: string }) =>
    api<{ ventana: number; filas: ContratoCompetencia[] }>(`/renovaciones/competencia?${query(f)}`),
};

export const TEXTO_ESTADO_RENOVACION: Record<EstadoRenovacion, string> = {
  PENDIENTE: 'Sin iniciar', EN_NEGOCIACION: 'En negociación', RENOVADA: 'Renovado', PERDIDA: 'Renovación perdida',
};

/** "Vence en 12 días" · "Vence hoy" · "Venció hace 3 días" */
export function textoDias(dias: number) {
  if (dias === 0) return 'Vence hoy';
  if (dias > 0) return `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`;
  return `Venció hace ${-dias} ${dias === -1 ? 'día' : 'días'}`;
}

/** Color del aviso según la urgencia */
export const urgencia = (dias: number) => (dias < 0 ? 'vencido' : dias <= 30 ? 'urgente' : dias <= 60 ? 'pronto' : 'tranquilo');