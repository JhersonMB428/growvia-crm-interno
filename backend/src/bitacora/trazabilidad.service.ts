import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CATEGORIAS } from './bitacora.service';

const ALERTAS = ['LOGIN_FALLIDO', 'CODIGO_FALLIDO', 'LOGIN_BLOQUEADO', 'ACCESO_DENEGADO', 'CLAVE_FALLIDA', 'SESION_MOVIL_CORTADA',
  'VENTA_DETENER', 'DOCUMENTO_ELIMINAR', 'EXPORTAR', 'USUARIO_DESACTIVAR', 'VISTA_INICIAR'];
const FALLIDOS = ['LOGIN_FALLIDO', 'CODIGO_FALLIDO', 'LOGIN_BLOQUEADO', 'ACCESO_DENEGADO', 'CLAVE_FALLIDA'];

/** Acciones de la bitácora que completan la historia de una empresa (lo demás sale de sus propias tablas) */
const EXTRA_EMPRESA = ['EMPRESA_MANTENER', 'EMPRESA_CORREGIR', 'CONTACTOS_EDITAR', 'EMPRESA_CONTRATO', 'GESTION_REPROGRAMAR', 'EMPRESA_LIBERAR', 'EMPRESA_REASIGNAR'];
const EXTRA_NEGOCIACION = ['NEGOCIACION_EDITAR', 'DOCUMENTO_SUBIR', 'DOCUMENTO_VER', 'DOCUMENTO_ELIMINAR', 'VENTA_REENVIAR', 'RENOVACION_INICIAR'];

