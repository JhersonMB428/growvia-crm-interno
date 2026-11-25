import type { Usuario } from '../sesion/tipos';
import { api } from './cliente';

export interface UsuarioParaVer { id: string; nombre: string; email: string; rol: Usuario['rol']['codigo']; rolNombre: string; equipo: string | null }

/** Solo para soporte del CRM (correos de CORREOS_SOPORTE): ver las pantallas como otro usuario, en solo lectura */
export const soporteApi = {
  usuarios: () => api<UsuarioParaVer[]>('/auth/ver-como'),
  verComo: (usuarioId: string) => api<{ token: string; usuario: Usuario }>('/auth/ver-como', { metodo: 'POST', cuerpo: { usuarioId } }),
  equipos: () => api<{ id: string; nombre: string }[]>('/auth/rol/equipos'),
  entrarConRol: (rol: Usuario['rol']['codigo'], equipoId?: string) =>
    api<{ token: string; usuario: Usuario }>('/auth/rol', { metodo: 'POST', cuerpo: { rol, ...(equipoId ? { equipoId } : {}) } }),
  salir: () => api<{ token: string; usuario: Usuario }>('/auth/salir-vista', { metodo: 'POST' }),
};
