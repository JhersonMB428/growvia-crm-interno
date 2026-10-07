import { api, ErrorApi, token } from './cliente';

export type EstadoCarga = 'PENDIENTE_APROBACION' | 'PROCESANDO' | 'LISTO' | 'ERROR' | 'RECHAZADO';
export type MotivoError = 'RUC_INVALIDO' | 'RUC_DUPLICADO' | 'UBIGEO_INVALIDO' | 'DATO_FALTANTE' | 'DATO_INVALIDO';

export interface CargaResumen {
  id: string; archivo: string; total: number; validas: number; conError: number; estado: EstadoCarga;
  fecha: string; subidoPor: string; asignarA: string | null;
}
export interface CargaDetalle extends CargaResumen {
  revisadoAt: string | null; revisadoPor: string | null; motivoRechazo: string | null;
  errores: { fila: number; ruc: string | null; motivo: MotivoError; detalle: string; datos: Record<string, string> }[];
  muestra: { fila: number; ruc: string; razonSocial: string; distrito: string | null; provincia: string | null; contactos: number }[];
  puedeRevisar: boolean;
}

/** Envía un archivo con el token de sesión (el cliente normal solo manda JSON) */
async function enviarArchivo<T>(ruta: string, datos: FormData): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${ruta}`, { method: 'POST', headers: { Authorization: `Bearer ${token.leer() ?? ''}` }, body: datos });
  } catch {
    throw new ErrorApi(0, 'No pudimos conectar con el servidor. Revisa tu conexión.');
  }
  const cuerpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = res.status === 413 ? 'El archivo pesa más de 5 MB' : Array.isArray(cuerpo.message) ? cuerpo.message[0] : cuerpo.message;
    throw new ErrorApi(res.status, msg ?? 'No se pudo subir el archivo');
  }
  return cuerpo as T;
}

export const basesApi = {
  listar: () => api<{ filas: CargaResumen[] }>('/bases'),
  detalle: (id: string) => api<CargaDetalle>(`/bases/${id}`),
  destinos: () => api<{ repositorio: boolean; asesores: { id: string; nombre: string; equipo: string | null }[] }>('/bases/destinos'),
  subir: (archivo: File, asignarA?: string) => {
    const datos = new FormData();
    if (asignarA) datos.append('asignarA', asignarA);
    datos.append('archivo', archivo);
    return enviarArchivo<CargaDetalle>('/bases', datos);
  },
  aprobar: (id: string) => api<{ creadas: number; yaExistian: number; carga: CargaDetalle }>(`/bases/${id}/aprobar`, { metodo: 'POST' }),
  rechazar: (id: string, motivo: string) => api<CargaDetalle>(`/bases/${id}/rechazar`, { metodo: 'POST', cuerpo: { motivo } }),
  /** Descarga la plantilla vacía */
  async plantilla() {
    const res = await fetch('/api/bases/plantilla', { headers: { Authorization: `Bearer ${token.leer() ?? ''}` } });
    if (!res.ok) throw new ErrorApi(res.status, 'No se pudo descargar la plantilla');
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: 'plantilla-base-empresas.xlsx' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const TEXTO_ESTADO_CARGA: Record<EstadoCarga, string> = {
  PENDIENTE_APROBACION: 'Por aprobar', PROCESANDO: 'Procesando', LISTO: 'Cargada', ERROR: 'Con error', RECHAZADO: 'Rechazada',
};
export const TEXTO_MOTIVO: Record<MotivoError, string> = {
  RUC_INVALIDO: 'RUC inválido', RUC_DUPLICADO: 'RUC repetido', UBIGEO_INVALIDO: 'Ubicación', DATO_FALTANTE: 'Falta un dato', DATO_INVALIDO: 'Dato inválido',
};