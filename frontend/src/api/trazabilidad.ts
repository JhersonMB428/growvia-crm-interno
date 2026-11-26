import { api } from './cliente';

export type Periodo = 7 | 30 | 90;
export interface PorDia { dia: string; total: number; usuarios?: number }

export interface ResumenTraza {
  dias: number;
  kpis: { acciones: number; usuariosActivos: number; ingresos: number; fallidos: number; exportaciones: number; alertas: number };
  porDia: PorDia[];
  calor: { dia: number; hora: number; n: number }[];
  porCategoria: { categoria: string; n: number }[];
  porUsuario: { id: string; usuario: string; rol: string; n: number; ultima: string }[];
  porRol: { rol: string; n: number; usuarios: number }[];
  flujo: {
    porBase: number; porProspecto: number; tomadas: number; asignadas: number; gestionadas: number; gestiones: number;
    negociaciones: number; ganadas: number; perdidas: number;
    liberadasPlazo: number; liberadasSinRespuesta: number; liberadasRechazo: number; liberadasManual: number;
  };
  hoy: { libres: number; asignadas: number; bloqueadas: number };
  embudo: { etapa: string; n: number }[];
  alertas: { fecha: string; accion: string; ip: string | null; usuario: string | null; rol: string | null }[];
}

export type TipoEvento = 'ASIGNACION' | 'GESTION' | 'NEGOCIACION' | 'ETAPA' | 'VALIDACION' | 'POSVENTA' | 'FICHA' | 'ACCION';
export interface EventoTraza { fecha: string; tipo: TipoEvento; titulo: string; detalle: string | null; usuario: string | null; rol: string | null; accion?: string }
export interface EmpresaTraza {
  empresa: {
    id: string; ruc: string; razonSocial: string; origen: string; creadaAt: string; asesor: string | null; retencionHasta: string | null;
    bloqueoTipo: string | null; bloqueoHasta: string | null; gestiones: number; asesores: number; segundosFicha: number;
  };
  eventos: EventoTraza[];
}
export interface UsuarioTraza {
  usuario: { id: string; nombre: string; email: string; rol: string; activo: boolean; equipo: string | null; ultimoIngreso: string | null };
  porDia: PorDia[];
  porAccion: { accion: string; n: number }[];
  trabajo: { gestiones: number; empresas: number; tomadas: number; liberadas: number; segundosFicha: number; diasConIngreso: number };
  ultimas: { fecha: string; accion: string; entidad: string | null; entidadId: string | null; empresa: string | null; detalle: string | null; ip: string | null }[];
}

export const trazabilidadApi = {
  resumen: (dias: Periodo) => api<ResumenTraza>(`/trazabilidad/resumen?dias=${dias}`),
  buscarEmpresas: (q: string) => api<{ id: string; ruc: string; razonSocial: string; asesor: string | null }[]>(`/trazabilidad/empresas?q=${encodeURIComponent(q)}`),
  empresa: (id: string) => api<EmpresaTraza>(`/trazabilidad/empresas/${id}`),
  usuario: (id: string, dias: Periodo) => api<UsuarioTraza>(`/trazabilidad/usuarios/${id}?dias=${dias}`),
};
