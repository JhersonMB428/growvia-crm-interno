import { BadRequestException } from '@nestjs/common';

/** Reglas de contraseña del CRM (se usan al cambiarla y al crear usuarios) */
export const MIN_CLAVE = 10;

export function validarClave(clave: string, email: string, nombres = '') {
  if (clave.length < MIN_CLAVE) throw new BadRequestException(`La contraseña debe tener al menos ${MIN_CLAVE} caracteres`);
  if (clave.length > 72) throw new BadRequestException('La contraseña puede tener como máximo 72 caracteres');
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(clave) || !/\d/.test(clave)) throw new BadRequestException('La contraseña debe tener letras y números');
  const minus = clave.toLowerCase();
  const local = email.split('@')[0].toLowerCase();
  if (local.length >= 4 && minus.includes(local)) throw new BadRequestException('La contraseña no puede contener tu correo');
  const nombre = nombres.split(' ')[0]?.toLowerCase() ?? '';
  if (nombre.length >= 4 && minus.includes(nombre)) throw new BadRequestException('La contraseña no puede contener tu nombre');
  if (['growvia', 'contraseña', 'password', '123456'].some((x) => minus.includes(x))) throw new BadRequestException('Esa contraseña es muy fácil de adivinar');
}

/** "Chrome en Windows", "Safari en iPhone"... para reconocer los equipos de confianza */
export function nombreDelEquipo(ua = ''): string {
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const sistema = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'equipo desconocido';
  return `${navegador} en ${sistema}`;
}