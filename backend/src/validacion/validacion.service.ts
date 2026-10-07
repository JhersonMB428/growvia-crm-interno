import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ParametrosService } from '../sistema/parametros.service';

export type Bandeja = 'aprobar' | 'revisar' | 'validar' | 'posventa';
export type EventoPosventa = 'CHIPS_ENTREGADOS' | 'PORTABILIDAD_EJECUTADA' | 'SERVICIO_ACTIVO';

/** Lo que muestra cada tarjeta de las bandejas */
const COLUMNAS = `
  o.id, o.codigo, o.tipo, o.estado_venta AS "estadoVenta", o.correcciones, o.fecha_cierre AS "fechaCierre",
  o.fecha_validacion AS "fechaValidacion", o.orden_operador AS "ordenOperador", o.cliente_id AS "clienteId", c.razon_social AS "razonSocial", c.ruc,
  ua.nombres || ' ' || ua.apellidos AS asesor, eq.nombre AS equipo, pv.nombre AS "pasoActual",
  t.lineas, t.portabilidades, t.total,
  (SELECT v.comentario FROM validaciones v WHERE v.oportunidad_id = o.id AND v.decision = 'OBSERVADA'
   ORDER BY v.created_at DESC LIMIT 1) AS "ultimaObservacion",
  EXISTS (SELECT 1 FROM validaciones v JOIN pasos_validacion p ON p.id = v.paso_id JOIN roles r ON r.id = p.rol_id
          WHERE v.oportunidad_id = o.id AND v.intento = o.correcciones + 1 AND r.codigo = 'GERENTE') AS "revisada",
  COALESCE((SELECT array_agg(e.evento) FROM posventa_eventos e WHERE e.oportunidad_id = o.id), '{}') AS eventos`;

const UNIONES = `
  FROM oportunidades o
  JOIN clientes c ON c.id = o.cliente_id
  JOIN usuarios ua ON ua.id = o.asesor_id
  LEFT JOIN equipos eq ON eq.id = o.equipo_id
  LEFT JOIN pasos_validacion pv ON pv.id = o.paso_actual_id
  LEFT JOIN roles rp ON rp.id = pv.rol_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(i.cantidad), 0)::int AS lineas,
           COALESCE(sum(i.cantidad) FILTER (WHERE i.modalidad = 'PORTABILIDAD'), 0)::int AS portabilidades,
           COALESCE(sum(i.cantidad * i.cargo_fijo_unit), 0)::float8 AS total
    FROM oportunidad_items i WHERE i.oportunidad_id = o.id
  ) t ON true`;

interface VentaBloqueada {
  id: string; codigo: string; estadoVenta: string; correcciones: number; asesorId: string; equipoId: string;
  razonSocial: string; pasoId: number | null; pasoOrden: number | null; pasoRol: string | null; supervisorId: string | null;
}

/**
 * Cadena de validación de una venta ganada:
 *  1. Supervisor (bloqueante): aprueba u observa — solo ventas de su equipo.
 *  2. Gerencia (no bloqueante): revisa en paralelo; puede dar visto bueno, observar o detener.
 *  3. Back office (bloqueante): valida u observa. Luego registra la posventa hasta que el servicio queda activo.
 * Una venta observada vuelve al asesor; al reenviarla empieza de nuevo. Máximo N correcciones (parámetro).
 */
@Injectable()
export class ValidacionService {
  constructor(
    private readonly db: DataSource,
    private readonly notificaciones: NotificacionesService,
    private readonly parametros: ParametrosService,
  ) {}

  // ───────────── Bandejas ─────────────
  async bandeja(tipo: Bandeja, s: SesionUsuario) {
    let filtro: string;
    const params: unknown[] = [];
    if (tipo === 'aprobar') {
      if (!s.equipoId) return { filas: [] };
      params.push(s.equipoId);
      filtro = `o.estado_venta = 'EN_VALIDACION' AND rp.codigo = 'SUPERVISOR' AND o.equipo_id = $1`;
    } else if (tipo === 'revisar') {
      filtro = `o.estado_venta = 'EN_VALIDACION'`;
    } else if (tipo === 'validar') {
      filtro = `o.estado_venta = 'EN_VALIDACION' AND rp.codigo = 'BACKOFFICE'`;
    } else {
      filtro = `o.estado_venta IN ('VALIDADA','EN_POSVENTA')`;
    }
    const filas = await this.db.query(
      `SELECT ${COLUMNAS} ${UNIONES} WHERE o.resultado = 'GANADA' AND ${filtro} ORDER BY o.fecha_cierre LIMIT 200`, params,
    );
    return { filas };
  }

