import { api } from './cliente';

export type EstadoAcceso = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'VENCIDA' | 'REVOCADA';
export type VistaAccesos = 'pendientes' | 'vigentes' | 'historial';

export interface AccesoMovil {
  id: string; estado: EstadoAcceso; motivo: string; diasSolicitados: number | null; respuesta: string | null;
  desde: string | null; hasta: string | null; solicitadoAt: string; respondidoAt: string | null; revocadoAt: string | null;
  usuarioId: string; usuario: string; rol: string; equipo: string | null; aprobadoPor: string | null; revocadoPor: string | null;
}

export const accesosMovilApi = {
  /** Desde el celular bloqueado, con el permiso temporal que dio el login */
  solicitarDesdeCelular: (permiso: string, motivo: string, dias: number) =>
    api<{ id: string; estado: 'PENDIENTE' }>('/accesos-moviles/solicitar-celular', { metodo: 'POST', cuerpo: { permiso, motivo, dias } }),
  solicitar: (motivo: string, dias: number) => api<{ id: string }>('/accesos-moviles', { metodo: 'POST', cuerpo: { motivo, dias } }),
  mio: () => api<{ vigente: AccesoMovil | null; pendiente: AccesoMovil | null; historial: AccesoMovil[]; maxDias: number }>('/accesos-moviles/mio'),
  // Gerencia
  listar: (vista: VistaAccesos) =>
    api<{ filas: AccesoMovil[]; contadores: { pendientes: number; vigentes: number }; maxDias: number }>(`/accesos-moviles?vista=${vista}`),
  usuarios: () => api<{ id: string; nombre: string; rol: string; equipo: string | null }[]>('/accesos-moviles/usuarios'),
  aprobar: (id: string, hasta: string, respuesta?: string) => api(`/accesos-moviles/${id}/aprobar`, { metodo: 'POST', cuerpo: { hasta, respuesta } }),
  rechazar: (id: string, respuesta: string) => api(`/accesos-moviles/${id}/rechazar`, { metodo: 'POST', cuerpo: { respuesta } }),
  revocar: (id: string, respuesta?: string) => api(`/accesos-moviles/${id}/revocar`, { metodo: 'POST', cuerpo: { respuesta } }),
  otorgar: (usuarioId: string, hasta: string, motivo: string) => api('/accesos-moviles/otorgar', { metodo: 'POST', cuerpo: { usuarioId, hasta, motivo } }),
};

export const TEXTO_ESTADO_ACCESO: Record<EstadoAcceso, string> = {
  PENDIENTE: 'Pendiente', APROBADA: 'Vigente', RECHAZADA: 'Rechazada', VENCIDA: 'Vencida', REVOCADA: 'Retirada',
};

/** Fecha AAAA-MM-DD de hoy + n días (hora de Lima) */
export const diaMas = (n: number) => {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  return new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
};
/** "miércoles 14 de octubre" a partir de AAAA-MM-DD */
export const diaLargo = (f: string) =>
  new Date(`${f}T12:00:00Z`).toLocaleDateString('es-PE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
/** Último día del acceso (termina a la medianoche de Lima) */
export const ultimoDia = (hasta: string) =>
  new Date(new Date(hasta).getTime() - 1).toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
export const diasRestantes = (hasta: string) => Math.max(0, Math.ceil((new Date(hasta).getTime() - Date.now()) / 86400_000));
export const DURACIONES = [1, 3, 7, 15, 30];