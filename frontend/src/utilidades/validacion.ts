/**
 * Validaciones de formularios con mensajes claros: dicen qué falta o qué está mal escrito.
 * Cada función devuelve el problema en palabras simples, o '' si está bien.
 */

const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** RUC de SUNAT: 11 dígitos, empieza con 10 o 20 y el último es el dígito verificador */
export function problemaRuc(ruc: string): string {
  if (!ruc) return 'Escribe el RUC';
  if (/^[^12]|^1[^0]|^2[^0]/.test(ruc)) return 'El RUC debe empezar con 10 (persona natural con negocio) o 20 (empresa)';
  if (ruc.length < 11) return `Faltan ${11 - ruc.length} ${11 - ruc.length === 1 ? 'dígito' : 'dígitos'}: el RUC tiene 11`;
  const suma = PESOS_RUC.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  if (verificador !== Number(ruc[10])) return 'Ese RUC no existe: revisa los dígitos (el último no corresponde a los anteriores)';
  return '';
}

export function problemaDni(dni: string, obligatorio = false): string {
  if (!dni) return obligatorio ? 'Escribe el DNI' : '';
  if (dni.length !== 8) return `El DNI tiene 8 dígitos (escribiste ${dni.length})`;
  return '';
}

/** Celular (9…) o fijo con código de ciudad (01…, 044…): siempre 9 dígitos */
export function problemaTelefono(t: string): string {
  if (!t) return 'Escribe el teléfono';
  if (!/^[90]/.test(t)) return 'El teléfono empieza con 9 (celular) o con 0 y el código de ciudad (fijo: 01…, 044…)';
  if (t.length !== 9) return `El teléfono tiene 9 dígitos (escribiste ${t.length})`;
  return '';
}

export function problemaCorreo(c: string): string {
  if (!c.trim()) return '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.trim()) ? '' : 'El correo está mal escrito (ejemplo: nombre@empresa.pe)';
}

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Fecha (AAAA-MM-DD) y hora (HH:MM) de una próxima acción: hoy o después, y no más de un año */
export function problemaFechaHora(fecha: string, hora: string): string {
  if (!fecha) return 'Elige el día';
  if (fecha < hoyISO()) return 'Ese día ya pasó: elige hoy o un día posterior';
  if (!hora) return 'Elige la hora';
  if (new Date(`${fecha}T${hora}:00`) <= new Date()) return 'Esa hora ya pasó: elige una hora más tarde';
  const limite = new Date(); limite.setFullYear(limite.getFullYear() + 1);
  if (new Date(`${fecha}T${hora}:00`) > limite) return 'Agenda como máximo a un año';
  return '';
}

/** Para los buscadores: si escriben solo números, no más de 11 (el largo de un RUC) */
export const recortarRuc = (texto: string) => (/^\d+$/.test(texto) ? texto.slice(0, 11) : texto);

/** Último ingreso legible: "Hoy 09:42", "Ayer 18:10", "lun 23-nov 10:05" o "Nunca" */
export function ultimoIngreso(iso: string | null): string {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dia = (x: Date) => x.toLocaleDateString('en-CA');
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86_400_000);
  if (dia(d) === dia(hoy)) return `Hoy ${hora}`;
  if (dia(d) === dia(ayer)) return `Ayer ${hora}`;
  return `${d.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' })} ${hora}`;
}
