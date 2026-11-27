import { api } from './cliente';

export interface EmpresaResumen {
  id: string;
  ruc: string;
  razonSocial: string;
  estado: 'PROSPECTO' | 'VENTA';
  origen: 'BASE' | 'PROSPECCION';
  distritoId: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
  asesorId: string | null;
  asesor: string | null;
  equipo: string | null;
  asignadoAt: string | null;
  ultimaGestionAt: string | null;
  creadoAt: string;
  /** Hasta cuándo el asesor conserva la empresa (null = no vence, o está libre) */
  retencionHasta: string | null;
  /** RECHAZO = dijo "No interesado" · SIN_RESPUESTA = no contestó en varios intentos */
  bloqueoTipo: 'RECHAZO' | 'SIN_RESPUESTA' | null;
  bloqueoHasta: string | null;
  /** Libre pero esta persona no puede tomarla todavía */
  bloqueadaParaMi: boolean;
  /** Líneas que tiene hoy con su operador actual */
  lineasActuales: number | null;
  operadorActual: string | null;
  /** Tiene la estructura completa: representante con DNI, teléfono y correo, ubicación, líneas y operador */
  datosCompletos: boolean;
  /** Qué le falta para tener la estructura completa (vacío = completa) */
  datosFaltantes?: string[];
  /** Lo último que dijo SUNAT (estado: ACTIVO, BAJA…; condición: HABIDO, NO HABIDO…) */
  sunatEstado?: string | null;
  sunatCondicion?: string | null;
  sunatConsultadoAt?: string | null;
}

/** El contacto 1 es el representante legal (SUNAT) y lleva DNI. "celular" es el teléfono: celular o fijo con código.
 *  El representante puede no tener teléfono (si llegó desde SUNAT): en ese caso viene vacío. */
export interface Contacto {
  id?: string; nombre: string; celular?: string | null; correo?: string | null; dni?: string | null; posicion?: number;
  /** Desde la posición 3: más personas de la empresa (otros representantes, quien decide la compra…) */
  cargo?: string | null; decisor?: boolean; origen?: 'SUNAT' | 'BASE' | 'ASESORA'; nota?: string | null;
  creadoPor?: string | null; creadoAt?: string; ultimaGestion?: string | null;
}

export type EstadoMedio = 'SIN_PROBAR' | 'FUNCIONA' | 'NO_CONTESTA' | 'NO_EXISTE' | 'EQUIVOCADO';
/** Teléfono o correo de la empresa, con lo que pasó al usarlo */
export interface Medio {
  id: string; tipo: 'TELEFONO' | 'CORREO'; valor: string; origen: 'SUNAT' | 'BASE' | 'ASESORA'; estado: EstadoMedio;
  nota: string | null; actualizadoAt: string | null; actualizadoPor: string | null;
}
export const ESTADOS_MEDIO: { valor: EstadoMedio; texto: string }[] = [
  { valor: 'SIN_PROBAR', texto: 'Sin probar' }, { valor: 'FUNCIONA', texto: 'Funciona' }, { valor: 'NO_CONTESTA', texto: 'No contesta' },
  { valor: 'NO_EXISTE', texto: 'No existe' }, { valor: 'EQUIVOCADO', texto: 'Equivocado' },
];
/** Datos de una persona para agregarla o editarla */
export interface PersonaNueva { nombre: string; cargo?: string; celular?: string; correo?: string; dni?: string; decisor?: boolean; nota?: string }

export interface EmpresaDetalle extends EmpresaResumen {
  libre: boolean;
  contactos: Contacto[] | null; // null = no tiene permiso para verlos
  medios?: Medio[];
  historial: { motivo: string; fecha: string; asesorAnterior: string | null; asesorNuevo: string | null; hechoPor: string }[] | null;
  /** Contrato con su operador actual (null = no tiene permiso para verlo) */
  contratoActual?: { operadorId: number | null; operador: string | null; fin: string | null; dias: number | null; lineas: number | null } | null;
  puedeEditar: boolean;
  /** Ya usó "Mantener 24 h más" desde su última gestión */
  prorrogada?: boolean;
  /** Back office / admin: puede corregir razón social, ubicación y contactos */
  puedeCorregirDatos?: boolean;
}

export interface Pagina<T> { total: number; pagina: number; porPagina: number; paginas: number; filas: T[] }

export interface FiltrosEmpresas {
  q?: string; filtro?: 'todas' | 'libres' | 'asignadas' | 'por_vencer'; estado?: 'PROSPECTO' | 'VENTA'; pagina?: number;
  operadorId?: number; lineasMin?: number;
}

