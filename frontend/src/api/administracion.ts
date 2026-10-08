import { api } from './cliente';

export type CodigoRol = 'ASESOR' | 'SUPERVISOR' | 'GERENTE' | 'BACKOFFICE' | 'ADMIN';

export interface UsuarioAdmin {
  id: string; nombres: string; apellidos: string; email: string; rol: CodigoRol; rolNombre: string;
  equipoId: string | null; equipo: string | null; activo: boolean; claveTemporal: boolean; creado: string;
  esSupervisorDelEquipo: boolean; ultimoIngreso: string | null; empresas: number; editable: boolean; soyYo: boolean;
}
export interface DatosUsuario { nombres: string; apellidos: string; email: string; rol: CodigoRol; equipoId: string | null }
export interface CatalogosAdmin {
  roles: { codigo: CodigoRol; nombre: string }[];
  equipos: { id: string; nombre: string; supervisorId: string | null }[];
  cartera: { id: string; nombre: string; equipo: string | null }[];
}
export interface EquipoAdmin {
  id: string; nombre: string; activo: boolean; supervisorId: string | null; supervisor: string | null; asesores: number; integrantes: string | null;
}
export interface Plan { id: number; tipo: 'MOVIL' | 'FIJA'; nombre: string; cargoRef: number; activo: boolean; usos: number }
export interface Operador { id: number; nombre: string; activo: boolean; usos: number }
export interface Parametro {
  clave: string; valor: string; descripcion: string; tipo: 'numero' | 'hora'; minimo: number | null; maximo: number | null;
  editable: boolean; actualizado: string | null; actualizadoPor: string | null;
}

export const adminApi = {
  catalogos: () => api<CatalogosAdmin>('/admin/usuarios/catalogos'),
  usuarios: (f: { q?: string; rol?: string; equipoId?: string; estado?: string }) => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    return api<UsuarioAdmin[]>(`/admin/usuarios?${q}`);
  },
  crear: (d: DatosUsuario) => api<{ id: string; claveTemporal: string }>('/admin/usuarios', { metodo: 'POST', cuerpo: d }),
  editar: (id: string, d: DatosUsuario) => api<{ ok: boolean; debeVolverAEntrar: boolean }>(`/admin/usuarios/${id}`, { metodo: 'PUT', cuerpo: d }),
  restablecer: (id: string) => api<{ claveTemporal: string }>(`/admin/usuarios/${id}/clave`, { metodo: 'POST' }),
  desactivar: (id: string, destino?: string) =>
    api<{ ok: boolean; empresas: number; negociaciones: number }>(`/admin/usuarios/${id}/desactivar`, { metodo: 'POST', cuerpo: { destino } }),
  reactivar: (id: string) => api(`/admin/usuarios/${id}/reactivar`, { metodo: 'POST' }),
  equipos: () => api<{ equipos: EquipoAdmin[]; supervisores: { id: string; nombre: string }[] }>('/admin/equipos'),
  guardarEquipo: (id: string | null, d: { nombre: string; supervisorId: string | null; activo?: boolean }) =>
    api<{ equipos: EquipoAdmin[]; supervisores: { id: string; nombre: string }[] }>(id ? `/admin/equipos/${id}` : '/admin/equipos', { metodo: id ? 'PUT' : 'POST', cuerpo: d }),
  catalogo: () => api<{ planes: Plan[]; operadores: Operador[] }>('/admin/catalogo'),
  guardarPlan: (id: number | null, d: { tipo: string; nombre: string; cargoRef: number; activo?: boolean }) =>
    api<{ planes: Plan[]; operadores: Operador[] }>(id ? `/admin/planes/${id}` : '/admin/planes', { metodo: id ? 'PUT' : 'POST', cuerpo: d }),
  guardarOperador: (id: number | null, d: { nombre: string; activo?: boolean }) =>
    api<{ planes: Plan[]; operadores: Operador[] }>(id ? `/admin/operadores/${id}` : '/admin/operadores', { metodo: id ? 'PUT' : 'POST', cuerpo: d }),
  parametros: () => api<Parametro[]>('/admin/parametros'),
  guardarParametro: (clave: string, valor: string) => api<Parametro[]>(`/admin/parametros/${clave}`, { metodo: 'PUT', cuerpo: { valor } }),
};

/** Nombre legible de cada parámetro */
export const TEXTO_PARAMETRO: Record<string, string> = {
  dias_liberacion_inactividad: 'Días sin gestión para liberar una empresa',
  limite_toma_repositorio: 'Empresas que un asesor puede tomar del repositorio',
  max_correcciones_venta: 'Correcciones permitidas por venta observada',
  minutos_recordatorio_defecto: 'Minutos de recordatorio para usuarios nuevos',
  hora_resumen_diario: 'Hora del resumen diario de gestiones',
  dias_dispositivo_confiable: 'Días que un equipo queda de confianza',
  minutos_validez_codigo: 'Minutos de validez del código del correo',
  max_intentos_codigo: 'Intentos para ingresar el código',
  dias_max_acceso_movil: 'Días máximos de acceso desde celular',
  dias_aviso_liberacion: 'Días de aviso antes de liberar',
  dias_primer_aviso_renovacion: 'Días antes del fin de contrato para el primer aviso',
};