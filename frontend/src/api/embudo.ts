import { api } from './cliente';
import type { Etapa } from './negociaciones';

export interface ReporteEmbudo {
  desde: string;
  hasta: string;
  diasEstancada: number;
  /** Negociaciones abiertas en el periodo y hasta qué etapa llegaron */
  embudo: { abiertas: number; contacto: number; negociacion: number; ganadas: number; activas: number; perdidas: number; enCurso: number };
  /** Negociaciones cerradas en el periodo */
  cierres: {
    ganadas: number; perdidas: number; anuladas: number; cicloGanada: number; cicloPerdida: number;
    cargoGanado: number; cargoPerdido: number; lineasPerdidas: number; tasa: number | null;
  };
  tiempos: { etapa: Etapa; dias: number; n: number }[];
  porMotivo: { motivo: string; n: number; lineas: number; cargo: number }[];
  porEtapa: { etapa: Etapa; n: number }[];
  otros: { id: string; codigo: string; motivo: string; fecha: string; asesor: string }[];
  asesores: { id: string; asesor: string; equipo: string | null; creadas: number; ganadas: number; perdidas: number; ciclo: number; cargoGanado: number; motivoPrincipal: string | null }[];
  estancadas: { id: string; codigo: string; etapa: Etapa; razonSocial: string; asesor: string; cargo: number; dias: number }[];
  filtros: { equipos: { id: string; nombre: string }[]; asesores: { id: string; nombre: string; equipoId: string | null }[] };
}

export interface FiltrosEmbudo { desde: string; hasta: string; equipoId?: string; asesorId?: string }

export const embudoApi = {
  reporte: (f: FiltrosEmbudo) => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    return api<ReporteEmbudo>(`/embudo?${q}`);
  },
};