const query = (f: FiltrosEmpresas) => {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const empresasApi = {
  /** porVencer: cuántas se liberan en las próximas horas */
  mias: (f: FiltrosEmpresas) => api<Pagina<EmpresaResumen> & { porVencer: number }>(`/empresas/mias${query(f)}`),
  repositorio: (f: FiltrosEmpresas) => api<Pagina<EmpresaResumen>>(`/empresas/repositorio${query(f)}`),
  detalle: (id: string) => api<EmpresaDetalle>(`/empresas/${id}`),
  verificarRuc: (ruc: string) =>
    api<{ existe: boolean; mensaje?: string; empresa?: { id: string; libre: boolean } }>(`/empresas/ruc/${ruc}`),
  crear: (datos: { ruc: string; razonSocial: string; distritoId: string; contactos: Contacto[] }) =>
    api<EmpresaDetalle>('/empresas', { metodo: 'POST', cuerpo: datos }),
  tomar: (id: string) => api<EmpresaDetalle>(`/empresas/${id}/tomar`, { metodo: 'POST' }),
  corregir: (id: string, datos: { razonSocial: string; distritoId: string }) =>
    api<EmpresaDetalle>(`/empresas/${id}`, { metodo: 'PUT', cuerpo: datos }),
  guardarContactos: (id: string, contactos: Contacto[]) =>
    api<EmpresaDetalle>(`/empresas/${id}/contactos`, { metodo: 'PUT', cuerpo: { contactos } }),
  agregarPersona: (id: string, p: PersonaNueva) => api<EmpresaDetalle>(`/empresas/${id}/personas`, { metodo: 'POST', cuerpo: p }),
  editarPersona: (id: string, contactoId: string, p: PersonaNueva) =>
    api<EmpresaDetalle>(`/empresas/${id}/personas/${contactoId}`, { metodo: 'PUT', cuerpo: p }),
  quitarPersona: (id: string, contactoId: string) => api<EmpresaDetalle>(`/empresas/${id}/personas/${contactoId}`, { metodo: 'DELETE' }),
  agregarMedio: (id: string, tipo: 'TELEFONO' | 'CORREO', valor: string) =>
    api<EmpresaDetalle>(`/empresas/${id}/medios`, { metodo: 'POST', cuerpo: { tipo, valor } }),
  estadoMedio: (id: string, medioId: string, estado: EstadoMedio) =>
    api<EmpresaDetalle>(`/empresas/${id}/medios/${medioId}`, { metodo: 'PUT', cuerpo: { estado } }),
  /** Gerencia y admin: asesores activos para reasignar */
  asesores: () => api<{ id: string; nombre: string; equipo: string | null }[]>('/empresas/asesores'),
  reasignar: (id: string, asesorId: string) => api<EmpresaDetalle>(`/empresas/${id}/reasignar`, { metodo: 'POST', cuerpo: { asesorId } }),
  guardarContratoActual: (id: string, operadorId: number | null, finContrato: string | null, lineas: number | null) =>
    api<EmpresaDetalle>(`/empresas/${id}/contrato-actual`, { metodo: 'PUT', cuerpo: { operadorId, finContrato, lineas } }),
  /** Suma 24 h al plazo (una vez hasta la siguiente gestión) */
  mantener: (id: string) => api<{ retencionHasta: string }>(`/empresas/${id}/mantener`, { metodo: 'POST' }),
  /** Devuelve la empresa al repositorio */
  liberar: (id: string) => api<{ ok: true }>(`/empresas/${id}/liberar`, { metodo: 'POST' }),
  iniciarVisita: (id: string) => api<{ id: string | null }>(`/empresas/${id}/visitas`, { metodo: 'POST' }),
  pulsoVisita: (visitaId: string) => api<{ ok: true }>(`/empresas/visitas/${visitaId}`, { metodo: 'PUT' }),
};

/** "Se libera en 5 h" · urgente si faltan menos de 3 horas */
export function plazo(iso: string | null): { texto: string; nivel: 'vencido' | 'urgente' | 'pronto' | 'normal' } | null {
  if (!iso) return null;
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (min <= 0) return { texto: 'Liberándose', nivel: 'vencido' };
  if (min < 60) return { texto: `Se libera en ${min} min`, nivel: 'urgente' };
  const h = Math.floor(min / 60);
  if (h < 3) return { texto: `Se libera en ${h} h ${min % 60} min`, nivel: 'urgente' };
  if (h < 24) return { texto: `Se libera en ${h} h`, nivel: 'pronto' };
  const d = Math.round(h / 24);
  return { texto: `Se libera en ${d} ${d === 1 ? 'día' : 'días'}`, nivel: 'normal' };
}

export const fechaHoraPlazo = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** "No interesado · hasta 23 feb" */
export function textoBloqueo(e: Pick<EmpresaResumen, 'bloqueoTipo' | 'bloqueoHasta'>) {
  if (!e.bloqueoTipo || !e.bloqueoHasta) return '';
  const hasta = new Date(e.bloqueoHasta).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  return e.bloqueoTipo === 'RECHAZO' ? `No interesada · libre el ${hasta}` : `No contestó · tú desde el ${hasta}`;
}

export interface Lugar { id: string; nombre: string }
export const ubigeoApi = {
  departamentos: () => api<Lugar[]>('/ubigeo/departamentos'),
  provincias: (dep: string) => api<Lugar[]>(`/ubigeo/departamentos/${dep}/provincias`),
  distritos: (prov: string) => api<Lugar[]>(`/ubigeo/provincias/${prov}/distritos`),
};

/** "Ate · Lima" */
export const ubicacion = (e: Pick<EmpresaResumen, 'distrito' | 'provincia' | 'departamento'>) =>
  e.distrito ? `${e.distrito} · ${e.provincia === e.departamento ? e.departamento : `${e.provincia}, ${e.departamento}`}` : 'Sin ubicación';