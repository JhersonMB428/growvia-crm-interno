import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { MOTIVOS_PERDIDA } from '../negociaciones/negociaciones.service';
import { mesActual } from '../tableros/tableros.service';
import { EmbudoDto } from './dto/embudo.dto';

const ZONA = `'America/Lima'`;
const DESDE = (n: number) => `(($${n} || '-01')::date)::timestamp AT TIME ZONE ${ZONA}`;
const HASTA = (n: number) => `((($${n} || '-01')::date + interval '1 month'))::timestamp AT TIME ZONE ${ZONA}`;
const TOTALES = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(i.cantidad), 0)::int AS lineas, COALESCE(sum(i.cantidad * i.cargo_fijo_unit), 0)::float8 AS cargo
    FROM oportunidad_items i WHERE i.oportunidad_id = o.id
  ) t ON true`;
const DIAS = (desde: string, hasta: string) => `extract(epoch FROM ${hasta} - ${desde}) / 86400`;
/** Ganada de verdad: no cuenta si después se anuló */
const GANADA = `o.resultado = 'GANADA' AND o.estado_venta <> 'ANULADA'`;
/** Días sin movimiento para considerar una negociación estancada */
export const DIAS_ESTANCADA = 14;
const LIBERADA = 'Empresa liberada por inactividad';

/**
 * Embudo de ventas y motivos de pérdida.
 *  - Embudo: negociaciones ABIERTAS en el periodo y hasta qué etapa llegaron.
 *  - Cierres, ciclo y motivos: negociaciones CERRADAS en el periodo.
 *  - Estancadas: abiertas hoy sin movimiento hace más de 14 días.
 * Supervisor: solo su equipo · Gerencia, back office y admin: todo (con filtros).
 */
@Injectable()
export class EmbudoService {
  constructor(private readonly db: DataSource) {}

  async reporte(f: EmbudoDto, s: SesionUsuario) {
    const desde = f.desde ?? mesActual();
    const hasta = f.hasta ?? desde;
    if (hasta < desde) throw new BadRequestException('El mes final no puede ser anterior al inicial');
    const meses = (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5)) - Number(desde.slice(5)) + 1;
    if (meses > 12) throw new BadRequestException('El periodo puede ser de 12 meses como máximo');

    // Filtros comunes: $1 desde, $2 hasta, luego equipo y asesor
    const p: unknown[] = [desde, hasta];
    const cond: string[] = [];
    const equipoId = s.rol === 'SUPERVISOR' ? s.equipoId : f.equipoId;
    if (s.rol === 'SUPERVISOR' && !s.equipoId) cond.push('false');
    if (equipoId) { p.push(equipoId); cond.push(`COALESCE(o.equipo_id, ua.equipo_id) = $${p.length}`); }
    if (f.asesorId) { p.push(f.asesorId); cond.push(`o.asesor_id = $${p.length}`); }
    const filtro = cond.length ? cond.join(' AND ') : 'true';
    const CREADA = `o.created_at >= ${DESDE(1)} AND o.created_at < ${HASTA(2)}`;
    const CERRADA = `o.resultado <> 'EN_CURSO' AND o.fecha_cierre >= ${DESDE(1)} AND o.fecha_cierre < ${HASTA(2)}`;
    const BASE = `FROM oportunidades o JOIN usuarios ua ON ua.id = o.asesor_id ${TOTALES}`;
    const motivos = MOTIVOS_PERDIDA.filter((m) => m !== 'Otro');
    const pm = p.length + 1; // posición del parámetro con la lista de motivos
    const MOTIVO = `CASE WHEN o.motivo_perdida = ANY($${pm}) THEN o.motivo_perdida
                         WHEN o.motivo_perdida = '${LIBERADA}' THEN 'Liberada por inactividad' ELSE 'Otro' END`;

    // 1. Embudo: abiertas en el periodo y la etapa más alta que alcanzaron
    const [embudo] = await this.db.query(
      `WITH c AS (
         SELECT o.resultado, o.estado_venta,
                COALESCE((SELECT max(CASE h.etapa_nueva WHEN 'CONTACTO' THEN 2 WHEN 'NEGOCIACION' THEN 3 ELSE 1 END)
                          FROM historial_etapas h WHERE h.oportunidad_id = o.id AND h.etapa_nueva <> 'CIERRE'), 1) AS nivel
         ${BASE} WHERE ${filtro} AND ${CREADA}
       )
       SELECT count(*)::int AS abiertas,
              count(*) FILTER (WHERE nivel >= 2 OR resultado = 'GANADA')::int AS contacto,
              count(*) FILTER (WHERE nivel >= 3 OR resultado = 'GANADA')::int AS negociacion,
              count(*) FILTER (WHERE resultado = 'GANADA' AND estado_venta <> 'ANULADA')::int AS ganadas,
              count(*) FILTER (WHERE estado_venta = 'ACTIVA')::int AS activas,
              count(*) FILTER (WHERE resultado = 'PERDIDA')::int AS perdidas,
              count(*) FILTER (WHERE resultado = 'EN_CURSO')::int AS "enCurso"
       FROM c`, p,
    );

    // 2. Cierres del periodo: tasa, ciclo de venta y cargo
    const [cierres] = await this.db.query(
      `SELECT count(*) FILTER (WHERE ${GANADA})::int AS ganadas,
              count(*) FILTER (WHERE o.resultado = 'PERDIDA')::int AS perdidas,
              count(*) FILTER (WHERE o.estado_venta = 'ANULADA')::int AS anuladas,
              COALESCE(round(avg(${DIAS('o.created_at', 'o.fecha_cierre')}) FILTER (WHERE ${GANADA})::numeric, 1), 0)::float8 AS "cicloGanada",
              COALESCE(round(avg(${DIAS('o.created_at', 'o.fecha_cierre')}) FILTER (WHERE o.resultado = 'PERDIDA')::numeric, 1), 0)::float8 AS "cicloPerdida",
              COALESCE(sum(t.cargo) FILTER (WHERE ${GANADA}), 0)::float8 AS "cargoGanado",
              COALESCE(sum(t.cargo) FILTER (WHERE o.resultado = 'PERDIDA'), 0)::float8 AS "cargoPerdido",
              COALESCE(sum(t.lineas) FILTER (WHERE o.resultado = 'PERDIDA'), 0)::int AS "lineasPerdidas"
       ${BASE} WHERE ${filtro} AND ${CERRADA}`, p,
    );

    // 3. Cuántos días pasa una negociación en cada etapa
    const tiempos = await this.db.query(
      `WITH ops AS (SELECT o.id ${BASE} WHERE ${filtro} AND ((${CREADA}) OR (${CERRADA}))),
            h AS (SELECT h.etapa_nueva AS etapa, h.created_at,
                         lead(h.created_at) OVER (PARTITION BY h.oportunidad_id ORDER BY h.created_at) AS siguiente
                  FROM historial_etapas h WHERE h.oportunidad_id IN (SELECT id FROM ops))
       SELECT etapa, round(avg(${DIAS('created_at', 'siguiente')})::numeric, 1)::float8 AS dias, count(*)::int AS n
       FROM h WHERE siguiente IS NOT NULL AND etapa <> 'CIERRE' GROUP BY etapa`, p,
    );

    // 4. Motivos de pérdida y en qué etapa se pierden
    const porMotivo = await this.db.query(
      `SELECT ${MOTIVO} AS motivo, count(*)::int AS n, sum(t.lineas)::int AS lineas, sum(t.cargo)::float8 AS cargo
       ${BASE} WHERE ${filtro} AND ${CERRADA} AND o.resultado = 'PERDIDA'
       GROUP BY 1 ORDER BY n DESC, cargo DESC`, [...p, motivos],
    );
    const porEtapa = await this.db.query(
      `SELECT h.etapa_anterior AS etapa, count(*)::int AS n
       ${BASE} JOIN historial_etapas h ON h.oportunidad_id = o.id AND h.etapa_nueva = 'CIERRE'
       WHERE ${filtro} AND ${CERRADA} AND o.resultado = 'PERDIDA' AND h.etapa_anterior IS NOT NULL
       GROUP BY 1`, p,
    );
    const otros = await this.db.query(
      `SELECT o.id, o.codigo, o.motivo_perdida AS motivo, o.fecha_cierre AS fecha, ua.nombres || ' ' || ua.apellidos AS asesor
       ${BASE} WHERE ${filtro} AND ${CERRADA} AND o.resultado = 'PERDIDA'
         AND NOT (o.motivo_perdida = ANY($${pm})) AND o.motivo_perdida <> '${LIBERADA}'
       ORDER BY o.fecha_cierre DESC LIMIT 10`, [...p, motivos],
    );

    // 5. Por asesor
    const asesores = await this.db.query(
      `SELECT ua.id, ua.nombres || ' ' || ua.apellidos AS asesor, eq.nombre AS equipo,
              count(*) FILTER (WHERE ${CREADA})::int AS creadas,
              count(*) FILTER (WHERE ${CERRADA} AND ${GANADA})::int AS ganadas,
              count(*) FILTER (WHERE ${CERRADA} AND o.resultado = 'PERDIDA')::int AS perdidas,
              COALESCE(round(avg(${DIAS('o.created_at', 'o.fecha_cierre')}) FILTER (WHERE ${CERRADA} AND ${GANADA})::numeric, 1), 0)::float8 AS ciclo,
              COALESCE(sum(t.cargo) FILTER (WHERE ${CERRADA} AND ${GANADA}), 0)::float8 AS "cargoGanado",
              mode() WITHIN GROUP (ORDER BY ${MOTIVO}) FILTER (WHERE ${CERRADA} AND o.resultado = 'PERDIDA') AS "motivoPrincipal"
       ${BASE} LEFT JOIN equipos eq ON eq.id = ua.equipo_id
       WHERE ${filtro} AND ((${CREADA}) OR (${CERRADA}))
       GROUP BY ua.id, ua.nombres, ua.apellidos, eq.nombre
       ORDER BY "cargoGanado" DESC, ganadas DESC, asesor`, [...p, motivos],
    );

    // 6. Estancadas: abiertas hoy, sin movimiento hace más de 14 días (no dependen del periodo)
    const pe = p.slice(2); // solo equipo y asesor
    const filtroHoy = filtro.replace(/\$(\d+)/g, (_, n) => `$${Number(n) - 2}`);
    const estancadas = await this.db.query(
      `SELECT o.id, o.codigo, o.etapa, c.razon_social AS "razonSocial", ua.nombres || ' ' || ua.apellidos AS asesor, t.cargo,
              floor(${DIAS(`GREATEST(o.updated_at, COALESCE(c.ultima_gestion_at, o.updated_at))`, 'now()')})::int AS dias
       ${BASE} JOIN clientes c ON c.id = o.cliente_id
       WHERE ${filtroHoy} AND o.resultado = 'EN_CURSO'
         AND GREATEST(o.updated_at, COALESCE(c.ultima_gestion_at, o.updated_at)) < now() - interval '${DIAS_ESTANCADA} days'
       ORDER BY dias DESC LIMIT 50`, pe,
    );

    return {
      desde, hasta, diasEstancada: DIAS_ESTANCADA,
      embudo, cierres: { ...cierres, tasa: cierres.ganadas + cierres.perdidas ? Math.round((cierres.ganadas / (cierres.ganadas + cierres.perdidas)) * 100) : null },
      tiempos, porMotivo, porEtapa, otros, asesores, estancadas,
      filtros: await this.filtros(s),
    };
  }

  /** Equipos y asesores para los filtros de la pantalla */
  private async filtros(s: SesionUsuario) {
    const equipos = s.rol === 'SUPERVISOR' ? [] : await this.db.query(`SELECT id, nombre FROM equipos WHERE activo ORDER BY nombre`);
    const asesores = await this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, u.equipo_id AS "equipoId"
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE r.codigo = 'ASESOR' AND u.activo ${s.rol === 'SUPERVISOR' ? 'AND u.equipo_id = $1' : ''}
       ORDER BY u.nombres, u.apellidos`, s.rol === 'SUPERVISOR' ? [s.equipoId] : [],
    );
    return { equipos, asesores };
  }
}