const MOTIVO_ASIGNACION: Record<string, string> = {
  CREACION: 'Registrada como prospecto', CARGA: 'Llegó por una base', TOMA: 'Tomada del repositorio', REASIGNACION: 'Reasignada',
  LIBERACION: 'Liberada al repositorio', DEVUELTA: 'Liberada por plazo vencido', SIN_RESPUESTA: 'Liberada: 5 días sin respuesta', RECHAZO: 'Liberada: no interesada',
};
const ETAPA: Record<string, string> = { NEGOCIACION: 'Negociación', CIERRE: 'Cierre', GANADA: 'Ganada', PERDIDA: 'Perdida', PROSPECCION: 'Prospección' };
const RESULTADO: Record<string, string> = {
  INTERESADO: 'Interesado', RECHAZA: 'No interesado', NO_CONTESTA: 'No contestó', VOLVER_A_LLAMAR: 'Volver a llamar', OTRO: 'Otro',
};
const POSVENTA: Record<string, string> = { CHIPS_ENTREGADOS: 'Chips entregados', PORTABILIDAD_EJECUTADA: 'Portabilidad ejecutada', SERVICIO_ACTIVO: 'Servicio activo' };
const TIPO_NEG: Record<string, string> = { NUEVA: 'Venta nueva', RENOVACION: 'Renovación' };
const CANAL: Record<string, string> = { LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp', CORREO: 'Correo', VISITA: 'Visita', REUNION: 'Reunión' };
const bonito = (t: string | null | undefined, m: Record<string, string>) => (t ? m[t] ?? t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ') : '');

export interface Evento {
  fecha: string; tipo: 'ASIGNACION' | 'GESTION' | 'NEGOCIACION' | 'ETAPA' | 'VALIDACION' | 'POSVENTA' | 'FICHA' | 'ACCION';
  titulo: string; detalle: string | null; usuario: string | null; rol: string | null; accion?: string;
}

/**
 * Trazabilidad para administración y gerencia: qué pasó, quién lo hizo y cuándo.
 * Todo sale de datos que ya se guardan (bitácora, asignaciones, gestiones, negociaciones), sin registrar nada nuevo.
 */
@Injectable()
export class TrazabilidadService {
  constructor(private readonly db: DataSource) {}

  // ───────────── Resumen con diagramas ─────────────
  async resumen(dias: number) {
    const desde = `now() - make_interval(days => $1::int)`;
    const p = [dias];
    const categoriaSql = Object.entries(CATEGORIAS)
      .map(([c, acciones]) => `WHEN b.accion IN (${acciones.map((a) => `'${a}'`).join(',')}) THEN '${c}'`).join(' ');

    const [kpis] = await this.db.query(
      `SELECT count(*)::int AS acciones,
              count(DISTINCT b.usuario_id)::int AS "usuariosActivos",
              count(*) FILTER (WHERE b.accion = 'LOGIN')::int AS ingresos,
              count(*) FILTER (WHERE b.accion = ANY($2))::int AS fallidos,
              count(*) FILTER (WHERE b.accion = 'EXPORTAR')::int AS exportaciones,
              count(*) FILTER (WHERE b.accion = ANY($3))::int AS alertas
       FROM bitacora b WHERE b.created_at >= ${desde}`, [dias, FALLIDOS, ALERTAS],
    );
    const porDia = await this.db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS dia,
              (SELECT count(*)::int FROM bitacora b WHERE (b.created_at AT TIME ZONE 'America/Lima')::date = d) AS total,
              (SELECT count(DISTINCT b.usuario_id)::int FROM bitacora b WHERE (b.created_at AT TIME ZONE 'America/Lima')::date = d) AS usuarios
       FROM generate_series((now() AT TIME ZONE 'America/Lima')::date - ($1::int - 1), (now() AT TIME ZONE 'America/Lima')::date, interval '1 day') AS d
       ORDER BY d`, p,
    );
    // Lunes = 1 … domingo = 7, horas de Lima
    const calor = await this.db.query(
      `SELECT extract(isodow FROM b.created_at AT TIME ZONE 'America/Lima')::int AS dia,
              extract(hour FROM b.created_at AT TIME ZONE 'America/Lima')::int AS hora, count(*)::int AS n
       FROM bitacora b WHERE b.created_at >= ${desde} AND b.usuario_id IS NOT NULL GROUP BY 1, 2`, p,
    );
    const porCategoria = await this.db.query(
      `SELECT CASE ${categoriaSql} ELSE 'otras' END AS categoria, count(*)::int AS n
       FROM bitacora b WHERE b.created_at >= ${desde} GROUP BY 1 ORDER BY 2 DESC`, p,
    );
    const porUsuario = await this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS usuario, r.nombre AS rol, count(*)::int AS n,
              max(b.created_at) AS ultima
       FROM bitacora b JOIN usuarios u ON u.id = b.usuario_id JOIN roles r ON r.id = u.rol_id
       WHERE b.created_at >= ${desde} GROUP BY u.id, r.nombre ORDER BY n DESC LIMIT 12`, p,
    );
    const porRol = await this.db.query(
      `SELECT r.nombre AS rol, count(*)::int AS n, count(DISTINCT b.usuario_id)::int AS usuarios
       FROM bitacora b JOIN usuarios u ON u.id = b.usuario_id JOIN roles r ON r.id = u.rol_id
       WHERE b.created_at >= ${desde} GROUP BY r.nombre ORDER BY n DESC`, p,
    );

    // Recorrido de las empresas en el periodo: de dónde llegan, qué se hizo con ellas y cómo terminan
    const [flujo] = await this.db.query(
      `SELECT
         (SELECT count(*)::int FROM clientes c WHERE c.created_at >= ${desde} AND c.origen = 'BASE') AS "porBase",
         (SELECT count(*)::int FROM clientes c WHERE c.created_at >= ${desde} AND c.origen <> 'BASE') AS "porProspecto",
         (SELECT count(*)::int FROM asignaciones a WHERE a.created_at >= ${desde} AND a.motivo = 'TOMA') AS tomadas,
         (SELECT count(*)::int FROM asignaciones a WHERE a.created_at >= ${desde} AND a.motivo IN ('REASIGNACION', 'CARGA') AND a.asesor_nuevo IS NOT NULL) AS asignadas,
         (SELECT count(DISTINCT g.cliente_id)::int FROM gestiones g WHERE g.created_at >= ${desde}) AS gestionadas,
         (SELECT count(*)::int FROM gestiones g WHERE g.created_at >= ${desde}) AS gestiones,
         (SELECT count(*)::int FROM oportunidades o WHERE o.created_at >= ${desde}) AS negociaciones,
         (SELECT count(*)::int FROM oportunidades o WHERE o.resultado = 'GANADA' AND o.fecha_cierre >= ${desde}) AS ganadas,
         (SELECT count(*)::int FROM oportunidades o WHERE o.resultado = 'PERDIDA' AND o.updated_at >= ${desde}) AS perdidas,
         (SELECT count(*)::int FROM asignaciones a WHERE a.created_at >= ${desde} AND a.motivo = 'DEVUELTA') AS "liberadasPlazo",
         (SELECT count(*)::int FROM asignaciones a WHERE a.created_at >= ${desde} AND a.motivo = 'SIN_RESPUESTA') AS "liberadasSinRespuesta",
         (SELECT count(*)::int FROM asignaciones a WHERE a.created_at >= ${desde} AND a.motivo = 'RECHAZO') AS "liberadasRechazo",
         (SELECT count(*)::int FROM asignaciones a WHERE a.created_at >= ${desde} AND a.motivo = 'LIBERACION') AS "liberadasManual"`, p,
    );
    // Foto de hoy: dónde están las empresas y las negociaciones abiertas
    const [hoy] = await this.db.query(
      `SELECT (SELECT count(*)::int FROM clientes WHERE asesor_id IS NULL) AS libres,
              (SELECT count(*)::int FROM clientes WHERE asesor_id IS NOT NULL) AS asignadas,
              (SELECT count(*)::int FROM clientes WHERE bloqueo_hasta > now()) AS bloqueadas`,
    );
    const embudo = await this.db.query(
      `SELECT etapa, count(*)::int AS n FROM oportunidades WHERE resultado = 'EN_CURSO' GROUP BY etapa`,
    );
    const alertas = await this.db.query(
      `SELECT b.created_at AS fecha, b.accion, b.ip, b.detalle,
              CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS usuario, r.nombre AS rol
       FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id LEFT JOIN roles r ON r.id = u.rol_id
       WHERE b.created_at >= ${desde} AND b.accion = ANY($2)
       ORDER BY b.created_at DESC LIMIT 15`, [dias, ALERTAS],
    );
    return { dias, kpis, porDia, calor, porCategoria, porUsuario, porRol, flujo, hoy, embudo, alertas };
  }

  // ───────────── Rastreo de una empresa ─────────────
  async buscarEmpresas(q: string) {
    const t = q.trim();
    if (t.length < 3) return [];
    return this.db.query(
      `SELECT c.id, c.ruc, c.razon_social AS "razonSocial",
              CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS asesor
       FROM clientes c LEFT JOIN usuarios u ON u.id = c.asesor_id
       WHERE c.ruc LIKE $1 OR c.razon_social ILIKE $2 ORDER BY c.razon_social LIMIT 10`,
      [`${t.replace(/\D/g, '') || '-'}%`, `%${t}%`],
    );
  }

  async empresa(id: string) {
    const [e] = await this.db.query(
      `SELECT c.id, c.ruc, c.razon_social AS "razonSocial", c.origen, c.created_at AS "creadaAt", c.retencion_hasta AS "retencionHasta",
              c.bloqueo_tipo AS "bloqueoTipo", c.bloqueo_hasta AS "bloqueoHasta",
              CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS asesor,
              (SELECT count(*)::int FROM gestiones g WHERE g.cliente_id = c.id) AS gestiones,
              (SELECT count(DISTINCT a.asesor_nuevo)::int FROM asignaciones a WHERE a.cliente_id = c.id AND a.asesor_nuevo IS NOT NULL) AS asesores,
              (SELECT COALESCE(sum(v.segundos), 0)::int FROM visitas_ficha v WHERE v.cliente_id = c.id) AS "segundosFicha"
       FROM clientes c LEFT JOIN usuarios u ON u.id = c.asesor_id WHERE c.id = $1`, [id],
    );
    if (!e) throw new NotFoundException('La empresa no existe');

    const persona = (alias: string) => `CASE WHEN ${alias}.id IS NULL THEN NULL ELSE ${alias}.nombres || ' ' || ${alias}.apellidos END`;
    const filas: (Evento & { _orden?: number })[] = [];

    const asignaciones = await this.db.query(
      `SELECT a.created_at AS fecha, a.motivo, ${persona('n')} AS nuevo, ${persona('an')} AS anterior, ${persona('p')} AS usuario, rp.nombre AS rol
       FROM asignaciones a LEFT JOIN usuarios n ON n.id = a.asesor_nuevo LEFT JOIN usuarios an ON an.id = a.asesor_anterior
       LEFT JOIN usuarios p ON p.id = a.asignado_por LEFT JOIN roles rp ON rp.id = p.rol_id
       WHERE a.cliente_id = $1`, [id],
    );
    for (const a of asignaciones) {
      const destino = a.nuevo ? `a cargo de ${a.nuevo}` : 'queda libre en el repositorio';
      filas.push({
        fecha: a.fecha, tipo: 'ASIGNACION', titulo: MOTIVO_ASIGNACION[a.motivo] ?? a.motivo,
        detalle: [a.anterior && a.anterior !== a.nuevo ? `Antes: ${a.anterior}` : null, destino].filter(Boolean).join(' · '),
        usuario: a.usuario ?? (['DEVUELTA', 'SIN_RESPUESTA', 'RECHAZO'].includes(a.motivo) ? 'CRM (automático)' : null), rol: a.rol ?? null,
      });
    }

    const gestiones = await this.db.query(
      `SELECT g.created_at AS fecha, g.canal, g.resultado, g.comentario, g.proxima_accion AS proxima, g.segundos_ficha AS segundos,
              ${persona('u')} AS usuario, r.nombre AS rol
       FROM gestiones g LEFT JOIN usuarios u ON u.id = g.usuario_id LEFT JOIN roles r ON r.id = u.rol_id WHERE g.cliente_id = $1`, [id],
    );
    for (const g of gestiones) {
      filas.push({
        fecha: g.fecha, tipo: 'GESTION', titulo: `${bonito(g.canal, CANAL)} · ${bonito(g.resultado, RESULTADO)}`,
        detalle: [g.comentario, g.proxima ? `Próxima acción: ${new Date(g.proxima).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' })}` : null]
          .filter(Boolean).join(' · ') || null,
        usuario: g.usuario, rol: g.rol,
      });
    }

    const negociaciones = await this.db.query(
      `SELECT o.id, o.codigo, o.created_at AS fecha, o.tipo, ${persona('u')} AS usuario, r.nombre AS rol,
              (SELECT COALESCE(sum(i.cantidad), 0)::int FROM oportunidad_items i WHERE i.oportunidad_id = o.id) AS lineas
       FROM oportunidades o LEFT JOIN usuarios u ON u.id = o.asesor_id LEFT JOIN roles r ON r.id = u.rol_id WHERE o.cliente_id = $1`, [id],
    );
    const ids = negociaciones.map((n: { id: string }) => n.id);
    for (const n of negociaciones) {
      filas.push({
        fecha: n.fecha, tipo: 'NEGOCIACION', titulo: `Abrió la negociación ${n.codigo}`,
        detalle: [n.tipo ? bonito(n.tipo, TIPO_NEG) : null, n.lineas ? `${n.lineas} líneas` : null].filter(Boolean).join(' · ') || null,
        usuario: n.usuario, rol: n.rol,
      });
    }
    if (ids.length) {
      const etapas = await this.db.query(
        `SELECT h.created_at AS fecha, h.etapa_anterior AS antes, h.etapa_nueva AS nueva, h.detalle, o.codigo, ${persona('u')} AS usuario, r.nombre AS rol
         FROM historial_etapas h JOIN oportunidades o ON o.id = h.oportunidad_id
         LEFT JOIN usuarios u ON u.id = h.usuario_id LEFT JOIN roles r ON r.id = u.rol_id WHERE h.oportunidad_id = ANY($1)`, [ids],
      );
      for (const h of etapas) {
        if (!h.antes) continue; // la creación ya se muestra arriba
        filas.push({
          fecha: h.fecha, tipo: 'ETAPA', titulo: `${h.codigo}: ${bonito(h.antes, ETAPA)} → ${bonito(h.nueva, ETAPA)}`,
          detalle: h.detalle ?? null, usuario: h.usuario, rol: h.rol,
        });
      }
      const validaciones = await this.db.query(
        `SELECT v.created_at AS fecha, v.decision, v.comentario, v.intento, o.codigo, pv.nombre AS paso, ${persona('u')} AS usuario, r.nombre AS rol
         FROM validaciones v JOIN oportunidades o ON o.id = v.oportunidad_id LEFT JOIN pasos_validacion pv ON pv.id = v.paso_id
         LEFT JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN roles r ON r.id = u.rol_id WHERE v.oportunidad_id = ANY($1)`, [ids],
      );
      for (const v of validaciones) {
        filas.push({
          fecha: v.fecha, tipo: 'VALIDACION', titulo: `${v.codigo}: ${v.paso ?? 'Validación'} · ${bonito(v.decision, {})}`,
          detalle: [v.intento > 1 ? `Intento ${v.intento}` : null, v.comentario].filter(Boolean).join(' · ') || null, usuario: v.usuario, rol: v.rol,
        });
      }
      const posventa = await this.db.query(
        `SELECT p.fecha, p.evento, p.comentario, o.codigo, ${persona('u')} AS usuario, r.nombre AS rol
         FROM posventa_eventos p JOIN oportunidades o ON o.id = p.oportunidad_id
         LEFT JOIN usuarios u ON u.id = p.usuario_id LEFT JOIN roles r ON r.id = u.rol_id WHERE p.oportunidad_id = ANY($1)`, [ids],
      );
      for (const p of posventa) {
        filas.push({ fecha: p.fecha, tipo: 'POSVENTA', titulo: `${p.codigo}: ${bonito(p.evento, POSVENTA)}`, detalle: p.comentario ?? null, usuario: p.usuario, rol: p.rol });
      }
    }

    // Acciones de la bitácora que no están en las tablas anteriores (correcciones, contactos, documentos…)
    const acciones = await this.db.query(
      `SELECT b.created_at AS fecha, b.accion, b.detalle, ${persona('u')} AS usuario, r.nombre AS rol
       FROM bitacora b LEFT JOIN usuarios u ON u.id = b.usuario_id LEFT JOIN roles r ON r.id = u.rol_id
       WHERE (b.entidad = 'EMPRESA' AND b.entidad_id = $1 AND b.accion = ANY($2))
          OR (b.entidad = 'NEGOCIACION' AND b.entidad_id = ANY($3) AND b.accion = ANY($4))`,
      [id, EXTRA_EMPRESA, ids, EXTRA_NEGOCIACION],
    );
    for (const a of acciones) {
      filas.push({ fecha: a.fecha, tipo: 'ACCION', accion: a.accion, titulo: a.accion, detalle: resumenDetalle(a.detalle), usuario: a.usuario, rol: a.rol });
    }

    // Tiempo que cada persona pasó en la ficha, agrupado por día
    const visitas = await this.db.query(
      `SELECT (v.inicio AT TIME ZONE 'America/Lima')::date AS dia, min(v.inicio) AS fecha, sum(v.segundos)::int AS segundos, count(*)::int AS veces,
              ${persona('u')} AS usuario, r.nombre AS rol
       FROM visitas_ficha v LEFT JOIN usuarios u ON u.id = v.usuario_id LEFT JOIN roles r ON r.id = u.rol_id
       WHERE v.cliente_id = $1 GROUP BY 1, u.id, r.nombre HAVING sum(v.segundos) >= 10`, [id],
    );
    for (const v of visitas) {
      const min = Math.max(1, Math.round(v.segundos / 60));
      filas.push({
        fecha: v.fecha, tipo: 'FICHA', titulo: `Revisó la ficha · ${min} min`,
        detalle: v.veces > 1 ? `${v.veces} veces ese día` : null, usuario: v.usuario, rol: v.rol,
      });
    }

    filas.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return { empresa: e, eventos: filas };
  }

  // ───────────── Rastreo de un usuario ─────────────
  async usuario(id: string, dias: number) {
    const [u] = await this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, u.email, r.nombre AS rol, u.activo, eq.nombre AS equipo,
              (SELECT max(b.created_at) FROM bitacora b WHERE b.usuario_id = u.id AND b.accion = 'LOGIN') AS "ultimoIngreso"
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos eq ON eq.id = u.equipo_id WHERE u.id = $1`, [id],
    );
    if (!u) throw new NotFoundException('El usuario no existe');
    const porDia = await this.db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS dia,
              (SELECT count(*)::int FROM bitacora b WHERE b.usuario_id = $2 AND (b.created_at AT TIME ZONE 'America/Lima')::date = d) AS total
       FROM generate_series((now() AT TIME ZONE 'America/Lima')::date - ($1::int - 1), (now() AT TIME ZONE 'America/Lima')::date, interval '1 day') AS d
       ORDER BY d`, [dias, id],
    );
    const porAccion = await this.db.query(
      `SELECT b.accion, count(*)::int AS n FROM bitacora b
       WHERE b.usuario_id = $2 AND b.created_at >= now() - make_interval(days => $1::int) GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, [dias, id],
    );
    const [trabajo] = await this.db.query(
      `SELECT (SELECT count(*)::int FROM gestiones g WHERE g.usuario_id = $2 AND g.created_at >= now() - make_interval(days => $1::int)) AS gestiones,
              (SELECT count(DISTINCT g.cliente_id)::int FROM gestiones g WHERE g.usuario_id = $2 AND g.created_at >= now() - make_interval(days => $1::int)) AS empresas,
              (SELECT count(*)::int FROM asignaciones a WHERE a.asesor_nuevo = $2 AND a.motivo = 'TOMA' AND a.created_at >= now() - make_interval(days => $1::int)) AS tomadas,
              (SELECT count(*)::int FROM asignaciones a WHERE a.asesor_anterior = $2 AND a.motivo IN ('DEVUELTA', 'SIN_RESPUESTA', 'RECHAZO', 'LIBERACION')
                 AND a.created_at >= now() - make_interval(days => $1::int)) AS liberadas,
              (SELECT COALESCE(sum(v.segundos), 0)::int FROM visitas_ficha v WHERE v.usuario_id = $2 AND v.inicio >= now() - make_interval(days => $1::int)) AS "segundosFicha",
              (SELECT count(DISTINCT (b.created_at AT TIME ZONE 'America/Lima')::date)::int FROM bitacora b
                 WHERE b.usuario_id = $2 AND b.accion = 'LOGIN' AND b.created_at >= now() - make_interval(days => $1::int)) AS "diasConIngreso"`,
      [dias, id],
    );
    const ultimas = await this.db.query(
      `SELECT b.created_at AS fecha, b.accion, b.entidad, b.entidad_id AS "entidadId", b.detalle, b.ip,
              CASE WHEN b.entidad = 'EMPRESA' THEN (SELECT c.razon_social FROM clientes c WHERE c.id::text = b.entidad_id) END AS empresa
       FROM bitacora b WHERE b.usuario_id = $1 ORDER BY b.created_at DESC LIMIT 40`, [id],
    );
    return { usuario: u, porDia, porAccion, trabajo, ultimas: ultimas.map((x: { detalle: unknown }) => ({ ...x, detalle: resumenDetalle(x.detalle) })) };
  }
}

/** Una línea legible con lo principal del detalle guardado en la bitácora */
function resumenDetalle(d: unknown): string | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  const partes: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || typeof v === 'object' || k.toLowerCase().includes('id')) continue;
    partes.push(`${k}: ${String(v).slice(0, 60)}`);
    if (partes.length === 3) break;
  }
  return partes.join(' · ') || null;
}
