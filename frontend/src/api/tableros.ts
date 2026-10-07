import { api } from './cliente';
import type { Canal } from './gestiones';
import type { Etapa, EstadoVenta, Resultado } from './negociaciones';

export interface Activas { ventas: number; lineas: number; portas: number; cargo: number }

export interface TableroAsesor {
  mes: string;
  metaLineas: number | null;
  activas: Activas;
  lineasMesAnterior: number;
  proyeccion: number;
  porActivar: { ventas: number; lineas: number; observadas: number };
  embudo: { etapa: Etapa; cantidad: number; cargo: number }[];
  prospectos: number;
  agendaHoy: { id: string; clienteId: string; razonSocial: string; proximaAccion: string; proximoCanal: Canal; comentario: string }[];
  noRealizadas: number;
  ultimas: { id: string; codigo: string; razonSocial: string; etapa: Etapa; resultado: Resultado; estadoVenta: EstadoVenta | null; lineas: number; total: number }[];
  posicion: number | null;
  tamanoEquipo: number;
  conversion: { ganadas: number; perdidas: number };
}

export interface AsesorEquipo {
  id: string; nombre: string; metaLineas: number | null; lineas: number; ventas: number; cargo: number;
  porActivar: number; abiertas: number; gestionesHoy: number; noRealizadas: number;
  ganadas: number; perdidas: number; observadas: number;
}

export interface TableroEquipo {
  mes: string;
  equipo: { id: string; nombre: string; metaLineas: number | null; lineas: number; proyeccion: number } | null;
  asesores: AsesorEquipo[];
  alertas: { sinGestionesHoy: number; prospectosSinContacto: number; negociacionesAntiguas: number; porAprobar: number } | null;
}

export interface TableroGerencia {
  mes: string;
  kpi: Activas & { metaLineas: number | null; proyeccion: number; porActivar: number };
  mesAnterior: { ventas: number; lineas: number; cargo: number };
  proceso: { ganadas: number; perdidas: number; observadas: number; diasCierre: number };
  equipos: { id: string; nombre: string; supervisor: string | null; lineas: number; ventas: number; cargo: number; metaLineas: number | null }[];
  distritos: { distrito: string; provincia: string | null; ventas: number; lineas: number; cargo: number; lineasMesAnterior: number }[];
  operadores: { nombre: string; lineas: number }[];
  historial: { mes: string; lineas: number; ventas: number; cargo: number }[];
}

export interface MetasMes {
  mes: string;
  editable: boolean;
  puedeMetaEquipo: boolean;
  equipos: { id: string; nombre: string; supervisor: string | null; metaLineas: number | null; lineas: number; proyeccion: number; sumaMetasAsesores: number }[];
  asesores: { id: string; nombre: string; equipoId: string | null; equipo: string | null; metaLineas: number | null; lineas: number; ventas: number; proyeccion: number }[];
}

export const tablerosApi = {
  asesor: () => api<TableroAsesor>('/tableros/asesor'),
  equipo: () => api<TableroEquipo>('/tableros/equipo'),
  gerencia: (mes?: string) => api<TableroGerencia>(`/tableros/gerencia${mes ? `?mes=${mes}` : ''}`),
  metas: (mes?: string) => api<MetasMes>(`/metas${mes ? `?mes=${mes}` : ''}`),
  guardarMeta: (mes: string, alcance: 'ASESOR' | 'EQUIPO', id: string, metaLineas: number) =>
    api<MetasMes>('/metas', { metodo: 'PUT', cuerpo: { mes, alcance, id, metaLineas } }),
};

// ───────── Formatos ─────────
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const mesCorto = (m: string) => MESES[Number(m.slice(5, 7)) - 1];
export const mesLargo = (m: string) => `${MESES_LARGOS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const moverMes = (m: string, delta: number) => {
  const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
export const pct = (valor: number, total: number | null) => (total ? Math.round((valor / total) * 100) : null);
/** "+12%" · "−5%" · null si no hay base para comparar */
export function variacion(actual: number, anterior: number): string | null {
  if (!anterior) return null;
  const v = Math.round(((actual - anterior) / anterior) * 100);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
}