  /** Cuántas hay en cada bandeja (para los contadores del menú y dashboards) */
  async contadores(s: SesionUsuario) {
    const [r] = await this.db.query(
      `SELECT count(*) FILTER (WHERE o.estado_venta = 'EN_VALIDACION' AND rp.codigo = 'SUPERVISOR' AND o.equipo_id = $1)::int AS aprobar,
              count(*) FILTER (WHERE o.estado_venta = 'EN_VALIDACION')::int AS revisar,
              count(*) FILTER (WHERE o.estado_venta = 'EN_VALIDACION' AND rp.codigo = 'BACKOFFICE')::int AS validar,
              count(*) FILTER (WHERE o.estado_venta IN ('VALIDADA','EN_POSVENTA'))::int AS posventa
       FROM oportunidades o LEFT JOIN pasos_validacion pv ON pv.id = o.paso_actual_id LEFT JOIN roles rp ON rp.id = pv.rol_id
       WHERE o.resultado = 'GANADA'`, [s.equipoId],
    );
    return r;
  }

  /** Puntos que back office revisa antes de validar */
  checklist() {
    return this.db.query(
      `SELECT id, texto, solo_portabilidad AS "soloPortabilidad" FROM checklist_validacion WHERE activo ORDER BY orden`,
    );
  }

