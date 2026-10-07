import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ParametrosService } from '../sistema/parametros.service';
import { CambiarEtapaDto, CerrarNegociacionDto } from './dto/etapa.dto';
import { CrearNegociacionDto, GuardarNegociacionDto } from './dto/guardar-negociacion.dto';
import { ItemDto } from './dto/item.dto';
import { ListarNegociacionesDto } from './dto/listar.dto';

/** Motivos de pérdida que ofrece el formulario (el asesor puede escribir otro) */
export const MOTIVOS_PERDIDA = ['Precio', 'Competencia', 'No está interesado', 'Sin presupuesto', 'No contesta', 'Otro'];

/** Datos de la tarjeta/lista: totales calculados desde los ítems (nunca guardados) */
const COLUMNAS = `
  o.id, o.codigo, o.tipo, o.etapa, o.resultado, o.estado_venta AS "estadoVenta", o.motivo_perdida AS "motivoPerdida",
  o.fecha_cierre AS "fechaCierre", o.created_at AS "creadoAt", o.updated_at AS "actualizadoAt",
  o.cliente_id AS "clienteId", c.razon_social AS "razonSocial", c.ruc,
  o.asesor_id AS "asesorId", ua.nombres || ' ' || ua.apellidos AS asesor,
  COALESCE(eqv.nombre, eqa.nombre) AS equipo,
  t.lineas, t.portabilidades, t.total,
  CASE WHEN t.movil AND t.fija THEN 'AMBOS' WHEN t.fija THEN 'FIJA' WHEN t.movil THEN 'MOVIL' END AS servicio`;

const UNIONES = `
  FROM oportunidades o
  JOIN clientes c ON c.id = o.cliente_id
  JOIN usuarios ua ON ua.id = o.asesor_id
  LEFT JOIN equipos eqv ON eqv.id = o.equipo_id
  LEFT JOIN equipos eqa ON eqa.id = ua.equipo_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(i.cantidad), 0)::int AS lineas,
           COALESCE(sum(i.cantidad) FILTER (WHERE i.modalidad = 'PORTABILIDAD'), 0)::int AS portabilidades,
           COALESCE(sum(i.cantidad * i.cargo_fijo_unit), 0)::float8 AS total,
           COALESCE(bool_or(p.tipo = 'MOVIL'), false) AS movil,
           COALESCE(bool_or(p.tipo = 'FIJA'), false) AS fija
    FROM oportunidad_items i JOIN planes_servicio p ON p.id = i.plan_id
    WHERE i.oportunidad_id = o.id
  ) t ON true`;

@Injectable()
export class NegociacionesService {
  constructor(
    private readonly db: DataSource,
    private readonly notificaciones: NotificacionesService,
    private readonly parametros: ParametrosService,
  ) {}  // ───────────── Catálogos para el formulario ─────────────
  async catalogos() {
    const planes = await this.db.query(
      `SELECT id, tipo, nombre, cargo_ref::float8 AS "cargoRef" FROM planes_servicio WHERE activo ORDER BY tipo DESC, id`,
    );
    const operadores = await this.db.query(`SELECT id, nombre FROM operadores WHERE activo ORDER BY id`);
    return { planes, operadores, motivosPerdida: MOTIVOS_PERDIDA };
  }

  // ───────────── Embudo: abiertas + cerradas del mes ─────────────
  async embudo(s: SesionUsuario) {
    const { cond, params } = this.alcance(s);
    const filas = await this.db.query(
      `SELECT ${COLUMNAS} ${UNIONES}
       WHERE ${cond} AND (o.resultado = 'EN_CURSO'
         OR o.fecha_cierre >= date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima')
       ORDER BY o.updated_at DESC LIMIT 300`,
      params,
    );
    return { filas };
  }

