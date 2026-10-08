import { api, ErrorApi, token } from './cliente';

// ───────── Exportación (solo gerencia) ─────────
export type Reporte = 'ventas' | 'negociaciones' | 'gestiones' | 'cartera' | 'metas';

export const exportacionApi = {
  /** Descarga el Excel y devuelve el nombre del archivo y cuántas filas trae */
  async descargar(tipo: Reporte, filtros: { desde?: string; hasta?: string; contactos?: boolean }) {
    const q = new URLSearchParams();
    if (filtros.desde) q.set('desde', filtros.desde);
    if (filtros.hasta) q.set('hasta', filtros.hasta);
    if (filtros.contactos) q.set('contactos', 'true');
    let res: Response;
    try {
      res = await fetch(`/api/exportar/${tipo}?${q}`, { headers: { Authorization: `Bearer ${token.leer() ?? ''}` } });
    } catch {
      throw new ErrorApi(0, 'No pudimos conectar con el servidor. Revisa tu conexión.');
    }
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({}));
      throw new ErrorApi(res.status, (Array.isArray(cuerpo.message) ? cuerpo.message[0] : cuerpo.message) ?? 'No se pudo exportar');
    }
    const nombre = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `growvia-${tipo}.xlsx`;
    const filas = Number(res.headers.get('x-filas') ?? 0);
    const url = URL.createObjectURL(await res.blob());
    Object.assign(document.createElement('a'), { href: url, download: nombre }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { nombre, filas };
  },
};

// ───────── Bitácora (gerencia y administración) ─────────
export type Categoria = 'accesos' | 'empresas' | 'ventas' | 'documentos' | 'datos' | 'admin';

export interface RegistroBitacora {
  id: string; fecha: string; accion: string; entidad: string | null; entidadId: string | null;
  detalle: Record<string, string | number | boolean> | null; ip: string | null;
  usuario: string | null; rol: string | null; referencia: string | null; enlaceId: string | null; otroUsuario: string | null;
}

export interface FiltrosBitacora { desde?: string; hasta?: string; usuarioId?: string; categoria?: Categoria; pagina?: number }

export const bitacoraApi = {
  listar: (f: FiltrosBitacora) => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    return api<{ total: number; pagina: number; paginas: number; filas: RegistroBitacora[] }>(`/bitacora?${q}`);
  },
  usuarios: () => api<{ id: string; nombre: string; rol: string }[]>('/bitacora/usuarios'),
};

export const TEXTO_ACCION: Record<string, string> = {
  LOGIN: 'Ingresó al CRM', LOGIN_FALLIDO: 'Contraseña incorrecta', CODIGO_FALLIDO: 'Código de verificación incorrecto',
  LOGIN_BLOQUEADO: 'Ingreso bloqueado', ACCESO_DENEGADO: 'Intentó entrar sin permiso',
  EMPRESA_CREAR: 'Registró una empresa', EMPRESA_TOMAR: 'Tomó una empresa', EMPRESA_REASIGNAR: 'Reasignó una empresa',
  EMPRESA_CORREGIR: 'Corrigió datos de la empresa', CONTACTOS_EDITAR: 'Editó contactos', EMPRESA_CONTRATO: 'Registró su contrato actual',
  GESTION_REGISTRAR: 'Registró una gestión', GESTION_REPROGRAMAR: 'Reprogramó una gestión',
  NEGOCIACION_CREAR: 'Abrió una negociación', NEGOCIACION_EDITAR: 'Editó los planes', NEGOCIACION_ETAPA: 'Cambió la etapa',
  NEGOCIACION_CERRAR: 'Cerró la negociación', RENOVACION_INICIAR: 'Inició una renovación', VENTA_REENVIAR: 'Corrigió y reenvió la venta', VENTA_APROBAR: 'Aprobó la venta',
  VENTA_REVISAR: 'Dio visto bueno', VENTA_OBSERVAR: 'Observó la venta', VENTA_DETENER: 'Detuvo la venta', VENTA_VALIDAR: 'Validó la venta',
  VENTA_POSVENTA: 'Registró posventa', DOCUMENTO_SUBIR: 'Subió un documento', DOCUMENTO_VER: 'Abrió un documento',
  DOCUMENTO_ELIMINAR: 'Eliminó un documento', BASE_SUBIR: 'Subió una base', BASE_APROBAR: 'Aprobó una base', BASE_RECHAZAR: 'Rechazó una base',
  EXPORTAR: 'Exportó datos', META_DEFINIR: 'Definió una meta', OTRA: 'Otra acción',
  ACCESO_MOVIL_SOLICITAR: 'Pidió acceso desde celular', ACCESO_MOVIL_APROBAR: 'Aprobó acceso desde celular',
  ACCESO_MOVIL_RECHAZAR: 'Rechazó acceso desde celular', ACCESO_MOVIL_REVOCAR: 'Retiró acceso desde celular',
  ACCESO_MOVIL_OTORGAR: 'Dio acceso desde celular', SESION_MOVIL_CORTADA: 'Celular sacado del CRM',
  CLAVE_CAMBIAR: 'Cambió su contraseña', CLAVE_FALLIDA: 'Contraseña actual incorrecta (perfil)', PERFIL_AVISOS: 'Cambió sus avisos',
  DISPOSITIVO_QUITAR: 'Quitó un equipo de confianza', DISPOSITIVOS_QUITAR_TODOS: 'Quitó todos sus equipos de confianza',
  USUARIO_CREAR: 'Creó un usuario', USUARIO_EDITAR: 'Editó un usuario', USUARIO_CLAVE: 'Restableció una contraseña',
  USUARIO_DESACTIVAR: 'Desactivó un usuario', USUARIO_REACTIVAR: 'Reactivó un usuario', EQUIPO_CREAR: 'Creó un equipo',
  EQUIPO_EDITAR: 'Editó un equipo', PLAN_GUARDAR: 'Guardó un plan', OPERADOR_GUARDAR: 'Guardó un operador', PARAMETRO_EDITAR: 'Cambió un parámetro',
};

/** Acciones que conviene mirar con atención */
export const ACCIONES_ALERTA = new Set(['LOGIN_FALLIDO', 'CODIGO_FALLIDO', 'LOGIN_BLOQUEADO', 'ACCESO_DENEGADO', 'VENTA_DETENER', 'DOCUMENTO_ELIMINAR', 'EXPORTAR',
  'ACCESO_MOVIL_APROBAR', 'ACCESO_MOVIL_OTORGAR', 'ACCESO_MOVIL_REVOCAR', 'SESION_MOVIL_CORTADA', 'CLAVE_FALLIDA',
  'USUARIO_DESACTIVAR', 'USUARIO_CLAVE', 'PARAMETRO_EDITAR']);