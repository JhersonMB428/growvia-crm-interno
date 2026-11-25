/**
 * Validación de RUC (SUNAT): 11 dígitos, empieza con 10 (persona natural) o 20 (empresa)
 * y el último dígito es el verificador (módulo 11 con pesos 5,4,3,2,7,6,5,4,3,2).
 * Devuelve el motivo en palabras simples, o null si el RUC es válido.
 */
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function errorRuc(ruc: string): string | null {
  if (!/^\d+$/.test(ruc)) return 'El RUC solo lleva números';
  if (ruc.length !== 11) return `El RUC tiene 11 dígitos (escribiste ${ruc.length})`;
  if (!/^(10|20)/.test(ruc)) return 'El RUC debe empezar con 10 (persona natural con negocio) o 20 (empresa)';
  const suma = PESOS.reduce((s, p, i) => s + p * Number(ruc[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 10 ? 0 : resto === 11 ? 1 : resto;
  if (verificador !== Number(ruc[10])) return 'Ese RUC no existe: revisa los dígitos (el último no corresponde a los anteriores)';
  return null;
}
