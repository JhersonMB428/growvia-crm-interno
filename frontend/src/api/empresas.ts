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
}

export interface Contacto { id?: string; nombre: string; celular: string; correo?: string | null; posicion?: number }

export interface EmpresaDetalle extends EmpresaResumen {
  libre: boolean;
  contactos: Contacto[] | null; // null = no tiene permiso para verlos
  historial: { motivo: string; fecha: string; asesorAnterior: string | null; asesorNuevo: string | null; hechoPor: string }[] | null;
  /** Contrato con su operador actual (null = no tiene permiso para verlo) */
  contratoActual?: { operadorId: number | null; operador: string | null; fin: string | null; dias: number | null } | null;
  puedeEditar: boolean;
  /** Back office / admin: puede corregir razón social, ubicación y contactos */
  puedeCorregirDatos?: boolean;
}

export interface Pagina<T> { total: number; pagina: number; porPagina: number; paginas: number; filas: T[] }

export interface FiltrosEmpresas { q?: string; filtro?: 'todas' | 'libres' | 'asignadas'; estado?: 'PROSPECTO' | 'VENTA'; pagina?: number }

const query = (f: FiltrosEmpresas) => {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const empresasApi = {
  mias: (f: FiltrosEmpresas) => api<Pagina<EmpresaResumen>>(`/empresas/mias${query(f)}`),
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
};

export interface Lugar { id: string; nombre: string }
export const ubigeoApi = {
  departamentos: () => api<Lugar[]>('/ubigeo/departamentos'),
  provincias: (dep: string) => api<Lugar[]>(`/ubigeo/departamentos/${dep}/provincias`),
  distritos: (prov: string) => api<Lugar[]>(`/ubigeo/provincias/${prov}/distritos`),
};

/** "Ate · Lima" */
export const ubicacion = (e: Pick<EmpresaResumen, 'distrito' | 'provincia' | 'departamento'>) =>
  e.distrito ? `${e.distrito} · ${e.provincia === e.departamento ? e.departamento : `${e.provincia}, ${e.departamento}`}` : 'Sin ubicación';