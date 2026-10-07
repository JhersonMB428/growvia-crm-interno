/** Cliente HTTP del CRM: agrega el token de sesión y traduce los errores del backend. */

const CLAVE_TOKEN = 'gv-token';

export class ErrorApi extends Error {
  estado: number;
  codigo?: string;
  /** Todo lo que respondió el backend (algunos errores traen datos extra) */
  datos?: Record<string, unknown>;
  constructor(estado: number, mensaje: string, codigo?: string, datos?: Record<string, unknown>) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.datos = datos;
  }
}

/** Mensaje que se muestra en el login cuando la sesión se cortó (venció o se retiró el acceso del celular) */
export const CLAVE_SALIDA = 'gv-salida';

export const token = {
  leer: () => sessionStorage.getItem(CLAVE_TOKEN),
  guardar: (t: string) => sessionStorage.setItem(CLAVE_TOKEN, t),
  borrar: () => sessionStorage.removeItem(CLAVE_TOKEN),
};

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown; cabeceras?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opciones.cabeceras };
  const t = token.leer();
  if (t) headers.Authorization = `Bearer ${t}`;

  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, {
      method: opciones.metodo ?? 'GET',
      headers,
      body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    });
  } catch {
    throw new ErrorApi(0, 'No pudimos conectar con el servidor. Revisa tu conexión.');
  }

  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(datos.message) ? datos.message[0] : datos.message;
    // La sesión se cortó: se cierra y se vuelve al login con el motivo
    if (res.status === 401 && t) {
      token.borrar();
      sessionStorage.setItem(CLAVE_SALIDA, msg ?? 'Tu sesión terminó. Vuelve a iniciar sesión.');
      window.dispatchEvent(new Event('gv-sesion-terminada'));
    }
    throw new ErrorApi(res.status, msg ?? 'Ocurrió un error inesperado', datos.codigo, datos);
  }
  return datos as T;
}
