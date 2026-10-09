import { api } from './cliente';
import { huellaDelEquipo } from '../sesion/huella';
import type { RespuestaLogin } from '../sesion/tipos';

export interface Dispositivo { id: string; nombre: string; creado: string; ultimoUso: string | null; expira: string; actual: boolean }

export interface MiPerfil {
  nombres: string; apellidos: string; email: string; rol: string; equipo: string | null; supervisor: string | null;
  avisoCorreo: boolean; minutosRecordatorio: number; claveCambiada: string | null; creado: string;
  dispositivos: Dispositivo[]; diasConfianza: number;
}

export const perfilApi = {
  /** Manda el identificador de este navegador para marcar "este equipo" */
  datos: () => api<MiPerfil>('/perfil', { cabeceras: { 'X-Huella': huellaDelEquipo() } }),
  /** Devuelve una sesión nueva: las anteriores dejan de valer */
  cambiarClave: (actual: string, nueva: string) =>
    api<Extract<RespuestaLogin, { requiereCodigo: false }>>('/perfil/clave', { metodo: 'PUT', cuerpo: { actual, nueva, huella: huellaDelEquipo() } }),
  avisos: (avisoCorreo: boolean, minutosRecordatorio: number) =>
    api<{ avisoCorreo: boolean; minutosRecordatorio: number }>('/perfil/avisos', { metodo: 'PUT', cuerpo: { avisoCorreo, minutosRecordatorio } }),
  quitarDispositivo: (id: string) => api(`/perfil/dispositivos/${id}`, { metodo: 'DELETE' }),
  quitarTodos: () => api('/perfil/dispositivos', { metodo: 'DELETE' }),
  /** Ya vio el recorrido de bienvenida */
  guiaVista: () => api<{ guiaVista: boolean }>('/perfil/guia', { metodo: 'PUT' }),
};

/** Reglas de contraseña (las mismas que revisa el backend) */
export function reglasClave(nueva: string, actual: string, confirmar: string, email: string) {
  const local = email.split('@')[0].toLowerCase();
  return [
    { ok: nueva.length >= 10, texto: 'Al menos 10 caracteres' },
    { ok: /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(nueva) && /\d/.test(nueva), texto: 'Letras y números' },
    { ok: !!nueva && !(local.length >= 4 && nueva.toLowerCase().includes(local)), texto: 'Que no contenga tu correo' },
    { ok: !!nueva && nueva !== actual, texto: 'Distinta de la actual' },
    { ok: !!nueva && nueva === confirmar, texto: 'Las dos coinciden' },
  ];
}