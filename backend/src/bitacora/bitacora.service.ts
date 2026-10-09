import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';

interface Regla {
  accion: string;
  entidad?: string;
  /** De dónde sale el id de la entidad (por defecto, el :id de la ruta) */
  idDe?: 'clienteId';
  /** Campos del cuerpo que se guardan (nunca contraseñas ni códigos) */
  campos?: string[];
  /** Guarda también los filtros de la URL (?mes=...) */
  query?: boolean;
}

/**
 * Qué se registra. Toda acción que cambia datos queda registrada (si no está aquí, como "OTRA").
 * De las consultas (GET) solo se registran ver documentos y exportar.
 */
const REGLAS: Record<string, Regla> = {
  'POST /empresas': { accion: 'EMPRESA_CREAR', entidad: 'EMPRESA', campos: ['ruc', 'razonSocial'] },
  'POST /empresas/:id/tomar': { accion: 'EMPRESA_TOMAR', entidad: 'EMPRESA' },
  'POST /empresas/:id/reasignar': { accion: 'EMPRESA_REASIGNAR', entidad: 'EMPRESA', campos: ['asesorId'] },
  'PUT /empresas/:id': { accion: 'EMPRESA_CORREGIR', entidad: 'EMPRESA', campos: ['razonSocial', 'distritoId'] },
  'PUT /empresas/:id/contactos': { accion: 'CONTACTOS_EDITAR', entidad: 'EMPRESA' },
  'PUT /empresas/:id/contrato-actual': { accion: 'EMPRESA_CONTRATO', entidad: 'EMPRESA', campos: ['operadorId', 'finContrato'] },
  'POST /gestiones': { accion: 'GESTION_REGISTRAR', entidad: 'EMPRESA', idDe: 'clienteId', campos: ['canal', 'resultado'] },
  'PUT /gestiones/:id/reprogramar': { accion: 'GESTION_REPROGRAMAR', entidad: 'GESTION' },
  'POST /negociaciones': { accion: 'NEGOCIACION_CREAR', entidad: 'EMPRESA', idDe: 'clienteId', campos: ['tipo'] },
  'PUT /negociaciones/:id': { accion: 'NEGOCIACION_EDITAR', entidad: 'NEGOCIACION' },
  'POST /negociaciones/:id/etapa': { accion: 'NEGOCIACION_ETAPA', entidad: 'NEGOCIACION', campos: ['etapa'] },
  'POST /negociaciones/:id/renovar': { accion: 'RENOVACION_INICIAR', entidad: 'NEGOCIACION' },
  'POST /negociaciones/:id/cerrar': { accion: 'NEGOCIACION_CERRAR', entidad: 'NEGOCIACION', campos: ['resultado', 'motivoPerdida'] },
  'POST /negociaciones/:id/reenviar': { accion: 'VENTA_REENVIAR', entidad: 'NEGOCIACION' },
  'POST /validacion/:id/aprobar': { accion: 'VENTA_APROBAR', entidad: 'NEGOCIACION' },
  'POST /validacion/:id/revisar': { accion: 'VENTA_REVISAR', entidad: 'NEGOCIACION' },
  'POST /validacion/:id/observar': { accion: 'VENTA_OBSERVAR', entidad: 'NEGOCIACION', campos: ['comentario'] },
  'POST /validacion/:id/detener': { accion: 'VENTA_DETENER', entidad: 'NEGOCIACION', campos: ['comentario'] },
  'POST /validacion/:id/validar': { accion: 'VENTA_VALIDAR', entidad: 'NEGOCIACION' },
  'POST /validacion/:id/posventa': { accion: 'VENTA_POSVENTA', entidad: 'NEGOCIACION', campos: ['evento', 'ordenOperador'] },
  'POST /negociaciones/:id/documentos': { accion: 'DOCUMENTO_SUBIR', entidad: 'NEGOCIACION', campos: ['tipo'] },
  'GET /documentos/:id/archivo': { accion: 'DOCUMENTO_VER', entidad: 'DOCUMENTO' },
  'DELETE /documentos/:id': { accion: 'DOCUMENTO_ELIMINAR', entidad: 'DOCUMENTO' },
  'POST /bases': { accion: 'BASE_SUBIR', entidad: 'CARGA', campos: ['asignarA'] },
  'POST /bases/:id/aprobar': { accion: 'BASE_APROBAR', entidad: 'CARGA' },
  'POST /bases/:id/rechazar': { accion: 'BASE_RECHAZAR', entidad: 'CARGA', campos: ['motivo'] },
  'PUT /metas': { accion: 'META_DEFINIR', campos: ['mes', 'alcance', 'id', 'metaLineas'] },
  'GET /exportar/:tipo': { accion: 'EXPORTAR', query: true },
  'POST /accesos-moviles': { accion: 'ACCESO_MOVIL_SOLICITAR', campos: ['dias'] },
  'POST /accesos-moviles/:id/aprobar': { accion: 'ACCESO_MOVIL_APROBAR', entidad: 'ACCESO', campos: ['hasta'] },
  'POST /accesos-moviles/:id/rechazar': { accion: 'ACCESO_MOVIL_RECHAZAR', entidad: 'ACCESO', campos: ['respuesta'] },
  'POST /accesos-moviles/:id/revocar': { accion: 'ACCESO_MOVIL_REVOCAR', entidad: 'ACCESO', campos: ['respuesta'] },
  'POST /accesos-moviles/otorgar': { accion: 'ACCESO_MOVIL_OTORGAR', campos: ['usuarioId', 'hasta'] },
  'PUT /perfil/clave': { accion: 'CLAVE_CAMBIAR' },
  'PUT /perfil/foto': { accion: 'FOTO_CAMBIAR' },
  'DELETE /perfil/foto': { accion: 'FOTO_QUITAR' },
  'DELETE /admin/usuarios/:id/foto': { accion: 'FOTO_QUITAR_OTRO', entidad: 'USUARIO' },
  'PUT /perfil/avisos': { accion: 'PERFIL_AVISOS', campos: ['avisoCorreo', 'minutosRecordatorio'] },
  'DELETE /perfil/dispositivos/:id': { accion: 'DISPOSITIVO_QUITAR' },
  'DELETE /perfil/dispositivos': { accion: 'DISPOSITIVOS_QUITAR_TODOS' },
  'POST /admin/usuarios': { accion: 'USUARIO_CREAR', campos: ['email', 'rol', 'equipoId'] },
  'PUT /admin/usuarios/:id': { accion: 'USUARIO_EDITAR', entidad: 'USUARIO', campos: ['email', 'rol', 'equipoId'] },
  'POST /admin/usuarios/:id/clave': { accion: 'USUARIO_CLAVE', entidad: 'USUARIO' },
  'POST /admin/usuarios/:id/desactivar': { accion: 'USUARIO_DESACTIVAR', entidad: 'USUARIO', campos: ['destino'] },
  'POST /admin/usuarios/:id/reactivar': { accion: 'USUARIO_REACTIVAR', entidad: 'USUARIO' },
  'POST /admin/equipos': { accion: 'EQUIPO_CREAR', campos: ['nombre', 'supervisorId'] },
  'PUT /admin/equipos/:id': { accion: 'EQUIPO_EDITAR', entidad: 'EQUIPO', campos: ['nombre', 'supervisorId', 'activo'] },
  'POST /admin/planes': { accion: 'PLAN_GUARDAR', campos: ['tipo', 'nombre', 'cargoRef'] },
  'PUT /admin/planes/:id': { accion: 'PLAN_GUARDAR', campos: ['tipo', 'nombre', 'cargoRef', 'activo'] },
  'POST /admin/operadores': { accion: 'OPERADOR_GUARDAR', campos: ['nombre'] },
  'PUT /admin/operadores/:id': { accion: 'OPERADOR_GUARDAR', campos: ['nombre', 'activo'] },
  'PUT /admin/parametros/:clave': { accion: 'PARAMETRO_EDITAR', campos: ['valor'] },
};

