import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { FIN_CONTRATO_SQL } from '../negociaciones/negociaciones.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ParametrosService } from '../sistema/parametros.service';
import { ListarRenovacionesDto } from './dto/listar.dto';

const HOY = `(now() AT TIME ZONE 'America/Lima')::date`;
const fechaCorta = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Contratos que vencen. Dos listas:
 *  - Nuestros contratos: ventas activas con plazo; se renuevan con una negociación tipo RENOVACION.
 *  - Contratos de la competencia: prospectos cuyo contrato con su operador actual termina (momento ideal para portar).
 * Siempre según quién tiene HOY la empresa: asesor (las suyas), supervisor (su equipo), gerencia y back office (todas).
 */
@Injectable()
export class RenovacionesService {
  private readonly log = new Logger('Renovaciones');

  constructor(
    private readonly db: DataSource,
    private readonly parametros: ParametrosService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  // ───────────── Nuestros contratos ─────────────
  async contratos(f: ListarRenovacionesDto, s: SesionUsuario) {
    const { cond, params } = this.alcance(s);
    const p = [...params];
    const ventana = f.dias ?? (await this.parametros.numero('dias_primer_aviso_renovacion', 90));
    const where: string[] = [];
    if (f.filtro === 'proximas') { p.push(ventana); where.push(`estado <> 'RENOVADA' AND dias BETWEEN 0 AND $${p.length}`); }
    if (f.filtro === 'vencidas') where.push(`estado <> 'RENOVADA' AND dias < 0`);
    if (f.filtro === 'renovadas') where.push(`estado = 'RENOVADA'`);
    if (f.q?.trim()) { p.push(`%${f.q.trim().toLowerCase()}%`); where.push(`(ruc LIKE $${p.length} OR lower("razonSocial") LIKE $${p.length})`); }

    const filas = await this.db.query(
      `${this.consultaContratos(cond)}
       SELECT id, codigo, "clienteId", "razonSocial", ruc, "asesorId", asesor, equipo, "plazoMeses", "activadaAt",
              fin, dias, lineas, total, "renovacionId", "renovacionCodigo", estado
       FROM lista ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${f.filtro === 'renovadas' ? 'fecha_fin DESC' : 'fecha_fin ASC'} LIMIT 300`, p,
    );
    const [k] = await this.db.query(
      `${this.consultaContratos(cond)}
       SELECT count(*) FILTER (WHERE estado <> 'RENOVADA' AND dias BETWEEN 0 AND 30)::int AS "vencen30",
              count(*) FILTER (WHERE estado <> 'RENOVADA' AND dias BETWEEN 0 AND $${params.length + 1})::int AS "vencenVentana",
              count(*) FILTER (WHERE estado IN ('PENDIENTE', 'PERDIDA') AND dias < 0)::int AS vencidos,
              count(*) FILTER (WHERE estado = 'EN_NEGOCIACION')::int AS "enNegociacion",
              count(*) FILTER (WHERE estado = 'RENOVADA' AND dias >= -365)::int AS renovadas,
              count(*) FILTER (WHERE dias BETWEEN -365 AND -1)::int AS "vencidos12",
              count(*) FILTER (WHERE estado = 'RENOVADA' AND dias BETWEEN -365 AND -1)::int AS "renovados12"
       FROM lista`, [...params, ventana],
    );
    const tasa = k.vencidos12 ? Math.round((k.renovados12 / k.vencidos12) * 100) : null;
    return { ventana, resumen: { ...k, tasaRenovacion: tasa }, filas };
  }

  // ───────────── Contratos de la competencia (prospectos) ─────────────
  async competencia(f: ListarRenovacionesDto, s: SesionUsuario) {
    const { cond, params } = this.alcance(s);
    const p = [...params];
    const ventana = f.dias ?? (await this.parametros.numero('dias_primer_aviso_renovacion', 90));
    const where = [cond, `c.fin_contrato_actual IS NOT NULL`, `c.estado = 'PROSPECTO'`];
    if (f.filtro === 'proximas') { p.push(ventana); where.push(`c.fin_contrato_actual - ${HOY} BETWEEN 0 AND $${p.length}`); }
    if (f.filtro === 'vencidas') where.push(`c.fin_contrato_actual < ${HOY}`);
    if (f.q?.trim()) { p.push(`%${f.q.trim().toLowerCase()}%`); where.push(`(c.ruc LIKE $${p.length} OR lower(c.razon_social) LIKE $${p.length})`); }

    const filas = await this.db.query(
      `SELECT c.id, c.razon_social AS "razonSocial", c.ruc, c.asesor_id AS "asesorId",
              u.nombres || ' ' || u.apellidos AS asesor, eq.nombre AS equipo, op.nombre AS operador,
              to_char(c.fin_contrato_actual, 'YYYY-MM-DD') AS fin, (c.fin_contrato_actual - ${HOY})::int AS dias,
              (SELECT o.id FROM oportunidades o WHERE o.cliente_id = c.id AND o.resultado = 'EN_CURSO') AS "negociacionId"
       FROM clientes c
       LEFT JOIN usuarios u ON u.id = c.asesor_id
       LEFT JOIN equipos eq ON eq.id = u.equipo_id
       LEFT JOIN operadores op ON op.id = c.operador_actual_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.fin_contrato_actual ASC LIMIT 300`, p,
    );
    return { ventana, filas };
  }

  // ───────────── Avisos diarios (8:10 a. m., hora de Lima) ─────────────
  @Cron('10 8 * * *', { timeZone: 'America/Lima' })
  async enviarAvisos() {
    const primero = await this.parametros.numero('dias_primer_aviso_renovacion', 90);
    const umbrales = [...new Set([primero, 30, 7])].filter((d) => d <= primero).sort((a, b) => a - b); // ej. [7, 30, 90]
    const umbralDe = (dias: number) => umbrales.find((u) => dias <= u);
    let enviados = 0;

    // Nuestros contratos sin renovación en marcha
    const contratos: { id: string; codigo: string; razonSocial: string; asesorId: string | null; supervisorId: string | null; fin: string; dias: number }[] =
      await this.db.query(
        `${this.consultaContratos('true')}
         SELECT l.id, l.codigo, l."razonSocial", l."asesorId", e.supervisor_id AS "supervisorId", l.fin, l.dias
         FROM lista l LEFT JOIN usuarios u ON u.id = l."asesorId" LEFT JOIN equipos e ON e.id = u.equipo_id
         WHERE l.estado IN ('PENDIENTE', 'PERDIDA') AND l.dias BETWEEN 0 AND $1`, [primero],
      );
    for (const c of contratos) {
      const u = umbralDe(c.dias);
      if (!u || !c.asesorId || !(await this.marcar('VENTA', c.id, c.fin, u))) continue;
      const cuando = c.dias === 0 ? 'vence hoy' : `vence en ${c.dias} ${c.dias === 1 ? 'día' : 'días'} (${fechaCorta(c.fin)})`;
      await this.notificaciones.crear(c.asesorId, {
        tipo: 'RENOVACION_PROXIMA', titulo: 'Contrato por renovar',
        mensaje: `El contrato de ${c.razonSocial} (${c.codigo}) ${cuando}. Inicia la renovación desde la venta.`,
        entidad: 'NEGOCIACION', entidadId: c.id,
      });
      if (u <= 30 && c.supervisorId && c.supervisorId !== c.asesorId) {
        await this.notificaciones.crear(c.supervisorId, {
          tipo: 'RENOVACION_PROXIMA', titulo: 'Contrato por renovar en tu equipo',
          mensaje: `El contrato de ${c.razonSocial} (${c.codigo}) ${cuando} y aún no tiene renovación.`,
          entidad: 'NEGOCIACION', entidadId: c.id,
        });
      }
      enviados++;
    }

    // Prospectos cuyo contrato con la competencia termina
    const prospectos: { id: string; razonSocial: string; asesorId: string; operador: string | null; fin: string; dias: number }[] = await this.db.query(
      `SELECT c.id, c.razon_social AS "razonSocial", c.asesor_id AS "asesorId", op.nombre AS operador,
              to_char(c.fin_contrato_actual, 'YYYY-MM-DD') AS fin, (c.fin_contrato_actual - ${HOY})::int AS dias
       FROM clientes c LEFT JOIN operadores op ON op.id = c.operador_actual_id
       WHERE c.estado = 'PROSPECTO' AND c.asesor_id IS NOT NULL AND c.fin_contrato_actual - ${HOY} BETWEEN 0 AND $1`, [primero],
    );
    for (const c of prospectos) {
      const u = umbralDe(c.dias);
      if (!u || !(await this.marcar('PROSPECTO', c.id, c.fin, u))) continue;
      await this.notificaciones.crear(c.asesorId, {
        tipo: 'CONTRATO_COMPETENCIA', titulo: 'Buen momento para portar',
        mensaje: `El contrato de ${c.razonSocial}${c.operador ? ` con ${c.operador}` : ''} vence ${c.dias === 0 ? 'hoy' : `en ${c.dias} ${c.dias === 1 ? 'día' : 'días'}`}. Ofrécele la portabilidad.`,
        entidad: 'EMPRESA', entidadId: c.id,
      });
      enviados++;
    }
    if (enviados) this.log.log(`${enviados} aviso(s) de vencimiento de contrato`);
    return enviados;
  }

  // ───────────── Ayudantes ─────────────

  /** Contratos activos con su fecha de fin, días que faltan y en qué va su renovación */
  private consultaContratos(cond: string) {
    return `WITH lista AS (
      SELECT o.id, o.codigo, o.cliente_id AS "clienteId", c.razon_social AS "razonSocial", c.ruc,
             c.asesor_id AS "asesorId", u.nombres || ' ' || u.apellidos AS asesor, eq.nombre AS equipo,
             o.plazo_meses AS "plazoMeses", o.fecha_activacion AS "activadaAt", ${FIN_CONTRATO_SQL} AS fecha_fin,
             to_char(${FIN_CONTRATO_SQL}, 'YYYY-MM-DD') AS fin,
             (${FIN_CONTRATO_SQL} - ${HOY})::int AS dias,
             t.lineas, t.total,
             r.id AS "renovacionId", r.codigo AS "renovacionCodigo",
             CASE r.resultado WHEN 'GANADA' THEN 'RENOVADA' WHEN 'EN_CURSO' THEN 'EN_NEGOCIACION'
                              WHEN 'PERDIDA' THEN 'PERDIDA' ELSE 'PENDIENTE' END AS estado
      FROM oportunidades o
      JOIN clientes c ON c.id = o.cliente_id
      LEFT JOIN usuarios u ON u.id = c.asesor_id
      LEFT JOIN equipos eq ON eq.id = u.equipo_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(i.cantidad), 0)::int AS lineas, COALESCE(sum(i.cantidad * i.cargo_fijo_unit), 0)::float8 AS total
        FROM oportunidad_items i WHERE i.oportunidad_id = o.id
      ) t ON true
      LEFT JOIN LATERAL (
        SELECT r.id, r.codigo, r.resultado FROM oportunidades r WHERE r.renueva_id = o.id
        ORDER BY (r.resultado <> 'PERDIDA') DESC, r.created_at DESC LIMIT 1
      ) r ON true
      WHERE o.estado_venta = 'ACTIVA' AND o.plazo_meses > 0 AND ${cond}
    )`;
  }

  /** Asesor: empresas que tiene hoy · Supervisor: las de su equipo · Gerencia, back office y admin: todas */
  private alcance(s: SesionUsuario) {
    if (['GERENTE', 'BACKOFFICE', 'ADMIN'].includes(s.rol)) return { cond: 'true', params: [] as unknown[] };
    if (s.rol === 'SUPERVISOR') return s.equipoId ? { cond: 'u.equipo_id = $1', params: [s.equipoId] as unknown[] } : { cond: 'false', params: [] as unknown[] };
    return { cond: 'c.asesor_id = $1', params: [s.sub] as unknown[] };
  }

  /** Guarda que el aviso ya salió; false si ya se había enviado */
  private async marcar(tipo: 'VENTA' | 'PROSPECTO', id: string, fin: string, dias: number) {
    const r = await this.db.query(
      `INSERT INTO avisos_vencimiento (tipo, ref_id, fecha_fin, dias) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING ref_id`,
      [tipo, id, fin, dias],
    );
    return (Array.isArray(r[0]) ? r[0] : r).length > 0;
  }
}