import { api } from './cliente';
import type { Pagina } from './empresas';

export type Etapa = 'PROSPECCION' | 'CONTACTO' | 'NEGOCIACION' | 'CIERRE';
export type Resultado = 'EN_CURSO' | 'GANADA' | 'PERDIDA';
export type EstadoVenta = 'EN_VALIDACION' | 'OBSERVADA' | 'VALIDADA' | 'EN_POSVENTA' | 'ACTIVA' | 'ANULADA';
export type Modalidad = 'NUEVA' | 'PORTABILIDAD';
export type TipoNegociacion = 'NUEVA' | 'AMPLIACION' | 'RENOVACION';

export interface Plan { id: number; tipo: 'MOVIL' | 'FIJA'; nombre: string; cargoRef: number | null }
export interface Operador { id: number; nombre: string }
export interface Catalogos { planes: Plan[]; operadores: Operador[]; motivosPerdida: string[] }

export interface NegociacionResumen {
  id: string;
  codigo: string;
  tipo: TipoNegociacion;
  /** Meses de contrato (0 = sin plazo forzoso) */
  plazoMeses: number;
  etapa: Etapa;
  resultado: Resultado;
  estadoVenta: EstadoVenta | null;
  motivoPerdida: string | null;
  fechaCierre: string | null;
  creadoAt: string;
  actualizadoAt: string;
  clienteId: string;
  razonSocial: string;
  ruc: string;
  asesorId: string;
  asesor: string;
  equipo: string | null;
  lineas: number;
  portabilidades: number;
  total: number;
  servicio: 'MOVIL' | 'FIJA' | 'AMBOS' | null;
}

export interface ItemNegociacion {
  id?: string;
  planId: number;
  plan?: string;
  tipoPlan?: 'MOVIL' | 'FIJA';
  modalidad: Modalidad;
  operadorOrigenId: number | null;
  operadorOrigen?: string | null;
  cantidad: number;
  cargoFijoUnit: number;
  subtotal?: number;
}

export interface NegociacionDetalle extends NegociacionResumen {
  correcciones: number;
  maxCorrecciones: number;
  pasoActual: string | null;
  fechaValidacion: string | null;
  fechaActivacion: string | null;
  ordenOperador: string | null;
  items: ItemNegociacion[];
  historial: { etapaAnterior: Etapa | null; etapaNueva: Etapa; detalle: string | null; fecha: string; usuario: string }[];
  validaciones: { decision: string; comentario: string | null; intento: number; fecha: string; paso: string | null; usuario: string }[];
  posventa: { evento: 'CHIPS_ENTREGADOS' | 'PORTABILIDAD_EJECUTADA' | 'SERVICIO_ACTIVO'; fecha: string; comentario: string | null; usuario: string }[];
  puedeEditar: boolean;
  /** Venta observada: el asesor puede corregir los planes y reenviarla */
  puedeCorregir: boolean;
  /** Si es una renovación: el contrato que renueva */
  renuevaId: string | null;
  renuevaCodigo: string | null;
  /** Último día del contrato (AAAA-MM-DD), si el servicio está activo y tiene plazo */
  finContrato: string | null;
  /** La renovación de este contrato, si ya se inició */
  renovacion: { id: string; codigo: string; resultado: Resultado } | null;
  puedeRenovar: boolean;
}

type Guardar = { tipo: TipoNegociacion; plazoMeses: number; items: ItemNegociacion[] };
const items = (lista: ItemNegociacion[]) => lista.map(({ planId, modalidad, operadorOrigenId, cantidad, cargoFijoUnit }) =>
  ({ planId, modalidad, operadorOrigenId: modalidad === 'PORTABILIDAD' ? operadorOrigenId : null, cantidad, cargoFijoUnit }));