/** Acciones sin valor de auditoría */
const IGNORAR = new Set(['POST /notificaciones/leer-todas', 'POST /notificaciones/:id/leida', 'POST /auth/reenviar', 'PUT /perfil/guia']);
/** Grupos para el filtro de la pantalla */
export const CATEGORIAS: Record<string, string[]> = {
  accesos: ['LOGIN', 'LOGIN_FALLIDO', 'CODIGO_FALLIDO', 'LOGIN_BLOQUEADO', 'ACCESO_DENEGADO', 'SESION_MOVIL_CORTADA',
        'ACCESO_MOVIL_SOLICITAR', 'ACCESO_MOVIL_APROBAR', 'ACCESO_MOVIL_RECHAZAR', 'ACCESO_MOVIL_REVOCAR', 'ACCESO_MOVIL_OTORGAR',
    'CLAVE_CAMBIAR', 'CLAVE_FALLIDA', 'DISPOSITIVO_QUITAR', 'DISPOSITIVOS_QUITAR_TODOS', 'FOTO_CAMBIAR', 'FOTO_QUITAR'],
  empresas: ['EMPRESA_CREAR', 'EMPRESA_TOMAR', 'EMPRESA_REASIGNAR', 'EMPRESA_CORREGIR', 'CONTACTOS_EDITAR', 'EMPRESA_CONTRATO', 'GESTION_REGISTRAR', 'GESTION_REPROGRAMAR'],
  ventas: ['NEGOCIACION_CREAR', 'NEGOCIACION_EDITAR', 'NEGOCIACION_ETAPA', 'NEGOCIACION_CERRAR', 'RENOVACION_INICIAR', 'VENTA_REENVIAR', 'VENTA_APROBAR',
    'VENTA_REVISAR', 'VENTA_OBSERVAR', 'VENTA_DETENER', 'VENTA_VALIDAR', 'VENTA_POSVENTA'],
  documentos: ['DOCUMENTO_SUBIR', 'DOCUMENTO_VER', 'DOCUMENTO_ELIMINAR'],
  datos: ['BASE_SUBIR', 'BASE_APROBAR', 'BASE_RECHAZAR', 'EXPORTAR', 'META_DEFINIR'],
  admin: ['USUARIO_CREAR', 'USUARIO_EDITAR', 'USUARIO_CLAVE', 'USUARIO_DESACTIVAR', 'USUARIO_REACTIVAR', 'EQUIPO_CREAR', 'EQUIPO_EDITAR',
    'PLAN_GUARDAR', 'OPERADOR_GUARDAR', 'PARAMETRO_EDITAR', 'FOTO_QUITAR_OTRO'],
};

