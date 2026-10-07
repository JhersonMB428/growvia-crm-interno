import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { GuardarMetaDto } from './dto/metas.dto';

const ZONA = 'America/Lima';
/** Inicio y fin del mes (AAAA-MM) en hora de Lima, como expresiones SQL sobre $n */
const DESDE = (n: number) => `(($${n} || '-01')::date)::timestamp AT TIME ZONE '${ZONA}'`;
const HASTA = (n: number) => `((($${n} || '-01')::date + interval '1 month'))::timestamp AT TIME ZONE '${ZONA}'`;
/** Totales de cada oportunidad, calculados desde sus ítems */
const TOTALES = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(i.cantidad), 0)::int AS lineas,
           COALESCE(sum(i.cantidad) FILTER (WHERE i.modalidad = 'PORTABILIDAD'), 0)::int AS portas,
           COALESCE(sum(i.cantidad * i.cargo_fijo_unit), 0)::float8 AS cargo
    FROM oportunidad_items i WHERE i.oportunidad_id = o.id
  ) t ON true`;
const POR_ACTIVAR = `('EN_VALIDACION','OBSERVADA','VALIDADA','EN_POSVENTA')`;

/** "2026-10" del mes actual en Lima */
export const mesActual = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' }).slice(0, 7);

const mesAnterior = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
};

/** Días transcurridos y días del mes, para la proyección al cierre */
function avanceDelMes(mes: string) {
  const [a, m] = mes.split('-').map(Number);
  const dias = new Date(a, m, 0).getDate();
  const actual = mesActual();
  if (mes < actual) return { dias, transcurridos: dias };
  if (mes > actual) return { dias, transcurridos: 0 };
  const hoy = Number(new Date().toLocaleDateString('en-CA', { timeZone: ZONA }).slice(8, 10));
  return { dias, transcurridos: hoy };
}
const proyectar = (logrado: number, mes: string) => {
  const { dias, transcurridos } = avanceDelMes(mes);
  return transcurridos ? Math.round((logrado / transcurridos) * dias) : 0;
};

/**
 * Tableros de cada rol. Una venta cuenta para la meta cuando el servicio queda ACTIVO,
 * en el mes de su fecha de activación. La meta se mide en líneas.
 */
@Injectable()
export class TablerosService {
  constructor(private readonly db: DataSource) {}

  // ───────────── Asesor ─────────────
  async asesor(s: SesionUsuario) {
    const mes = mesActual();
    const [meta] = await this.db.query(
      `SELECT meta_lineas AS "metaLineas" FROM metas WHERE alcance = 'ASESOR' AND asesor_id = $1 AND periodo = ($2 || '-01')::date`, [s.sub, mes],
    );
    const [act] = await this.db.query(
      `SELECT count(*)::int AS ventas, COALESCE(sum(t.lineas), 0)::int AS lineas, COALESCE(sum(t.portas), 0)::int AS portas,
              COALESCE(sum(t.cargo), 0)::float8 AS cargo
       FROM oportunidades o ${TOTALES}
       WHERE o.asesor_id = $1 AND o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= ${DESDE(2)} AND o.fecha_activacion < ${HASTA(2)}`,
      [s.sub, mes],
    );
    const [ant] = await this.db.query(
      `SELECT COALESCE(sum(t.lineas), 0)::int AS lineas FROM oportunidades o ${TOTALES}
       WHERE o.asesor_id = $1 AND o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= ${DESDE(2)} AND o.fecha_activacion < ${HASTA(2)}`,
      [s.sub, mesAnterior(mes)],
    );
    const [porActivar] = await this.db.query(
      `SELECT count(*)::int AS ventas, COALESCE(sum(t.lineas), 0)::int AS lineas,
              count(*) FILTER (WHERE o.estado_venta = 'OBSERVADA')::int AS observadas
       FROM oportunidades o ${TOTALES} WHERE o.asesor_id = $1 AND o.estado_venta IN ${POR_ACTIVAR}`, [s.sub],
    );
    const embudo = await this.db.query(
      `SELECT o.etapa, count(*)::int AS cantidad, COALESCE(sum(t.cargo), 0)::float8 AS cargo
       FROM oportunidades o ${TOTALES} WHERE o.asesor_id = $1 AND o.resultado = 'EN_CURSO' GROUP BY o.etapa`, [s.sub],
    );
    const [{ prospectos }] = await this.db.query(
      `SELECT count(*)::int AS prospectos FROM clientes WHERE asesor_id = $1 AND estado = 'PROSPECTO'`, [s.sub],
    );
    const agendaHoy = await this.db.query(
      `SELECT g.id, g.cliente_id AS "clienteId", c.razon_social AS "razonSocial", g.proxima_accion AS "proximaAccion",
              g.proximo_canal AS "proximoCanal", g.comentario
       FROM gestiones g JOIN clientes c ON c.id = g.cliente_id
       WHERE g.usuario_id = $1 AND g.proxima_hecha_at IS NULL AND c.asesor_id = g.usuario_id
         AND (g.proxima_accion AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date
       ORDER BY g.proxima_accion LIMIT 6`, [s.sub],
    );
    const [{ noRealizadas }] = await this.db.query(
      `SELECT count(*)::int AS "noRealizadas" FROM gestiones g JOIN clientes c ON c.id = g.cliente_id
       WHERE g.usuario_id = $1 AND g.proxima_accion IS NOT NULL AND g.proxima_hecha_at IS NULL AND c.asesor_id = g.usuario_id
         AND g.proxima_accion < date_trunc('day', now() AT TIME ZONE '${ZONA}') AT TIME ZONE '${ZONA}'`, [s.sub],
    );
    const ultimas = await this.db.query(
      `SELECT o.id, o.codigo, c.razon_social AS "razonSocial", o.etapa, o.resultado, o.estado_venta AS "estadoVenta",
              t.lineas, t.cargo AS total
       FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id ${TOTALES}
       WHERE o.asesor_id = $1 ORDER BY o.updated_at DESC LIMIT 5`, [s.sub],
    );
    const ranking = s.equipoId ? await this.rankingEquipo(s.equipoId, mes) : [];
    const posicion = ranking.findIndex((r: { id: string }) => r.id === s.sub) + 1;

    return {
      mes, metaLineas: meta?.metaLineas ?? null, activas: act, lineasMesAnterior: ant.lineas,
      proyeccion: proyectar(act.lineas, mes), porActivar, embudo, prospectos, agendaHoy, noRealizadas, ultimas,
      posicion: posicion || null, tamanoEquipo: ranking.length,
    };
  }

  // ───────────── Supervisor: su equipo ─────────────
  async equipo(s: SesionUsuario) {
    if (!s.equipoId) return { mes: mesActual(), equipo: null, asesores: [], alertas: null };
    const mes = mesActual();
    const [equipo] = await this.db.query(
      `SELECT e.id, e.nombre,
              (SELECT meta_lineas FROM metas m WHERE m.alcance = 'EQUIPO' AND m.equipo_id = e.id AND m.periodo = ($2 || '-01')::date) AS "metaEquipo"
       FROM equipos e WHERE e.id = $1`, [s.equipoId, mes],
    );
    const asesores = await this.rankingEquipo(s.equipoId, mes);
    const [alertas] = await this.db.query(
      `SELECT
         (SELECT count(*)::int FROM usuarios u JOIN roles r ON r.id = u.rol_id
          WHERE u.equipo_id = $1 AND u.activo AND r.codigo = 'ASESOR'
            AND NOT EXISTS (SELECT 1 FROM gestiones g WHERE g.usuario_id = u.id
                            AND (g.created_at AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date)) AS "sinGestionesHoy",
         (SELECT count(*)::int FROM clientes c JOIN usuarios u ON u.id = c.asesor_id
          WHERE u.equipo_id = $1 AND c.estado = 'PROSPECTO' AND COALESCE(c.ultima_gestion_at, c.asignado_at) < now() - interval '7 days') AS "prospectosSinContacto",
         (SELECT count(*)::int FROM oportunidades o JOIN usuarios u ON u.id = o.asesor_id
          WHERE u.equipo_id = $1 AND o.resultado = 'EN_CURSO' AND o.created_at < now() - interval '15 days') AS "negociacionesAntiguas",
         (SELECT count(*)::int FROM oportunidades o JOIN pasos_validacion p ON p.id = o.paso_actual_id JOIN roles r ON r.id = p.rol_id
          WHERE o.equipo_id = $1 AND o.estado_venta = 'EN_VALIDACION' AND r.codigo = 'SUPERVISOR') AS "porAprobar"`,
      [s.equipoId],
    );
    const lineas = asesores.reduce((a: number, r: { lineas: number }) => a + r.lineas, 0);
    const sumaMetas = asesores.reduce((a: number, r: { metaLineas: number | null }) => a + (r.metaLineas ?? 0), 0);
    return {
      mes, equipo: { ...equipo, metaLineas: equipo.metaEquipo ?? (sumaMetas || null), lineas, proyeccion: proyectar(lineas, mes) },
      asesores, alertas,
    };
  }

  // ───────────── Gerencia: resumen general ─────────────
  async gerencia(mesPedido?: string) {
    const mes = mesPedido ?? mesActual();
    const rango = `o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= ${DESDE(1)} AND o.fecha_activacion < ${HASTA(1)}`;

    const [kpi] = await this.db.query(
      `SELECT count(*)::int AS ventas, COALESCE(sum(t.lineas), 0)::int AS lineas, COALESCE(sum(t.portas), 0)::int AS portas,
              COALESCE(sum(t.cargo), 0)::float8 AS cargo
       FROM oportunidades o ${TOTALES} WHERE ${rango}`, [mes],
    );
    const [ant] = await this.db.query(
      `SELECT count(*)::int AS ventas, COALESCE(sum(t.lineas), 0)::int AS lineas, COALESCE(sum(t.cargo), 0)::float8 AS cargo
       FROM oportunidades o ${TOTALES} WHERE ${rango}`, [mesAnterior(mes)],
    );
    // Calidad del proceso: ventas ganadas en el mes, cuántas fueron observadas y cuánto tardaron en cerrarse
    const [proceso] = await this.db.query(
      `SELECT count(*)::int AS ganadas,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM validaciones v WHERE v.oportunidad_id = o.id AND v.decision = 'OBSERVADA'))::int AS observadas,
              COALESCE(round(avg(extract(epoch FROM o.fecha_cierre - o.created_at) / 86400)::numeric, 1), 0)::float8 AS "diasCierre"
       FROM oportunidades o WHERE o.resultado = 'GANADA' AND o.fecha_cierre >= ${DESDE(1)} AND o.fecha_cierre < ${HASTA(1)}`, [mes],
    );
    const [{ porActivar }] = await this.db.query(
      `SELECT count(*)::int AS "porActivar" FROM oportunidades o WHERE o.estado_venta IN ${POR_ACTIVAR}`,
    );
    const equipos = await this.db.query(
      `SELECT e.id, e.nombre, us.nombres || ' ' || us.apellidos AS supervisor,
              COALESCE(sum(t.lineas), 0)::int AS lineas, count(o.id)::int AS ventas, COALESCE(sum(t.cargo), 0)::float8 AS cargo,
              COALESCE((SELECT meta_lineas FROM metas m WHERE m.alcance = 'EQUIPO' AND m.equipo_id = e.id AND m.periodo = ($1 || '-01')::date),
                       (SELECT sum(meta_lineas)::int FROM metas m JOIN usuarios u ON u.id = m.asesor_id
                        WHERE m.alcance = 'ASESOR' AND u.equipo_id = e.id AND m.periodo = ($1 || '-01')::date)) AS "metaLineas"
       FROM equipos e
       LEFT JOIN usuarios us ON us.id = e.supervisor_id
       LEFT JOIN oportunidades o ON o.equipo_id = e.id AND ${rango}
       ${TOTALES}
       GROUP BY e.id, us.nombres, us.apellidos ORDER BY lineas DESC, e.nombre`, [mes],
    );
    const distritos = await this.db.query(
      `WITH actual AS (
         SELECT c.distrito_id, count(*)::int AS ventas, sum(t.lineas)::int AS lineas, sum(t.cargo)::float8 AS cargo
         FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id ${TOTALES}
         WHERE ${rango} GROUP BY c.distrito_id
       ), previo AS (
         SELECT c.distrito_id, sum(t.lineas)::int AS lineas
         FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id ${TOTALES}
         WHERE o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= ${DESDE(2)} AND o.fecha_activacion < ${HASTA(2)}
         GROUP BY c.distrito_id
       )
       SELECT COALESCE(di.nombre, 'Sin distrito') AS distrito, pr.nombre AS provincia, a.ventas, a.lineas, a.cargo,
              COALESCE(p.lineas, 0) AS "lineasMesAnterior"
       FROM actual a LEFT JOIN previo p ON p.distrito_id IS NOT DISTINCT FROM a.distrito_id
       LEFT JOIN distritos di ON di.id = a.distrito_id LEFT JOIN provincias pr ON pr.id = di.provincia_id
       ORDER BY a.lineas DESC LIMIT 10`, [mes, mesAnterior(mes)],
    );
    const operadores = await this.db.query(
      `SELECT op.nombre, sum(i.cantidad)::int AS lineas
       FROM oportunidades o JOIN oportunidad_items i ON i.oportunidad_id = o.id JOIN operadores op ON op.id = i.operador_origen_id
       WHERE ${rango} AND i.modalidad = 'PORTABILIDAD' GROUP BY op.nombre ORDER BY lineas DESC`, [mes],
    );
    // Últimos 6 meses (para la comparación)
    const historial = await this.db.query(
      `SELECT to_char(m, 'YYYY-MM') AS mes,
              COALESCE((SELECT sum(t.lineas) FROM oportunidades o ${TOTALES}
                        WHERE o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= m::timestamp AT TIME ZONE '${ZONA}'
                          AND o.fecha_activacion < (m + interval '1 month')::timestamp AT TIME ZONE '${ZONA}'), 0)::int AS lineas,
              COALESCE((SELECT count(*) FROM oportunidades o
                        WHERE o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= m::timestamp AT TIME ZONE '${ZONA}'
                          AND o.fecha_activacion < (m + interval '1 month')::timestamp AT TIME ZONE '${ZONA}'), 0)::int AS ventas,
              COALESCE((SELECT sum(t.cargo) FROM oportunidades o ${TOTALES}
                        WHERE o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= m::timestamp AT TIME ZONE '${ZONA}'
                          AND o.fecha_activacion < (m + interval '1 month')::timestamp AT TIME ZONE '${ZONA}'), 0)::float8 AS cargo
       FROM generate_series(($1 || '-01')::date - interval '5 months', ($1 || '-01')::date, interval '1 month') AS m
       ORDER BY m`, [mes],
    );
    const metaLineas = equipos.reduce((a: number, e: { metaLineas: number | null }) => a + (e.metaLineas ?? 0), 0) || null;
    return {
      mes, kpi: { ...kpi, metaLineas, proyeccion: proyectar(kpi.lineas, mes), porActivar }, mesAnterior: ant, proceso,
      equipos, distritos, operadores, historial,
    };
  }

  // ───────────── Metas ─────────────
  async metas(mesPedido: string | undefined, s: SesionUsuario) {
    const mes = mesPedido ?? mesActual();
    const soloEquipo = s.rol === 'SUPERVISOR';
    if (soloEquipo && !s.equipoId) return { mes, editable: false, equipos: [], asesores: [] };
    const params: unknown[] = [mes];
    if (soloEquipo) params.push(s.equipoId);

    const asesores = await this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, e.id AS "equipoId", e.nombre AS equipo,
              m.meta_lineas AS "metaLineas",
              COALESCE((SELECT sum(t.lineas) FROM oportunidades o ${TOTALES}
                        WHERE o.asesor_id = u.id AND o.estado_venta = 'ACTIVA'
                          AND o.fecha_activacion >= ${DESDE(1)} AND o.fecha_activacion < ${HASTA(1)}), 0)::int AS lineas,
              COALESCE((SELECT count(*) FROM oportunidades o WHERE o.asesor_id = u.id AND o.estado_venta = 'ACTIVA'
                          AND o.fecha_activacion >= ${DESDE(1)} AND o.fecha_activacion < ${HASTA(1)}), 0)::int AS ventas
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos e ON e.id = u.equipo_id
       LEFT JOIN metas m ON m.alcance = 'ASESOR' AND m.asesor_id = u.id AND m.periodo = ($1 || '-01')::date
       WHERE r.codigo = 'ASESOR' AND u.activo ${soloEquipo ? 'AND u.equipo_id = $2' : ''}
       ORDER BY e.nombre NULLS LAST, nombre`, params,
    );
    const equipos = await this.db.query(
      `SELECT e.id, e.nombre, us.nombres || ' ' || us.apellidos AS supervisor, m.meta_lineas AS "metaLineas"
       FROM equipos e LEFT JOIN usuarios us ON us.id = e.supervisor_id
       LEFT JOIN metas m ON m.alcance = 'EQUIPO' AND m.equipo_id = e.id AND m.periodo = ($1 || '-01')::date
       ${soloEquipo ? 'WHERE e.id = $2' : ''} ORDER BY e.nombre`, params,
    );
    const conProyeccion = asesores.map((a: { lineas: number }) => ({ ...a, proyeccion: proyectar(a.lineas, mes) }));
    return {
      mes, editable: s.permisos.includes('META_DEFINIR') && mes >= mesActual(), puedeMetaEquipo: s.rol !== 'SUPERVISOR',
      equipos: equipos.map((e: { id: string }) => {
        const delEquipo = conProyeccion.filter((a: { equipoId: string }) => a.equipoId === e.id);
        const lineas = delEquipo.reduce((x: number, a: { lineas: number }) => x + a.lineas, 0);
        return { ...e, lineas, proyeccion: proyectar(lineas, mes), sumaMetasAsesores: delEquipo.reduce((x: number, a: { metaLineas: number | null }) => x + (a.metaLineas ?? 0), 0) };
      }),
      asesores: conProyeccion,
    };
  }

  async guardarMeta(dto: GuardarMetaDto, s: SesionUsuario) {
    if (dto.mes < mesActual()) throw new BadRequestException('No se pueden cambiar metas de meses pasados');
    if (dto.alcance === 'EQUIPO') {
      if (s.rol === 'SUPERVISOR') throw new ForbiddenException('La meta del equipo la define gerencia');
      const [e] = await this.db.query(`SELECT 1 FROM equipos WHERE id = $1`, [dto.id]);
      if (!e) throw new BadRequestException('El equipo no existe');
      await this.db.query(
        `INSERT INTO metas (periodo, alcance, equipo_id, meta_lineas, definida_por) VALUES (($1 || '-01')::date, 'EQUIPO', $2, $3, $4)
         ON CONFLICT (periodo, equipo_id) WHERE alcance = 'EQUIPO'
         DO UPDATE SET meta_lineas = EXCLUDED.meta_lineas, definida_por = EXCLUDED.definida_por, updated_at = now()`,
        [dto.mes, dto.id, dto.metaLineas, s.sub],
      );
    } else {
      const [a] = await this.db.query(
        `SELECT u.equipo_id AS "equipoId" FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 AND r.codigo = 'ASESOR'`, [dto.id],
      );
      if (!a) throw new BadRequestException('El asesor no existe');
      if (s.rol === 'SUPERVISOR' && a.equipoId !== s.equipoId) throw new ForbiddenException('Solo puedes definir metas de tu equipo');
      await this.db.query(
        `INSERT INTO metas (periodo, alcance, asesor_id, meta_lineas, definida_por) VALUES (($1 || '-01')::date, 'ASESOR', $2, $3, $4)
         ON CONFLICT (periodo, asesor_id) WHERE alcance = 'ASESOR'
         DO UPDATE SET meta_lineas = EXCLUDED.meta_lineas, definida_por = EXCLUDED.definida_por, updated_at = now()`,
        [dto.mes, dto.id, dto.metaLineas, s.sub],
      );
    }
    return this.metas(dto.mes, s);
  }

  // ───────────── Ayudantes ─────────────
  /** Asesores del equipo con su avance del mes, ordenados por líneas activas */
  private async rankingEquipo(equipoId: string, mes: string) {
    return this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, m.meta_lineas AS "metaLineas",
              COALESCE(a.lineas, 0)::int AS lineas, COALESCE(a.ventas, 0)::int AS ventas, COALESCE(a.cargo, 0)::float8 AS cargo,
              COALESCE(p.lineas, 0)::int AS "porActivar",
              (SELECT count(*)::int FROM oportunidades o WHERE o.asesor_id = u.id AND o.resultado = 'EN_CURSO') AS abiertas,
              (SELECT count(*)::int FROM gestiones g WHERE g.usuario_id = u.id
                 AND (g.created_at AT TIME ZONE '${ZONA}')::date = (now() AT TIME ZONE '${ZONA}')::date) AS "gestionesHoy",
              (SELECT count(*)::int FROM gestiones g JOIN clientes c ON c.id = g.cliente_id
               WHERE g.usuario_id = u.id AND g.proxima_accion IS NOT NULL AND g.proxima_hecha_at IS NULL AND c.asesor_id = u.id
                 AND g.proxima_accion < date_trunc('day', now() AT TIME ZONE '${ZONA}') AT TIME ZONE '${ZONA}') AS "noRealizadas"
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       LEFT JOIN metas m ON m.alcance = 'ASESOR' AND m.asesor_id = u.id AND m.periodo = ($2 || '-01')::date
       LEFT JOIN LATERAL (
         SELECT sum(t.lineas) AS lineas, count(*) AS ventas, sum(t.cargo) AS cargo FROM oportunidades o ${TOTALES}
         WHERE o.asesor_id = u.id AND o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= ${DESDE(2)} AND o.fecha_activacion < ${HASTA(2)}
       ) a ON true
       LEFT JOIN LATERAL (
         SELECT sum(t.lineas) AS lineas FROM oportunidades o ${TOTALES} WHERE o.asesor_id = u.id AND o.estado_venta IN ${POR_ACTIVAR}
       ) p ON true
       WHERE u.equipo_id = $1 AND u.activo AND r.codigo = 'ASESOR'
       ORDER BY lineas DESC, nombre`, [equipoId, mes],
    );
  }
}