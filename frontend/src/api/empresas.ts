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
}

export interface Contacto { id?: string; nombre: string; celular: string; correo?: string | null; posicion?: number }

export interface EmpresaDetalle extends EmpresaResumen {
  libre: boolean;
  contactos: Contacto[] | null; // null = no tiene permiso para verlos
  historial: { motivo: string; fecha: string; asesorAnterior: string | null; asesorNuevo: string | null; hechoPor: string }[] | null;
  /** Contrato con su operador actual (null = no tiene permiso para verlo) */
  contratoActual?: { operadorId: number | null; operador: string | null; fin: string | null; dias: number | null } | null;
  puedeEditar: boolean;
  /** Ya usó "Mantener 24 h más" desde su última gestión */
  prorrogada?: boolean;
  /** Back office / admin: puede corregir razón social, ubicación y contactos */
  puedeCorregirDatos?: boolean;
}

export interface Pagina<T> { total: number; pagina: number; porPagina: number; paginas: number; filas: T[] }

export interface FiltrosEmpresas { q?: string; filtro?: 'todas' | 'libres' | 'asignadas' | 'por_vencer'; estado?: 'PROSPECTO' | 'VENTA'; pagina?: number }

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
  /** Gerencia y admin: asesores activos para reasignar */
  asesores: () => api<{ id: string; nombre: string; equipo: string | null }[]>('/empresas/asesores'),
  reasignar: (id: string, asesorId: string) => api<EmpresaDetalle>(`/empresas/${id}/reasignar`, { metodo: 'POST', cuerpo: { asesorId } }),
  guardarContratoActual: (id: string, operadorId: number | null, finContrato: string | null) =>
    api<EmpresaDetalle>(`/empresas/${id}/contrato-actual`, { metodo: 'PUT', cuerpo: { operadorId, finContrato } }),
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