const recortar = (v: unknown) => (typeof v === 'string' && v.length > 300 ? `${v.slice(0, 300)}…` : v);

@Injectable()
export class BitacoraService {
  private readonly log = new Logger('Bitácora');

  constructor(private readonly db: DataSource) {}

  /** Registro directo (para lo que no pasa por una petición, si hiciera falta) */
  async registrar(usuarioId: string | null, accion: string, o: { entidad?: string; entidadId?: string; detalle?: object; ip?: string; email?: string } = {}) {
    await this.db.query(
      `INSERT INTO bitacora (usuario_id, accion, entidad, entidad_id, detalle, ip)
       VALUES (COALESCE($1::uuid, (SELECT id FROM usuarios WHERE lower(email) = lower($7))), $2, $3, $4, $5, $6)`,
      [usuarioId, accion, o.entidad ?? null, o.entidadId ?? null, o.detalle && Object.keys(o.detalle).length ? JSON.stringify(o.detalle) : null, o.ip?.replace(/^::ffff:/, '') ?? null, o.email ?? null], // "::ffff:127.0.0.1" → "127.0.0.1"
    );
  }

  /** Lo llama el middleware cuando termina cada petición. Nunca rompe la petición si falla. */
  async desdePeticion(req: Request, res: Response, respuesta: unknown) {
    try {
      const ruta = String(req.route?.path ?? req.path).replace(/^\/api/, '');
      const clave = `${req.method} ${ruta}`;
      if (IGNORAR.has(clave)) return;
      const estado = res.statusCode;
      const ip = req.ip;
      const sesion = (req as Request & { usuario?: SesionUsuario }).usuario; // lo pone JwtAuthGuard
      const cuerpo = (req.body ?? {}) as Record<string, unknown>;

      // ── Ingreso al CRM ──
      if (clave === 'POST /auth/login' || clave === 'POST /auth/verificar') {
        const r = respuesta as { requiereCodigo?: boolean; usuario?: { id: string } } | undefined;
        const email = typeof cuerpo.email === 'string' ? cuerpo.email.slice(0, 120) : undefined;
        if (estado < 300 && r?.requiereCodigo === false && r.usuario) {
          return await this.registrar(r.usuario.id, 'LOGIN', { ip, detalle: { conCodigo: clave.endsWith('verificar') } });
        }
        if (estado === 401) {
          if (clave.endsWith('login')) return await this.registrar(null, 'LOGIN_FALLIDO', { ip, email, detalle: { email } });
          return await this.registrar(this.usuarioDelDesafio(cuerpo.desafio), 'CODIGO_FALLIDO', { ip });
        }
        if (estado === 403) return await this.registrar(null, 'LOGIN_BLOQUEADO', { ip, email, detalle: { email } });
        return;
      }

      // ── Intentos de entrar a algo sin permiso ──
      if (estado === 403 && sesion) {
        return await this.registrar(sesion.sub, 'ACCESO_DENEGADO', { ip, detalle: { ruta: clave } });
      }

      if (estado >= 300 || !sesion) return;
      const regla = REGLAS[clave];
      if (!regla && req.method === 'GET') return;
      if (!regla) return await this.registrar(sesion.sub, 'OTRA', { ip, detalle: { ruta: clave } });

      const detalle: Record<string, unknown> = {};
      for (const c of regla.campos ?? []) if (cuerpo[c] !== undefined && cuerpo[c] !== '') detalle[c] = recortar(cuerpo[c]);
      if (regla.query) Object.assign(detalle, req.query);
      if (req.params?.tipo) detalle.tipo = req.params.tipo;
      if (req.params?.clave) detalle.clave = req.params.clave;
      Object.assign(detalle, res.locals.bitacora ?? {}); // datos extra que deja el controlador (p. ej. filas exportadas)
      const entidadId = regla.idDe ? cuerpo[regla.idDe] : req.params?.id;
      await this.registrar(sesion.sub, regla.accion, {
        ip, entidad: regla.entidad, entidadId: typeof entidadId === 'string' ? entidadId : undefined, detalle,
      });
    } catch (e) {
      this.log.warn(`No se pudo registrar en la bitácora: ${(e as Error).message}`);
    }
  }

