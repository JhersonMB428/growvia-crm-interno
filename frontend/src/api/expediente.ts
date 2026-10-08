import { api, ErrorApi, token } from './cliente';

export type TipoDocumento = 'CONTRATO' | 'DNI' | 'FICHA_RUC' | 'CARTA_PORTABILIDAD' | 'OTRO';

export interface Documento {
  id: string; tipo: TipoDocumento; nombre: string; mime: string; tamano: number; fecha: string; subidoPor: string; puedeEliminar: boolean;
}
export interface Expediente { documentos: Documento[]; puedeSubir: boolean; maximo: number; maxMb: number }

export const TEXTO_DOCUMENTO: Record<TipoDocumento, string> = {
  CONTRATO: 'Contrato / solicitud', DNI: 'DNI del representante', FICHA_RUC: 'Ficha RUC',
  CARTA_PORTABILIDAD: 'Carta de portabilidad', OTRO: 'Otro',
};

const conToken = () => ({ Authorization: `Bearer ${token.leer() ?? ''}` });

export const expedienteApi = {
  listar: (negociacionId: string) => api<Expediente>(`/negociaciones/${negociacionId}/documentos`),

  async subir(negociacionId: string, tipo: TipoDocumento, archivo: File, maxMb = 10): Promise<Expediente> {
    const datos = new FormData();
    datos.append('tipo', tipo);
    datos.append('archivo', archivo);
    let res: Response;
    try {
      res = await fetch(`/api/negociaciones/${negociacionId}/documentos`, { method: 'POST', headers: conToken(), body: datos });
    } catch {
      throw new ErrorApi(0, 'No pudimos conectar con el servidor. Revisa tu conexión.');
    }
    const cuerpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 413 ? `El archivo pesa más de ${maxMb} MB` : Array.isArray(cuerpo.message) ? cuerpo.message[0] : cuerpo.message;
      throw new ErrorApi(res.status, msg ?? 'No se pudo subir el archivo');
    }
    return cuerpo as Expediente;
  },

  /** Trae el archivo con el token y devuelve una URL local para mostrarlo en el visor */
  async ver(id: string): Promise<string> {
    const res = await fetch(`/api/documentos/${id}/archivo`, { headers: conToken() });
    if (!res.ok) throw new ErrorApi(res.status, res.status === 404 ? 'El documento ya no existe' : 'No se pudo abrir el documento');
    return URL.createObjectURL(await res.blob());
  },

  eliminar: (id: string) => api<Expediente>(`/documentos/${id}`, { metodo: 'DELETE' }),
};

export const pesoLegible = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);