import { api, ErrorApi, token } from './cliente';

export type EstadoCarga = 'PENDIENTE_APROBACION' | 'PROCESANDO' | 'LISTO' | 'ERROR' | 'RECHAZADO';
export type MotivoError = 'RUC_INVALIDO' | 'RUC_DUPLICADO' | 'UBIGEO_INVALIDO' | 'DATO_FALTANTE' | 'DATO_INVALIDO';

export interface CargaResumen {
  id: string; archivo: string; total: number; validas: number; conError: number; estado: EstadoCarga;
  fecha: string; subidoPor: string; asignarA: string | null;
  /** Base propia o comprada (con el nombre del proveedor) */
  origen: 'INTERNA' | 'COMPRADA'; proveedor: string | null;
  /** Filas de empresas que ya están en el CRM y que completan datos / filas sin nada nuevo */
  actualizar: number; iguales: number;
  /** Resultado al aprobar */
  creadas: number; actualizadas: number;
}
export interface Diferencia { campo: string; crm: string; base: string }
export interface CargaDetalle extends CargaResumen {
  revisadoAt: string | null; revisadoPor: string | null; motivoRechazo: string | null;
  errores: { fila: number; ruc: string | null; motivo: MotivoError; detalle: string; datos: Record<string, string> }[];
  muestra: { fila: number; ruc: string; razonSocial: string; distrito: string | null; provincia: string | null; contactos: number;
    representante: string | null; lineas: number | null; operador: string | null }[];
  /** Filas válidas a las que les falta algún dato de la estructura completa */
  incompletas: number;
  nuevas: number;
  /** Empresas que ya están en el CRM: qué completa la base y en qué difiere (las que difieren, primero) */
  existentes: { fila: number; ruc: string; razonSocial: string; asesor: string | null; completa: string[]; diferencias: Diferencia[] }[];
  conDiferencias: number;
  enDiferencias: 'CRM' | 'BASE' | null;
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
  subir: (archivo: File, opciones: { asignarA?: string; origen: 'INTERNA' | 'COMPRADA'; proveedor?: string }) => {
    const datos = new FormData();
    if (opciones.asignarA) datos.append('asignarA', opciones.asignarA);
    datos.append('origen', opciones.origen);
    if (opciones.proveedor) datos.append('proveedor', opciones.proveedor);
    datos.append('archivo', archivo);
    return enviarArchivo<CargaDetalle>('/bases', datos);
  },
  aprobar: (id: string, enDiferencias: 'CRM' | 'BASE') =>
    api<{ creadas: number; actualizadas: number; iguales: number; carga: CargaDetalle }>(`/bases/${id}/aprobar`, { metodo: 'POST', cuerpo: { enDiferencias } }),
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