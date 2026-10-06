/**
 * Identificador aleatorio de este navegador. Sirve para "Recordar este equipo por 7 días".
 * No contiene datos personales; el backend solo guarda una versión cifrada.
 */
const CLAVE = 'gv-huella';

export function huellaDelEquipo(): string {
  let h = localStorage.getItem(CLAVE);
  if (!h) {
    h = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem(CLAVE, h);
  }
  return h;
}