  // ───────────── Lista paginada (también la usa la ficha de empresa) ─────────────
  async listar(f: ListarNegociacionesDto, s: SesionUsuario) {
    const { cond, params } = this.alcance(s);
    const p = [...params];
    const where = [cond];
    if (f.clienteId) { p.push(f.clienteId); where.push(`o.cliente_id = $${p.length}`); }
    if (f.resultado) { p.push(f.resultado); where.push(`o.resultado = $${p.length}`); }
    if (f.q?.trim()) {
      p.push(`%${f.q.trim().toLowerCase()}%`);
      where.push(`(lower(o.codigo) LIKE $${p.length} OR c.ruc LIKE $${p.length} OR lower(c.razon_social) LIKE $${p.length})`);
    }
    const filtro = `WHERE ${where.join(' AND ')}`;
    const [{ total }] = await this.db.query(
      `SELECT count(*)::int AS total FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id
       JOIN usuarios ua ON ua.id = o.asesor_id ${filtro}`, p,
    );
    const porPagina = f.porPagina ?? 20;
    const pagina = f.pagina ?? 1;
    const filas = await this.db.query(
      `SELECT ${COLUMNAS} ${UNIONES} ${filtro} ORDER BY o.updated_at DESC
       LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`, p,
    );
    return { total, pagina, porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)), filas };
  }

  // ───────────── Detalle ─────────────
  async detalle(id: string, s: SesionUsuario) {
    const [o] = await this.db.query(
      `SELECT ${COLUMNAS}, ua.equipo_id AS "equipoAsesorId", o.equipo_id AS "equipoVentaId",
              c.asesor_id AS "duenoEmpresaId", o.correcciones, o.fecha_validacion AS "fechaValidacion",
              o.fecha_activacion AS "fechaActivacion",
              (SELECT pv.nombre FROM pasos_validacion pv WHERE pv.id = o.paso_actual_id) AS "pasoActual"
       ${UNIONES} WHERE o.id = $1`, [id],
    );
    if (!o) throw new NotFoundException('La negociación no existe');
    if (!this.puedeVer(s, o)) throw new ForbiddenException('No tienes acceso a esta negociación');

    const items = await this.db.query(
      `SELECT i.id, i.plan_id AS "planId", p.nombre AS plan, p.tipo AS "tipoPlan", i.modalidad,
              i.operador_origen_id AS "operadorOrigenId", op.nombre AS "operadorOrigen",
              i.cantidad, i.cargo_fijo_unit::float8 AS "cargoFijoUnit", (i.cantidad * i.cargo_fijo_unit)::float8 AS subtotal
       FROM oportunidad_items i
       JOIN planes_servicio p ON p.id = i.plan_id
       LEFT JOIN operadores op ON op.id = i.operador_origen_id
       WHERE i.oportunidad_id = $1 ORDER BY p.tipo DESC, i.modalidad DESC, p.nombre`, [id],
    );
    const historial = await this.db.query(
      `SELECT h.etapa_anterior AS "etapaAnterior", h.etapa_nueva AS "etapaNueva", h.detalle, h.created_at AS fecha,
              COALESCE(u.nombres || ' ' || u.apellidos, 'Sistema') AS usuario
       FROM historial_etapas h LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.oportunidad_id = $1 ORDER BY h.created_at DESC`, [id],
    );
    // Cadena de validación y posventa (solo si se ganó)
    const validaciones = o.resultado !== 'GANADA' ? [] : await this.db.query(
      `SELECT v.decision, v.comentario, v.intento, v.created_at AS fecha, p.nombre AS paso,
              u.nombres || ' ' || u.apellidos AS usuario
       FROM validaciones v LEFT JOIN pasos_validacion p ON p.id = v.paso_id JOIN usuarios u ON u.id = v.usuario_id
       WHERE v.oportunidad_id = $1 ORDER BY v.created_at DESC`, [id],
    );
    const posventa = o.resultado !== 'GANADA' ? [] : await this.db.query(
      `SELECT e.evento, e.fecha, e.comentario, u.nombres || ' ' || u.apellidos AS usuario
       FROM posventa_eventos e JOIN usuarios u ON u.id = e.usuario_id WHERE e.oportunidad_id = $1 ORDER BY e.fecha`, [id],
    );

    const { equipoAsesorId: _a, equipoVentaId: _v, duenoEmpresaId, ...datos } = o;
    const esDueno = o.asesorId === s.sub && duenoEmpresaId === s.sub && s.permisos.includes('NEGOCIACION_GESTIONAR');
    return {
      ...datos, items, historial, validaciones, posventa,
      maxCorrecciones: await this.parametros.numero('max_correcciones_venta', 3),
      puedeEditar: esDueno && o.resultado === 'EN_CURSO',
      // Venta observada: el asesor corrige los planes y la reenvía
      puedeCorregir: esDueno && o.resultado === 'GANADA' && o.estadoVenta === 'OBSERVADA',
    };
  }

  // ───────────── Crear ─────────────
  async crear(dto: CrearNegociacionDto, s: SesionUsuario) {
    const [cliente] = await this.db.query(`SELECT asesor_id AS "asesorId" FROM clientes WHERE id = $1`, [dto.clienteId]);
    if (!cliente) throw new NotFoundException('La empresa no existe');
    if (cliente.asesorId !== s.sub) throw new ForbiddenException('Solo el asesor a cargo de la empresa puede abrir una negociación');
    await this.verificarAbierta(dto.clienteId);
    const items = await this.normalizarItems(dto.items);

    let id: string;
    try {
      id = await this.db.transaction(async (tx) => {
        const [o] = await tx.query(
          `INSERT INTO oportunidades (codigo, cliente_id, asesor_id, tipo)
           VALUES ('OP-' || to_char(now() AT TIME ZONE 'America/Lima', 'YYYY') || '-' || lpad(nextval('oportunidad_codigo_seq')::text, 6, '0'),
                   $1, $2, $3)
           RETURNING id`,
          [dto.clienteId, s.sub, dto.tipo],
        );
        await this.reemplazarItems(tx, o.id, items);
        await this.registrarEtapa(tx, o.id, null, 'PROSPECCION', 'Negociación creada', s.sub);
        await this.marcarGestion(tx, dto.clienteId);
        return o.id as string;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') await this.verificarAbierta(dto.clienteId);
      throw e;
    }
    return this.detalle(id, s);
  }

  // ───────────── Editar tipo e ítems (solo en curso) ─────────────
  async actualizar(id: string, dto: GuardarNegociacionDto, s: SesionUsuario) {
    const items = await this.normalizarItems(dto.items);
    await this.db.transaction(async (tx) => {
      const o = await this.bloquearEditable(tx, id, s, true);
      await tx.query(`UPDATE oportunidades SET tipo = $1, updated_at = now() WHERE id = $2`, [dto.tipo, id]);
      await this.reemplazarItems(tx, id, items);
      await this.marcarGestion(tx, o.clienteId);
    });
    return this.detalle(id, s);
  }

  // ───────────── Mover de etapa (prospección ↔ contacto ↔ negociación) ─────────────
  async cambiarEtapa(id: string, dto: CambiarEtapaDto, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const o = await this.bloquearEditable(tx, id, s);
      if (o.etapa === dto.etapa) throw new BadRequestException('La negociación ya está en esa etapa');
      await tx.query(`UPDATE oportunidades SET etapa = $1, updated_at = now() WHERE id = $2`, [dto.etapa, id]);
      await this.registrarEtapa(tx, id, o.etapa, dto.etapa, null, s.sub);
      await this.marcarGestion(tx, o.clienteId);
    });
    return this.detalle(id, s);
  }

  // ───────────── Cerrar: ganada (va a validación) o perdida (con motivo) ─────────────
  async cerrar(id: string, dto: CerrarNegociacionDto, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const o = await this.bloquearEditable(tx, id, s);

      if (dto.resultado === 'PERDIDA') {
        const motivo = dto.motivoPerdida!.trim();
        await tx.query(
          `UPDATE oportunidades SET etapa = 'CIERRE', resultado = 'PERDIDA', motivo_perdida = $1,
                  fecha_cierre = now(), updated_at = now() WHERE id = $2`, [motivo, id],
        );
        await this.registrarEtapa(tx, id, o.etapa, 'CIERRE', `Perdida: ${motivo}`, s.sub);
      } else {
        const [{ n }] = await tx.query(`SELECT count(*)::int AS n FROM oportunidad_items WHERE oportunidad_id = $1`, [id]);
        if (!n) throw new BadRequestException('Agrega al menos un plan antes de marcarla como ganada');
        const [u] = await tx.query(`SELECT equipo_id AS "equipoId" FROM usuarios WHERE id = $1`, [s.sub]);
        if (!u?.equipoId) throw new BadRequestException('No tienes un equipo asignado; pide a tu supervisor que te agregue antes de cerrar la venta');
        const [paso] = await tx.query(`SELECT id FROM pasos_validacion WHERE activo ORDER BY orden LIMIT 1`);
        if (!paso) throw new BadRequestException('No hay pasos de validación configurados; avisa al administrador');
        await tx.query(
          `UPDATE oportunidades SET etapa = 'CIERRE', resultado = 'GANADA', equipo_id = $1,
                  estado_venta = 'EN_VALIDACION', paso_actual_id = $2, fecha_cierre = now(), updated_at = now()
           WHERE id = $3`, [u.equipoId, paso.id, id],
        );
        await this.registrarEtapa(tx, id, o.etapa, 'CIERRE', 'Ganada · enviada a aprobación del supervisor', s.sub);

        // Aviso al supervisor del equipo: tiene una venta por aprobar
        const [v] = await tx.query(
          `SELECT e.supervisor_id AS "supervisorId", op.codigo, c.razon_social AS "razonSocial",
                  ua.nombres || ' ' || ua.apellidos AS asesor
           FROM oportunidades op JOIN equipos e ON e.id = op.equipo_id JOIN clientes c ON c.id = op.cliente_id
           JOIN usuarios ua ON ua.id = op.asesor_id WHERE op.id = $1`, [id],
        );
        if (v?.supervisorId && v.supervisorId !== s.sub) {
          await this.notificaciones.crear(v.supervisorId, {
            tipo: 'VENTA_POR_APROBAR',
            titulo: 'Venta por aprobar',
            mensaje: `${v.asesor} ganó ${v.codigo} (${v.razonSocial}). Revísala en Aprobaciones.`,
            entidad: 'NEGOCIACION',
            entidadId: id,
          }, tx);
        }
      }
      await this.marcarGestion(tx, o.clienteId);
    });
    return this.detalle(id, s);
  }

  // ───────────── Ayudantes ─────────────

  /** Asesor: las suyas · Supervisor: las de su equipo · Gerencia, back office y admin: todas */
  private alcance(s: SesionUsuario): { cond: string; params: unknown[] } {
    if (['GERENTE', 'BACKOFFICE', 'ADMIN'].includes(s.rol)) return { cond: 'true', params: [] };
    if (s.rol === 'SUPERVISOR') {
      if (!s.equipoId) return { cond: 'false', params: [] };
      // Las ganadas cuentan para el equipo donde se cerraron; las abiertas, para el equipo actual del asesor
      return { cond: '(o.equipo_id = $1 OR (o.equipo_id IS NULL AND ua.equipo_id = $1))', params: [s.equipoId] };
    }
    return { cond: 'o.asesor_id = $1', params: [s.sub] };
  }

  private puedeVer(s: SesionUsuario, o: { asesorId: string; equipoVentaId: string | null; equipoAsesorId: string | null }) {
    if (['GERENTE', 'BACKOFFICE', 'ADMIN'].includes(s.rol)) return true;
    if (s.rol === 'SUPERVISOR') return !!s.equipoId && (o.equipoVentaId ?? o.equipoAsesorId) === s.equipoId;
    return o.asesorId === s.sub;
  }

  private async verificarAbierta(clienteId: string) {
    const [abierta] = await this.db.query(
      `SELECT id, codigo FROM oportunidades WHERE cliente_id = $1 AND resultado = 'EN_CURSO'`, [clienteId],
    );
    if (abierta) {
      throw new ConflictException({
        message: `Esta empresa ya tiene una negociación abierta (${abierta.codigo}). Ciérrala antes de abrir otra.`,
        negociacionId: abierta.id,
      });
    }
  }

  /** Bloquea la fila y comprueba que se pueda editar (en curso y del asesor a cargo) */
  private async bloquearEditable(tx: EntityManager, id: string, s: SesionUsuario, permitirObservada = false) {
    const [o] = await tx.query(
      `SELECT o.etapa, o.resultado, o.estado_venta AS "estadoVenta", o.asesor_id AS "asesorId", o.cliente_id AS "clienteId",
              c.asesor_id AS "duenoEmpresaId"
       FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id WHERE o.id = $1 FOR UPDATE OF o`, [id],
    );
    if (!o) throw new NotFoundException('La negociación no existe');
    if (o.asesorId !== s.sub || o.duenoEmpresaId !== s.sub) throw new ForbiddenException('Solo el asesor a cargo puede modificar esta negociación');
    const observada = o.resultado === 'GANADA' && o.estadoVenta === 'OBSERVADA';
    if (o.resultado !== 'EN_CURSO' && !(permitirObservada && observada)) throw new BadRequestException('La negociación ya está cerrada');
    return o as { etapa: string; clienteId: string };
  }

  /** Revisa planes y operadores; en línea nueva el operador de origen se borra */
  private async normalizarItems(items: ItemDto[]) {
    const planes: { id: number }[] = await this.db.query(`SELECT id FROM planes_servicio WHERE activo`);
    const operadores: { id: number }[] = await this.db.query(`SELECT id FROM operadores WHERE activo`);
    const idsPlan = new Set(planes.map((p) => Number(p.id)));
    const idsOp = new Set(operadores.map((p) => Number(p.id)));
    return items.map((it, i) => {
      if (!idsPlan.has(it.planId)) throw new BadRequestException(`Plan ${i + 1}: el plan elegido no existe o está desactivado`);
      if (it.modalidad === 'PORTABILIDAD') {
        if (!it.operadorOrigenId || !idsOp.has(it.operadorOrigenId)) {
          throw new BadRequestException(`Plan ${i + 1}: elige de qué operador viene la portabilidad`);
        }
        return { ...it };
      }
      return { ...it, operadorOrigenId: null };
    });
  }

  private async reemplazarItems(tx: EntityManager, id: string, items: ItemDto[]) {
    await tx.query(`DELETE FROM oportunidad_items WHERE oportunidad_id = $1`, [id]);
    for (const it of items) {
      await tx.query(
        `INSERT INTO oportunidad_items (oportunidad_id, plan_id, modalidad, operador_origen_id, cantidad, cargo_fijo_unit)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, it.planId, it.modalidad, it.operadorOrigenId ?? null, it.cantidad, it.cargoFijoUnit],
      );
    }
  }

  private registrarEtapa(tx: EntityManager, id: string, antes: string | null, despues: string, detalle: string | null, usuarioId: string) {
    return tx.query(
      `INSERT INTO historial_etapas (oportunidad_id, etapa_anterior, etapa_nueva, detalle, usuario_id) VALUES ($1, $2, $3, $4, $5)`,
      [id, antes, despues, detalle, usuarioId],
    );
  }

  /** Mover la negociación cuenta como actividad: la empresa no vuelve al repositorio */
  private marcarGestion(tx: EntityManager, clienteId: string) {
    return tx.query(`UPDATE clientes SET ultima_gestion_at = now(), updated_at = now() WHERE id = $1`, [clienteId]);
  }
}