  // ───────────── Resumen de back office (indicadores del perfil de puesto) ─────────────
  async resumenBackoffice() {
    const Z = `'America/Lima'`;
    const MES = `date_trunc('month', now() AT TIME ZONE ${Z}) AT TIME ZONE ${Z}`;
    const HOY = `date_trunc('day', now() AT TIME ZONE ${Z}) AT TIME ZONE ${Z}`;
    const [k] = await this.db.query(
      `SELECT
         (SELECT count(*)::int FROM oportunidades o JOIN pasos_validacion p ON p.id = o.paso_actual_id JOIN roles r ON r.id = p.rol_id
          WHERE o.estado_venta = 'EN_VALIDACION' AND r.codigo = 'BACKOFFICE') AS "porValidar",
         (SELECT count(*)::int FROM oportunidades WHERE estado_venta IN ('VALIDADA','EN_POSVENTA')) AS "enPosventa",
         (SELECT count(*)::int FROM validaciones WHERE decision = 'VALIDADA' AND created_at >= ${HOY}) AS "validadasHoy",
         (SELECT count(*)::int FROM validaciones WHERE decision = 'VALIDADA' AND created_at >= ${MES}) AS "validadasMes",
         (SELECT count(*)::int FROM validaciones v JOIN pasos_validacion p ON p.id = v.paso_id JOIN roles r ON r.id = p.rol_id
          WHERE v.decision = 'OBSERVADA' AND r.codigo = 'BACKOFFICE' AND v.created_at >= ${MES}) AS "observadasMes",
         (SELECT count(*)::int FROM oportunidades WHERE estado_venta = 'ACTIVA' AND fecha_activacion >= ${MES}) AS "activadasMes",
         -- Horas desde que el supervisor aprobó hasta que back office validó
         (SELECT COALESCE(round(avg(extract(epoch FROM v.created_at - (
             SELECT max(a.created_at) FROM validaciones a WHERE a.oportunidad_id = v.oportunidad_id AND a.decision = 'APROBADA' AND a.created_at < v.created_at
           )) / 3600)::numeric, 1), 0)::float8
          FROM validaciones v WHERE v.decision = 'VALIDADA' AND v.created_at >= ${MES}) AS "horasProcesamiento",
         -- Días desde la validación hasta la activación
         (SELECT COALESCE(round(avg(extract(epoch FROM fecha_activacion - fecha_validacion) / 86400)::numeric, 1), 0)::float8
          FROM oportunidades WHERE estado_venta = 'ACTIVA' AND fecha_activacion >= ${MES}) AS "diasActivacion",
         -- De lo validado en los últimos 90 días, cuánto terminó activo
         (SELECT count(*) FILTER (WHERE estado_venta = 'ACTIVA')::int FROM oportunidades WHERE fecha_validacion >= now() - interval '90 days') AS "activas90",
         (SELECT count(*)::int FROM oportunidades WHERE fecha_validacion >= now() - interval '90 days') AS "validadas90"`,
    );
    const porDia = await this.db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS dia,
              (SELECT count(*)::int FROM validaciones v WHERE v.decision = 'VALIDADA'
                 AND v.created_at >= d AT TIME ZONE ${Z} AND v.created_at < (d + interval '1 day') AT TIME ZONE ${Z}) AS validadas
       FROM generate_series(((now() AT TIME ZONE ${Z})::date - 13)::timestamp, (now() AT TIME ZONE ${Z})::date::timestamp, interval '1 day') AS d
       ORDER BY d`,
    );
    // Las que más tiempo llevan esperando validación (para cuidar el SLA)
    const esperando = await this.db.query(
      `SELECT o.id, o.codigo, c.razon_social AS "razonSocial", ua.nombres || ' ' || ua.apellidos AS asesor,
              round(extract(epoch FROM now() - (SELECT max(a.created_at) FROM validaciones a
                    WHERE a.oportunidad_id = o.id AND a.decision IN ('APROBADA','REENVIADA'))) / 3600)::int AS horas
       FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id JOIN usuarios ua ON ua.id = o.asesor_id
       JOIN pasos_validacion p ON p.id = o.paso_actual_id JOIN roles r ON r.id = p.rol_id
       WHERE o.estado_venta = 'EN_VALIDACION' AND r.codigo = 'BACKOFFICE'
       ORDER BY horas DESC NULLS LAST LIMIT 5`,
    );
    return { ...k, porDia, esperando };
  }

  // ───────────── Paso 1 · Supervisor aprueba ─────────────
  async aprobar(id: string, comentario: string | undefined, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const v = await this.bloquear(tx, id);
      this.exigirPaso(v, 'SUPERVISOR');
      if (v.equipoId !== s.equipoId) throw new ForbiddenException('Solo puedes aprobar ventas de tu equipo');
      await this.registrar(tx, v, s.sub, 'APROBADA', comentario);
      const siguiente = await this.siguientePaso(tx, v.pasoOrden!);
      await this.avanzar(tx, v, siguiente, s);
      await this.avisar(tx, v.asesorId, 'VENTA_APROBADA', 'Venta aprobada por tu supervisor',
        `${v.codigo} (${v.razonSocial}) pasó a la validación de back office.`, id);
    });
    return { ok: true };
  }

  // ───────────── Paso 2 · Gerencia da visto bueno (no frena) ─────────────
  async revisar(id: string, comentario: string | undefined, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const v = await this.bloquear(tx, id);
      if (v.estadoVenta !== 'EN_VALIDACION') throw new BadRequestException('La venta ya no está en validación');
      const [paso] = await tx.query(
        `SELECT p.id FROM pasos_validacion p JOIN roles r ON r.id = p.rol_id WHERE r.codigo = 'GERENTE' AND p.activo LIMIT 1`,
      );
      await tx.query(
        `INSERT INTO validaciones (oportunidad_id, paso_id, usuario_id, decision, comentario, intento)
         VALUES ($1, $2, $3, 'REVISADA', $4, $5)`,
        [id, paso?.id ?? null, s.sub, comentario?.trim() || null, v.correcciones + 1],
      );
    });
    return { ok: true };
  }

  // ───────────── Observar: vuelve al asesor para corregir ─────────────
  async observar(id: string, comentario: string, s: SesionUsuario) {
    let anulada = false;
    await this.db.transaction(async (tx) => {
      const v = await this.bloquear(tx, id);
      if (v.estadoVenta !== 'EN_VALIDACION') throw new BadRequestException('Solo se puede observar una venta en validación');
      // Supervisor y back office solo en su paso; gerencia en cualquier momento de la validación
      if (s.rol === 'SUPERVISOR') { this.exigirPaso(v, 'SUPERVISOR'); if (v.equipoId !== s.equipoId) throw new ForbiddenException('Solo ventas de tu equipo'); }
      if (s.rol === 'BACKOFFICE') this.exigirPaso(v, 'BACKOFFICE');

      const max = await this.parametros.numero('max_correcciones_venta', 3);
      const pasoUsuario = await this.pasoDelRol(tx, s.rol);
      await this.registrar(tx, v, s.sub, 'OBSERVADA', comentario, pasoUsuario);

      if (v.correcciones >= max) {
        // Ya se corrigió el máximo de veces: se anula
        anulada = true;
        await tx.query(
          `UPDATE oportunidades SET estado_venta = 'ANULADA', paso_actual_id = NULL, updated_at = now() WHERE id = $1`, [id],
        );
        await this.registrar(tx, v, s.sub, 'ANULADA', `Superó las ${max} correcciones permitidas`, pasoUsuario);
        await this.avisar(tx, v.asesorId, 'VENTA_ANULADA', 'Venta anulada',
          `${v.codigo} (${v.razonSocial}) se anuló: volvió a tener observaciones después de ${max} correcciones.`, id);
      } else {
        await tx.query(
          `UPDATE oportunidades SET estado_venta = 'OBSERVADA', paso_actual_id = NULL, updated_at = now() WHERE id = $1`, [id],
        );
        await this.avisar(tx, v.asesorId, 'VENTA_OBSERVADA', 'Venta observada',
          `${v.codigo} (${v.razonSocial}): “${comentario.trim()}”. Corrígela y reenvíala (quedan ${max - v.correcciones}).`, id);
      }
    });
    return { ok: true, anulada };
  }

  // ───────────── Gerencia detiene la venta ─────────────
  async detener(id: string, comentario: string, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const v = await this.bloquear(tx, id);
      if (!['EN_VALIDACION', 'OBSERVADA'].includes(v.estadoVenta)) throw new BadRequestException('Solo se puede detener una venta que aún no está validada');
      await this.registrar(tx, v, s.sub, 'DETENIDA', comentario, await this.pasoDelRol(tx, s.rol));
      await tx.query(`UPDATE oportunidades SET estado_venta = 'ANULADA', paso_actual_id = NULL, updated_at = now() WHERE id = $1`, [id]);
      const msg = `${v.codigo} (${v.razonSocial}) fue detenida por gerencia: “${comentario.trim()}”.`;
      await this.avisar(tx, v.asesorId, 'VENTA_ANULADA', 'Venta detenida', msg, id);
      if (v.supervisorId) await this.avisar(tx, v.supervisorId, 'VENTA_ANULADA', 'Venta detenida en tu equipo', msg, id);
    });
    return { ok: true };
  }

  // ───────────── Paso 3 · Back office valida ─────────────
  async validar(id: string, comentario: string | undefined, marcados: number[], s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const v = await this.bloquear(tx, id);
      this.exigirPaso(v, 'BACKOFFICE');
      // Todos los puntos del checklist que aplican a esta venta deben estar marcados
      const puntos: { id: number; texto: string }[] = await tx.query(
        `SELECT cv.id, cv.texto FROM checklist_validacion cv
         WHERE cv.activo AND (NOT cv.solo_portabilidad OR EXISTS (
           SELECT 1 FROM oportunidad_items i WHERE i.oportunidad_id = $1 AND i.modalidad = 'PORTABILIDAD'))
         ORDER BY cv.orden`, [id],
      );
      const faltan = puntos.filter((p) => !marcados.includes(Number(p.id)));
      if (faltan.length) throw new BadRequestException(`Falta revisar: ${faltan.map((f) => f.texto.toLowerCase()).join('; ')}`);
      await this.registrar(tx, v, s.sub, 'VALIDADA', comentario, undefined, puntos.map((p) => Number(p.id)));
      const siguiente = await this.siguientePaso(tx, v.pasoOrden!);
      await this.avanzar(tx, v, siguiente, s);
    });
    return { ok: true };
  }

  // ───────────── Posventa (back office) ─────────────
  async posventa(id: string, evento: EventoPosventa, comentario: string | undefined, ordenOperador: string | undefined, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const v = await this.bloquear(tx, id);
      if (!['VALIDADA', 'EN_POSVENTA'].includes(v.estadoVenta)) throw new BadRequestException('La venta debe estar validada para registrar la posventa');
      if (ordenOperador?.trim()) {
        await tx.query(`UPDATE oportunidades SET orden_operador = $1 WHERE id = $2`, [ordenOperador.trim(), id]);
      }
      if (evento === 'SERVICIO_ACTIVO') {
        const [{ orden }] = await tx.query(`SELECT orden_operador AS orden FROM oportunidades WHERE id = $1`, [id]);
        if (!orden) throw new BadRequestException('Registra el N° de orden del operador antes de activar');
      }
      const [{ portas }] = await tx.query(
        `SELECT COALESCE(sum(cantidad) FILTER (WHERE modalidad = 'PORTABILIDAD'), 0)::int AS portas FROM oportunidad_items WHERE oportunidad_id = $1`, [id],
      );
      if (evento === 'PORTABILIDAD_EJECUTADA' && !portas) throw new BadRequestException('Esta venta no tiene portabilidades');
      if (evento === 'SERVICIO_ACTIVO') {
        const hechos: { evento: string }[] = await tx.query(`SELECT evento FROM posventa_eventos WHERE oportunidad_id = $1`, [id]);
        const faltan = ['CHIPS_ENTREGADOS', ...(portas ? ['PORTABILIDAD_EJECUTADA'] : [])].filter((e) => !hechos.some((h) => h.evento === e));
        if (faltan.length) throw new BadRequestException(`Antes de activar registra: ${faltan.map((f) => (f === 'CHIPS_ENTREGADOS' ? 'entrega de chips' : 'portabilidad ejecutada')).join(' y ')}`);
      }
      try {
        await tx.query(
          `INSERT INTO posventa_eventos (oportunidad_id, evento, usuario_id, comentario) VALUES ($1, $2, $3, $4)`,
          [id, evento, s.sub, comentario?.trim() || null],
        );
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new BadRequestException('Ese paso de posventa ya está registrado');
        throw e;
      }

      if (evento === 'SERVICIO_ACTIVO') {
        await tx.query(
          `UPDATE oportunidades SET estado_venta = 'ACTIVA', fecha_activacion = now(), updated_at = now() WHERE id = $1`, [id],
        );
        // La empresa pasa a ser cliente (ya no vuelve al repositorio)
        await tx.query(`UPDATE clientes SET estado = 'VENTA', updated_at = now() WHERE id = (SELECT cliente_id FROM oportunidades WHERE id = $1)`, [id]);
        const msg = `${v.codigo} (${v.razonSocial}) ya está activa y suma a la meta del mes.`;
        await this.avisar(tx, v.asesorId, 'VENTA_ACTIVA', '¡Servicio activo!', msg, id);
        if (v.supervisorId) await this.avisar(tx, v.supervisorId, 'VENTA_ACTIVA', 'Venta activa en tu equipo', msg, id);
      } else {
        await tx.query(`UPDATE oportunidades SET estado_venta = 'EN_POSVENTA', updated_at = now() WHERE id = $1`, [id]);
      }
    });
    return { ok: true };
  }

  // ───────────── Asesor reenvía una venta observada ─────────────
  async reenviar(id: string, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const v = await this.bloquear(tx, id);
      const [dueno] = await tx.query(`SELECT asesor_id AS "duenoId" FROM clientes WHERE id = (SELECT cliente_id FROM oportunidades WHERE id = $1)`, [id]);
      if (v.asesorId !== s.sub || dueno?.duenoId !== s.sub) throw new ForbiddenException('Solo el asesor a cargo puede reenviar la venta');
      if (v.estadoVenta !== 'OBSERVADA') throw new BadRequestException('Solo se puede reenviar una venta observada');
      const max = await this.parametros.numero('max_correcciones_venta', 3);
      if (v.correcciones >= max) throw new BadRequestException(`Ya se usaron las ${max} correcciones permitidas`);

      const [primero] = await tx.query(`SELECT id FROM pasos_validacion WHERE activo AND bloqueante ORDER BY orden LIMIT 1`);
      await tx.query(
        `UPDATE oportunidades SET estado_venta = 'EN_VALIDACION', paso_actual_id = $1, correcciones = correcciones + 1, updated_at = now()
         WHERE id = $2`, [primero.id, id],
      );
      await tx.query(
        `INSERT INTO validaciones (oportunidad_id, paso_id, usuario_id, decision, comentario, intento) VALUES ($1, NULL, $2, 'REENVIADA', NULL, $3)`,
        [id, s.sub, v.correcciones + 2],
      );
      if (v.supervisorId) {
        await this.avisar(tx, v.supervisorId, 'VENTA_POR_APROBAR', 'Venta corregida por aprobar',
          `${v.codigo} (${v.razonSocial}) fue corregida (corrección ${v.correcciones + 1} de ${max}). Revísala en Aprobaciones.`, id);
      }
    });
    return { ok: true };
  }

  // ───────────── Ayudantes ─────────────
  private async bloquear(tx: EntityManager, id: string): Promise<VentaBloqueada> {
    const [v] = await tx.query(
      `SELECT o.id, o.codigo, o.estado_venta AS "estadoVenta", o.correcciones, o.asesor_id AS "asesorId", o.equipo_id AS "equipoId",
              c.razon_social AS "razonSocial", o.paso_actual_id AS "pasoId", pv.orden AS "pasoOrden", r.codigo AS "pasoRol",
              eq.supervisor_id AS "supervisorId"
       FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN pasos_validacion pv ON pv.id = o.paso_actual_id LEFT JOIN roles r ON r.id = pv.rol_id
       LEFT JOIN equipos eq ON eq.id = o.equipo_id
       WHERE o.id = $1 AND o.resultado = 'GANADA' FOR UPDATE OF o`, [id],
    );
    if (!v) throw new NotFoundException('La venta no existe');
    return v;
  }

  private exigirPaso(v: VentaBloqueada, rol: string) {
    if (v.estadoVenta !== 'EN_VALIDACION' || v.pasoRol !== rol) {
      throw new BadRequestException('Esta venta no está en tu paso de la validación (puede que otro usuario ya la haya atendido)');
    }
  }

  private async pasoDelRol(tx: EntityManager, rol: string): Promise<number | null> {
    const [p] = await tx.query(
      `SELECT p.id FROM pasos_validacion p JOIN roles r ON r.id = p.rol_id WHERE r.codigo = $1 AND p.activo ORDER BY p.orden LIMIT 1`, [rol],
    );
    return p?.id ?? null;
  }

  /** Siguiente paso que frena la venta (los no bloqueantes, como gerencia, revisan en paralelo) */
  private async siguientePaso(tx: EntityManager, ordenActual: number): Promise<{ id: number; rol: string } | null> {
    const [p] = await tx.query(
      `SELECT p.id, r.codigo AS rol FROM pasos_validacion p JOIN roles r ON r.id = p.rol_id
       WHERE p.activo AND p.bloqueante AND p.orden > $1 ORDER BY p.orden LIMIT 1`, [ordenActual],
    );
    return p ?? null;
  }

  /** Pasa al siguiente paso, o la deja VALIDADA si ya no quedan */
  private async avanzar(tx: EntityManager, v: VentaBloqueada, siguiente: { id: number; rol: string } | null, s: SesionUsuario) {
    if (siguiente) {
      await tx.query(`UPDATE oportunidades SET paso_actual_id = $1, updated_at = now() WHERE id = $2`, [siguiente.id, v.id]);
      const usuarios: { id: string }[] = await tx.query(
        `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.codigo = $1 AND u.activo AND u.id <> $2`, [siguiente.rol, s.sub],
      );
      for (const u of usuarios) {
        await this.avisar(tx, u.id, 'VENTA_POR_APROBAR', 'Venta por validar', `${v.codigo} (${v.razonSocial}) espera tu validación.`, v.id);
      }
      return;
    }
    await tx.query(
      `UPDATE oportunidades SET estado_venta = 'VALIDADA', paso_actual_id = NULL, fecha_validacion = now(), updated_at = now() WHERE id = $1`, [v.id],
    );
    await this.avisar(tx, v.asesorId, 'VENTA_VALIDADA', 'Venta validada',
      `${v.codigo} (${v.razonSocial}) fue validada. Back office se encarga ahora de los chips y la activación.`, v.id);
  }

  private registrar(tx: EntityManager, v: VentaBloqueada, usuarioId: string, decision: string, comentario?: string, pasoId?: number | null, checklist?: number[]) {
    return tx.query(
      `INSERT INTO validaciones (oportunidad_id, paso_id, usuario_id, decision, comentario, intento, checklist) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [v.id, pasoId !== undefined ? pasoId : v.pasoId, usuarioId, decision, comentario?.trim() || null, v.correcciones + 1, checklist ?? null],
    );
  }

  private avisar(tx: EntityManager, usuarioId: string, tipo: Parameters<NotificacionesService['crear']>[1]['tipo'], titulo: string, mensaje: string, id: string) {
    return this.notificaciones.crear(usuarioId, { tipo, titulo, mensaje, entidad: 'NEGOCIACION', entidadId: id }, tx);
  }
}