export const negociacionesApi = {
  catalogos: () => api<Catalogos>('/negociaciones/catalogos'),
  embudo: () => api<{ filas: NegociacionResumen[] }>('/negociaciones/embudo'),
  deEmpresa: (clienteId: string) => api<Pagina<NegociacionResumen>>(`/negociaciones?clienteId=${clienteId}&porPagina=50`),
  detalle: (id: string) => api<NegociacionDetalle>(`/negociaciones/${id}`),
  crear: (clienteId: string, d: Guardar) =>
    api<NegociacionDetalle>('/negociaciones', { metodo: 'POST', cuerpo: { clienteId, tipo: d.tipo, plazoMeses: d.plazoMeses, items: items(d.items) } }),
  actualizar: (id: string, d: Guardar) =>
    api<NegociacionDetalle>(`/negociaciones/${id}`, { metodo: 'PUT', cuerpo: { tipo: d.tipo, plazoMeses: d.plazoMeses, items: items(d.items) } }),
  /** Abre la renovación del contrato (id = la venta activa) */
  renovar: (id: string) => api<NegociacionDetalle>(`/negociaciones/${id}/renovar`, { metodo: 'POST' }),
  cambiarEtapa: (id: string, etapa: Etapa) => api<NegociacionDetalle>(`/negociaciones/${id}/etapa`, { metodo: 'POST', cuerpo: { etapa } }),
  cerrar: (id: string, resultado: 'GANADA' | 'PERDIDA', motivoPerdida?: string) =>
    api<NegociacionDetalle>(`/negociaciones/${id}/cerrar`, { metodo: 'POST', cuerpo: { resultado, motivoPerdida } }),
};

// ───────── Textos y formatos ─────────
export const ETAPAS: { valor: Exclude<Etapa, 'CIERRE'>; texto: string }[] = [
  { valor: 'PROSPECCION', texto: 'Prospección' },
  { valor: 'CONTACTO', texto: 'Contacto' },
  { valor: 'NEGOCIACION', texto: 'Negociación' },
];
export const TEXTO_ETAPA: Record<Etapa, string> = { PROSPECCION: 'Prospección', CONTACTO: 'Contacto', NEGOCIACION: 'Negociación', CIERRE: 'Cierre' };
export const TEXTO_SERVICIO = { MOVIL: 'Móvil', FIJA: 'Fija', AMBOS: 'Móvil y fija' } as const;
export const TEXTO_TIPO: Record<TipoNegociacion, string> = { NUEVA: 'Nueva', AMPLIACION: 'Ampliación', RENOVACION: 'Renovación' };

/** Plazos de contrato que se pueden elegir */
export const PLAZOS = [18, 24, 12, 36, 6, 0];
export const textoPlazo = (m: number) => (m ? `${m} meses` : 'Sin plazo forzoso');

/** "5 de noviembre de 2026" a partir de "2026-11-05" (sin correr de día por la zona horaria) */
export const fechaLarga = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
export const TEXTO_ESTADO_VENTA: Record<EstadoVenta, string> = {
  EN_VALIDACION: 'Por validar', OBSERVADA: 'Observada', VALIDADA: 'Validada',
  EN_POSVENTA: 'En posventa', ACTIVA: 'Activa', ANULADA: 'Anulada',
};

const enteros = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
const decimales = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** S/ 1,200 · S/ 1,335.50 */
export const soles = (n: number) => (Number.isInteger(n || 0) ? enteros : decimales).format(n || 0);

/** "15 portabilidades + 5 nuevas" */
export function resumenLineas(n: Pick<NegociacionResumen, 'lineas' | 'portabilidades'> & { tipo?: TipoNegociacion }) {
  if (n.tipo === 'RENOVACION') return n.lineas ? `${n.lineas} ${n.lineas === 1 ? 'línea renovada' : 'líneas renovadas'}` : 'Sin planes';
  const nuevas = n.lineas - n.portabilidades;
  const partes: string[] = [];
  if (n.portabilidades) partes.push(`${n.portabilidades} ${n.portabilidades === 1 ? 'portabilidad' : 'portabilidades'}`);
  if (nuevas) partes.push(`${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}`);
  return partes.join(' + ') || 'Sin planes';
}