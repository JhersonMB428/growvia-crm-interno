import { api } from './cliente';
import type { Pagina } from './empresas';

/** Etapas en curso. En el historial también aparecen GANADA y PERDIDA (el cierre final). */
export type Etapa = 'NEGOCIACION' | 'CIERRE';
type EtapaHistorial = Etapa | 'GANADA' | 'PERDIDA' | 'PROSPECCION' | 'CONTACTO';
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
  /** Cargo fijo mensual por unidad, sin IGV */
  cargoFijoUnit: number;
  subtotal?: number;
  /** El servicio incluye equipo */
  conEquipo: boolean;
}

export interface GestionNegociacion {
  id: string; canal: 'LLAMADA' | 'WHATSAPP' | 'CORREO' | 'VISITA'; resultado: string; comentario: string; fecha: string; usuario: string;
}

export interface NegociacionDetalle extends NegociacionResumen {
  items: ItemNegociacion[];
  historial: { etapaAnterior: EtapaHistorial | null; etapaNueva: EtapaHistorial; detalle: string | null; fecha: string; usuario: string }[];
  /** Comentarios: gestiones registradas mientras la negociación estaba abierta */
  gestiones: GestionNegociacion[];
  puedeEditar: boolean;
  puedeComentar: boolean;
  /** En cierre: el asesor a cargo o su supervisor la marcan ganada */
  puedeGanar: boolean;
}

type Guardar = { items: ItemNegociacion[] };
const items = (lista: ItemNegociacion[]) => lista.map(({ planId, modalidad, operadorOrigenId, cantidad, cargoFijoUnit, conEquipo }) =>
  ({ planId, modalidad, operadorOrigenId: modalidad === 'PORTABILIDAD' ? operadorOrigenId : null, cantidad, cargoFijoUnit, conEquipo }));

export const negociacionesApi = {
  catalogos: () => api<Catalogos>('/negociaciones/catalogos'),
  embudo: () => api<{ filas: NegociacionResumen[] }>('/negociaciones/embudo'),
  deEmpresa: (clienteId: string) => api<Pagina<NegociacionResumen>>(`/negociaciones?clienteId=${clienteId}&porPagina=50`),
  detalle: (id: string) => api<NegociacionDetalle>(`/negociaciones/${id}`),
  crear: (clienteId: string, d: Guardar) =>
    api<NegociacionDetalle>('/negociaciones', { metodo: 'POST', cuerpo: { clienteId, items: items(d.items) } }),
  actualizar: (id: string, d: Guardar) =>
    api<NegociacionDetalle>(`/negociaciones/${id}`, { metodo: 'PUT', cuerpo: { items: items(d.items) } }),
  cambiarEtapa: (id: string, etapa: Etapa) => api<NegociacionDetalle>(`/negociaciones/${id}/etapa`, { metodo: 'POST', cuerpo: { etapa } }),
  perder: (id: string, motivoPerdida: string) =>
    api<NegociacionDetalle>(`/negociaciones/${id}/perder`, { metodo: 'POST', cuerpo: { motivoPerdida } }),
  /** Solo cuando el expediente ya se envió a back office por correo */
  ganar: (id: string) => api<NegociacionDetalle>(`/negociaciones/${id}/ganar`, { metodo: 'POST', cuerpo: { expedienteEnviado: true } }),
};

// ───────── Textos y formatos ─────────
export const TEXTO_ETAPA: Record<EtapaHistorial, string> = {
  NEGOCIACION: 'Negociación', CIERRE: 'Cierre', GANADA: 'Ganada', PERDIDA: 'Perdida', PROSPECCION: 'Prospección', CONTACTO: 'Contacto',
};
/** Estado para mostrar: etapa si está en curso, o el resultado si ya se cerró */
export const estadoDe = (n: Pick<NegociacionResumen, 'resultado' | 'etapa'>) =>
  n.resultado === 'GANADA' ? 'Ganada' : n.resultado === 'PERDIDA' ? 'Perdida' : TEXTO_ETAPA[n.etapa] ?? n.etapa;
export const TEXTO_SERVICIO = { MOVIL: 'Móvil', FIJA: 'Fija', AMBOS: 'Móvil y fija' } as const;
export const TEXTO_TIPO: Record<TipoNegociacion, string> = { NUEVA: 'Nueva', AMPLIACION: 'Ampliación', RENOVACION: 'Renovación' };

export const TEXTO_ESTADO_VENTA: Record<EstadoVenta, string> = {
  EN_VALIDACION: 'Por validar', OBSERVADA: 'Observada', VALIDADA: 'Validada',
  EN_POSVENTA: 'En posventa', ACTIVA: 'Activa', ANULADA: 'Anulada',
};

const enteros = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 });
const decimales = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** S/ 1,200 · S/ 1,335.50 */
export const soles = (n: number) => (Number.isInteger(n || 0) ? enteros : decimales).format(n || 0);

/** "15 portabilidades + 5 líneas nuevas" */
export function resumenLineas(n: Pick<NegociacionResumen, 'lineas' | 'portabilidades'> & { tipo?: TipoNegociacion }) {
  if (n.tipo === 'RENOVACION') return n.lineas ? `${n.lineas} ${n.lineas === 1 ? 'línea renovada' : 'líneas renovadas'}` : 'Sin planes';
  const nuevas = n.lineas - n.portabilidades;
  const partes: string[] = [];
  if (n.portabilidades) partes.push(`${n.portabilidades} ${n.portabilidades === 1 ? 'portabilidad' : 'portabilidades'}`);
  if (nuevas) partes.push(`${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}`);
  return partes.join(' + ') || 'Sin planes';
}