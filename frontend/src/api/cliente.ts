/** Cliente HTTP del CRM: agrega el token de sesión y traduce los errores del backend. */

const CLAVE_TOKEN = 'gv-token';

export class ErrorApi extends Error {
  estado: number;
  codigo?: string;
  constructor(estado: number, mensaje: string, codigo?: string) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

export const token = {
  leer: () => sessionStorage.getItem(CLAVE_TOKEN),
  guardar: (t: string) => sessionStorage.setItem(CLAVE_TOKEN, t),
  borrar: () => sessionStorage.removeItem(CLAVE_TOKEN),
};

export async function api<T>(ruta: string, opciones: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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
    throw new ErrorApi(res.status, msg ?? 'Ocurrió un error inesperado', datos.codigo);
  }
  return datos as T;
}
