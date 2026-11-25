import { api } from './cliente';

export interface Representante { nombre: string; tipoDocumento: string | null; documento: string | null; dni: string | null; cargo: string | null; desde: string | null }
export interface DatosSunat {
  ruc: string; razonSocial: string | null; estado: string | null; condicion: string | null; direccion: string | null;
  distritoId: string | null; ubicacion: string | null; representantes: Representante[]; alerta: string | null;
}

let activo: Promise<boolean> | null = null;

export const sunatApi = {
  /** ¿Está configurada la consulta a SUNAT? (se pregunta una vez por sesión) */
  activo: () => (activo ??= api<{ activo: boolean }>('/sunat/estado').then((r) => r.activo).catch(() => false)),
  consultar: (ruc: string) => api<DatosSunat>(`/sunat/ruc/${ruc}`),
};

/** "PEREZ ROJAS JUAN CARLOS" → "Perez Rojas Juan Carlos" */
export const nombrePropio = (t: string) => t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
export const textoSunat = (estado?: string | null, condicion?: string | null) =>
  [estado, condicion].filter(Boolean).map((t) => nombrePropio(t!)).join(' · ');