  /** El desafío del login es un JWT; solo se lee el usuario para el registro (la firma ya la revisó el login) */
  private usuarioDelDesafio(desafio: unknown): string | null {
    try {
      const sub = JSON.parse(Buffer.from(String(desafio).split('.')[1], 'base64url').toString()).sub;
      return /^[0-9a-f-]{36}$/.test(sub) ? sub : null;
    } catch {
      return null;
    }
  }

  // ───────────── Pantalla de la bitácora ─────────────
  async listar(f: { desde?: string; hasta?: string; usuarioId?: string; categoria?: string; pagina?: number }) {
    const cond: string[] = [];
    const p: unknown[] = [];
    const Z = `'America/Lima'`;
    if (f.desde) { p.push(f.desde); cond.push(`b.created_at >= ($${p.length}::date)::timestamp AT TIME ZONE ${Z}`); }
    if (f.hasta) { p.push(f.hasta); cond.push(`b.created_at < ($${p.length}::date + 1)::timestamp AT TIME ZONE ${Z}`); }
    if (f.usuarioId) { p.push(f.usuarioId); cond.push(`b.usuario_id = $${p.length}`); }
    if (f.categoria && CATEGORIAS[f.categoria]) { p.push(CATEGORIAS[f.categoria]); cond.push(`b.accion = ANY($${p.length})`); }
    const donde = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const porPagina = 50;
    const pagina = Math.max(1, f.pagina ?? 1);

    const [{ total }] = await this.db.query(`SELECT count(*)::int AS total FROM bitacora b ${donde}`, p);
    const filas = await this.db.query(
      `SELECT b.id, b.created_at AS fecha, b.accion, b.entidad, b.entidad_id AS "entidadId", b.detalle, b.ip,
              u.nombres || ' ' || u.apellidos AS usuario, r.nombre AS rol,
              -- A qué se refiere, en palabras (empresa, venta o documento)
              CASE b.entidad
                WHEN 'EMPRESA' THEN (SELECT c.razon_social FROM clientes c WHERE c.id::text = b.entidad_id)
                WHEN 'NEGOCIACION' THEN (SELECT o.codigo || ' · ' || c.razon_social FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id WHERE o.id::text = b.entidad_id)
                WHEN 'DOCUMENTO' THEN (SELECT d.nombre || ' · ' || o.codigo FROM documentos_venta d JOIN oportunidades o ON o.id = d.oportunidad_id WHERE d.id::text = b.entidad_id)
                WHEN 'CARGA' THEN (SELECT l.archivo_nombre FROM lotes_importacion l WHERE l.id::text = b.entidad_id)
                WHEN 'USUARIO' THEN (SELECT u2.nombres || ' ' || u2.apellidos FROM usuarios u2 WHERE u2.id::text = b.entidad_id)
                WHEN 'EQUIPO' THEN (SELECT e2.nombre FROM equipos e2 WHERE e2.id::text = b.entidad_id)                
                WHEN 'ACCESO' THEN (SELECT 'Celular de ' || u2.nombres || ' ' || u2.apellidos FROM accesos_moviles a JOIN usuarios u2 ON u2.id = a.usuario_id WHERE a.id::text = b.entidad_id)
              END AS referencia,
              -- Para enlazar a la ficha
              CASE b.entidad
                WHEN 'DOCUMENTO' THEN (SELECT d.oportunidad_id::text FROM documentos_venta d WHERE d.id::text = b.entidad_id)
                ELSE b.entidad_id
              END AS "enlaceId",
              (SELECT a.nombres || ' ' || a.apellidos FROM usuarios a WHERE a.id::text = COALESCE(b.detalle->>'asesorId', b.detalle->>'asignarA', b.detalle->>'usuarioId', b.detalle->>'destino', b.detalle->>'supervisorId')) AS "otroUsuario"
       FROM bitacora b
       LEFT JOIN usuarios u ON u.id = b.usuario_id
       LEFT JOIN roles r ON r.id = u.rol_id
       ${donde}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, p,
    );
    return { total, pagina, porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)), filas };
  }

  /** Usuarios para el filtro */
  usuarios() {
    return this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id ORDER BY u.nombres, u.apellidos`,
    );
  }
}