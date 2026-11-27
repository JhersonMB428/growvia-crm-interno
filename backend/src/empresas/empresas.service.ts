import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { ParametrosService } from '../sistema/parametros.service';
import { ContactoDto } from './dto/contacto.dto';
import { EstadoMedioDto, NuevoMedioDto, PersonaDto } from './dto/persona.dto';
import { CrearEmpresaDto } from './dto/crear-empresa.dto';
import { ListarEmpresasDto } from './dto/listar.dto';
import { errorRuc } from './ruc';
import { RetencionService } from './retencion';

/** Columnas generales de una empresa (lo que cualquier rol puede ver en el repositorio) */
const COLUMNAS_GENERALES = `
  c.id, c.ruc, c.razon_social AS "razonSocial", c.estado, c.origen,
  c.distrito_id AS "distritoId", di.nombre AS distrito, pr.nombre AS provincia, de.nombre AS departamento,
  c.asesor_id AS "asesorId",
  CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS asesor,
  eq.nombre AS equipo,
  c.asignado_at AS "asignadoAt", c.ultima_gestion_at AS "ultimaGestionAt", c.created_at AS "creadoAt",
  c.retencion_hasta AS "retencionHasta",
  CASE WHEN c.bloqueo_hasta > now() THEN c.bloqueo_tipo END AS "bloqueoTipo",
  CASE WHEN c.bloqueo_hasta > now() THEN c.bloqueo_hasta END AS "bloqueoHasta",
  c.ultimo_asesor_id AS "ultimoAsesorId",
  c.lineas_actuales AS "lineasActuales", opx.nombre AS "operadorActual",
  c.sunat_estado AS "sunatEstado", c.sunat_condicion AS "sunatCondicion", c.sunat_consultado_at AS "sunatConsultadoAt",
  -- Estructura completa (Ann): qué le falta a la empresa (vacío = completa)
  (SELECT ARRAY_REMOVE(ARRAY[
     CASE WHEN rep.id IS NULL THEN 'representante legal' END,
     CASE WHEN rep.id IS NOT NULL AND rep.dni IS NULL THEN 'DNI del representante' END,
     CASE WHEN rep.id IS NOT NULL AND rep.celular IS NULL THEN 'teléfono' END,
     CASE WHEN rep.id IS NOT NULL AND rep.correo IS NULL THEN 'correo' END,
     CASE WHEN c.distrito_id IS NULL THEN 'ubicación' END,
     CASE WHEN c.lineas_actuales IS NULL THEN 'cantidad de líneas' END,
     CASE WHEN c.operador_actual_id IS NULL THEN 'operador' END
   ], NULL)
   FROM (SELECT NULL) x LEFT JOIN contactos rep ON rep.cliente_id = c.id AND rep.posicion = 1) AS "datosFaltantes"`;

/**
 * ¿Esta persona puede tomar la empresa libre?
 * "No interesado" la bloquea para todos; "sin respuesta" solo para el asesor que la tenía.
 */
function conBloqueo<T extends { bloqueoTipo: string | null; ultimoAsesorId: string | null }>(fila: T, usuarioId: string) {
  const { ultimoAsesorId, ...resto } = fila;
  const bloqueadaParaMi = fila.bloqueoTipo === 'RECHAZO' || (fila.bloqueoTipo === 'SIN_RESPUESTA' && ultimoAsesorId === usuarioId);
  const faltantes = (fila as { datosFaltantes?: string[] }).datosFaltantes ?? [];
  return { ...resto, bloqueadaParaMi, datosCompletos: faltantes.length === 0 };
}

const UNIONES = `
  FROM clientes c
  LEFT JOIN distritos di ON di.id = c.distrito_id
  LEFT JOIN provincias pr ON pr.id = di.provincia_id
  LEFT JOIN departamentos de ON de.id = pr.departamento_id
  LEFT JOIN usuarios u ON u.id = c.asesor_id
  LEFT JOIN equipos eq ON eq.id = u.equipo_id
  LEFT JOIN operadores opx ON opx.id = c.operador_actual_id`;

/** Compara sin tildes ni mayúsculas (sin depender de extensiones de PostgreSQL) */
const SIN_TILDES = (col: string) => `translate(lower(${col}), 'áéíóúüñàèìòù', 'aeiouunaeiou')`;
const fechaCorta = (d: Date) => new Date(d).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' });
const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

@Injectable()
export class EmpresasService {
  constructor(
    private readonly db: DataSource,
    private readonly parametros: ParametrosService,
    private readonly retencion: RetencionService,
  ) {}

  // ───────────── ¿El RUC ya existe? (para la alerta roja antes de guardar) ─────────────
  async verificarRuc(ruc: string) {
    const problema = errorRuc(ruc);
    if (problema) throw new BadRequestException(problema);
    const [fila] = await this.db.query(`SELECT ${COLUMNAS_GENERALES} ${UNIONES} WHERE c.ruc = $1`, [ruc]);
    if (!fila) return { existe: false };
    return {
      existe: true,
      empresa: { id: fila.id, razonSocial: fila.razonSocial, asesor: fila.asesor, equipo: fila.equipo, libre: !fila.asesorId },
      mensaje: fila.asesorId
        ? `Este RUC ya está registrado y lo tiene ${fila.asesor}${fila.equipo ? ` (${fila.equipo})` : ''}.`
        : 'Este RUC ya está en el repositorio y está libre: puedes tomarlo.',
    };
  }

  // ───────────── Crear prospecto (queda asignado a quien lo crea) ─────────────
  async crear(dto: CrearEmpresaDto, sesion: SesionUsuario) {
    const duplicado = await this.verificarRuc(dto.ruc);
    if (duplicado.existe) throw new ConflictException({ message: duplicado.mensaje, empresa: duplicado.empresa });

    const [distrito] = await this.db.query(`SELECT 1 FROM distritos WHERE id = $1`, [dto.distritoId]);
    if (!distrito) throw new BadRequestException('El distrito elegido no existe');

    const retencion = await this.retencion.inicial();
    const id = await this.db.transaction(async (tx) => {
      const [c] = await tx.query(
        `INSERT INTO clientes (ruc, razon_social, distrito_id, asesor_id, origen, asignado_at, ultima_gestion_at, creado_por, retencion_hasta)
         VALUES ($1, $2, $3, $4, 'PROSPECCION', now(), now(), $4, $5) RETURNING id`,
        [dto.ruc, dto.razonSocial.trim(), dto.distritoId, sesion.sub, retencion],
      );
      await this.reemplazarContactos(tx, c.id, dto.contactos, sesion.sub);
      await tx.query(
        `INSERT INTO asignaciones (cliente_id, asesor_nuevo, motivo, asignado_por) VALUES ($1, $2, 'CREACION', $2)`,
        [c.id, sesion.sub],
      );
      return c.id as string;
    });
    return this.detalle(id, sesion);
  }

  // ───────────── Mis empresas (cartera del asesor) ─────────────
  async misEmpresas(f: ListarEmpresasDto, sesion: SesionUsuario) {
    const cond = ['c.asesor_id = $1'];
    // "Por vencer": las que se liberan en las próximas 24 horas
    if (f.filtro === 'por_vencer') cond.push(`c.retencion_hasta <= now() + interval '24 hours'`);
    const lista = await this.listar(f, cond, [sesion.sub], sesion,
      // Primero las que están por vencer; las que no vencen (ventas) al final
      'c.retencion_hasta ASC NULLS LAST, c.updated_at DESC');
    const [{ porVencer }] = await this.db.query(
      `SELECT count(*)::int AS "porVencer" FROM clientes
       WHERE asesor_id = $1 AND retencion_hasta <= now() + make_interval(hours => $2)`,
      [sesion.sub, (await this.retencion.reglas()).horasAvisoLiberacion],
    );
    return { ...lista, porVencer };
  }

  // ───────────── Repositorio (todas las empresas, solo datos generales) ─────────────
  async repositorio(f: ListarEmpresasDto, sesion: SesionUsuario) {
    const cond: string[] = [];
    if (f.filtro === 'libres') cond.push('c.asesor_id IS NULL');
    if (f.filtro === 'asignadas') cond.push('c.asesor_id IS NOT NULL');
    return this.listar(f, cond, [], sesion);
  }

  // ───────────── Detalle (los contactos solo si le corresponde verlos) ─────────────
  async detalle(id: string, sesion: SesionUsuario) {
    const [e] = await this.db.query(
      `SELECT ${COLUMNAS_GENERALES}, u.equipo_id AS "equipoId" ${UNIONES} WHERE c.id = $1`, [id],
    );
    if (!e) throw new NotFoundException('La empresa no existe');

    const verComercial = this.puedeVerComercial(sesion, e.asesorId, e.equipoId);
    const { equipoId: _equipo, ...general } = conBloqueo(e, sesion.sub);
    if (!verComercial) return { ...general, libre: !e.asesorId, contactos: null, historial: null, puedeEditar: false };

    const contactos = await this.db.query(
      `SELECT k.id, k.nombre, k.celular, k.correo, k.dni, k.posicion, k.cargo, k.decisor, k.origen, k.nota, k.created_at AS "creadoAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS "creadoPor",
              (SELECT max(g.created_at) FROM gestiones g WHERE g.contacto_id = k.id) AS "ultimaGestion"
       FROM contactos k LEFT JOIN usuarios u ON u.id = k.creado_por WHERE k.cliente_id = $1 ORDER BY k.posicion`, [id],
    );
    // Teléfonos y correos de la empresa, con lo que pasó al usarlos
    const medios = await this.db.query(
      `SELECT m.id, m.tipo, m.valor, m.origen, m.estado, m.nota, m.actualizado_at AS "actualizadoAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS "actualizadoPor"
       FROM medios_contacto m LEFT JOIN usuarios u ON u.id = m.actualizado_por WHERE m.cliente_id = $1
       ORDER BY m.tipo DESC, CASE m.estado WHEN 'FUNCIONA' THEN 0 WHEN 'SIN_PROBAR' THEN 1 WHEN 'NO_CONTESTA' THEN 2 ELSE 3 END, m.created_at`, [id],
    );
    // Contrato con su operador actual (para saber cuándo ofrecer la portabilidad)
    const [contratoActual] = await this.db.query(
      `SELECT c.operador_actual_id AS "operadorId", op.nombre AS operador, to_char(c.fin_contrato_actual, 'YYYY-MM-DD') AS fin,
              c.lineas_actuales AS lineas,
              (c.fin_contrato_actual - (now() AT TIME ZONE 'America/Lima')::date)::int AS dias
       FROM clientes c LEFT JOIN operadores op ON op.id = c.operador_actual_id WHERE c.id = $1`, [id],
    );
    const [{ prorrogada }] = await this.db.query(`SELECT prorrogada FROM clientes WHERE id = $1`, [id]);
    const historial = await this.db.query(
      `SELECT a.motivo, a.created_at AS fecha,
              ua.nombres || ' ' || ua.apellidos AS "asesorAnterior",
              un.nombres || ' ' || un.apellidos AS "asesorNuevo",
              COALESCE(up.nombres || ' ' || up.apellidos, 'Sistema') AS "hechoPor"
       FROM asignaciones a
       LEFT JOIN usuarios ua ON ua.id = a.asesor_anterior
       LEFT JOIN usuarios un ON un.id = a.asesor_nuevo
       LEFT JOIN usuarios up ON up.id = a.asignado_por
       WHERE a.cliente_id = $1 ORDER BY a.created_at DESC LIMIT 20`, [id],
    );
    return {
      ...general, libre: !e.asesorId, contactos, medios, historial, contratoActual, puedeEditar: e.asesorId === sesion.sub, prorrogada,
      // Back office y admin mantienen la base de clientes actualizada
      puedeCorregirDatos: sesion.permisos.includes('EMPRESA_EDITAR'),
    };
  }

  // ───────────── Tomar una empresa libre (inmediato, gana el primero) ─────────────
  async tomar(id: string, sesion: SesionUsuario) {
    const limite = await this.parametros.numero('limite_toma_repositorio', 0);
    if (limite > 0) {
      const [{ total }] = await this.db.query(`SELECT count(*)::int AS total FROM clientes WHERE asesor_id = $1`, [sesion.sub]);
      if (total >= limite) throw new ConflictException(`Llegaste al máximo de ${limite} empresas en tu cartera`);
    }

    const [b] = await this.db.query(
      `SELECT bloqueo_tipo AS tipo, bloqueo_hasta AS hasta, ultimo_asesor_id AS "ultimo" FROM clientes WHERE id = $1 AND bloqueo_hasta > now()`, [id],
    );
    if (b?.tipo === 'RECHAZO') {
      throw new ConflictException(`Esta empresa dijo que no está interesada. Se podrá tomar desde el ${fechaCorta(b.hasta)}.`);
    }
    if (b?.tipo === 'SIN_RESPUESTA' && b.ultimo === sesion.sub) {
      throw new ConflictException(`No te contestó en varios intentos: ahora le toca a otro asesor. Podrás retomarla desde el ${fechaCorta(b.hasta)}.`);
    }

    const retencion = await this.retencion.inicial();
    const tomada = await this.db.transaction(async (tx) => {
      const filas = await tx.query(
        `UPDATE clientes SET asesor_id = $1, asignado_at = now(), ultima_gestion_at = now(), updated_at = now(),
                retencion_hasta = $3, prorrogada = false, aviso_liberacion = false, bloqueo_tipo = NULL, bloqueo_hasta = NULL
         WHERE id = $2 AND asesor_id IS NULL
           AND NOT COALESCE(bloqueo_hasta > now() AND (bloqueo_tipo = 'RECHAZO' OR ultimo_asesor_id = $1), false)
         RETURNING id`,
        [sesion.sub, id, retencion],
      );
      // TypeORM devuelve [filas, cantidad] en UPDATE … RETURNING
      const actualizadas = Array.isArray(filas[0]) ? filas[0] : filas;
      if (!actualizadas.length) return false;
      await tx.query(
        `INSERT INTO asignaciones (cliente_id, asesor_nuevo, motivo, asignado_por) VALUES ($1, $2, 'TOMA', $2)`,
        [id, sesion.sub],
      );
      return true;
    });

    if (!tomada) {
      const [existe] = await this.db.query(`SELECT 1 FROM clientes WHERE id = $1`, [id]);
      if (!existe) throw new NotFoundException('La empresa no existe');
      throw new ConflictException('Otro asesor tomó esta empresa hace un momento');
    }
    return this.detalle(id, sesion);
  }

  // ───────────── Representante legal y otro contacto (posiciones 1 y 2) ─────────────
  async guardarContactos(id: string, contactos: ContactoDto[], sesion: SesionUsuario) {
    await this.asegurarEditor(id, sesion);
    await this.db.transaction((tx) => this.reemplazarContactos(tx, id, contactos, sesion.sub));
    return this.detalle(id, sesion);
  }

  // ───────────── Más personas de la empresa (sin límite) ─────────────
  async agregarPersona(id: string, dto: PersonaDto, sesion: SesionUsuario) {
    await this.asegurarEditor(id, sesion);
    await this.db.transaction(async (tx) => {
      const iguales = await tx.query(
        `SELECT 1 FROM contactos WHERE cliente_id = $1 AND (($2::text IS NOT NULL AND dni = $2) OR ${SIN_TILDES('nombre')} = $3)`,
        [id, dto.dni || null, sinTildes(dto.nombre.trim())],
      );
      if (iguales.length) throw new ConflictException('Esa persona ya está registrada en esta empresa');
      await tx.query(
        `INSERT INTO contactos (cliente_id, nombre, cargo, celular, correo, dni, decisor, nota, origen, creado_por, posicion)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ASESORA', $9,
                 GREATEST(3, (SELECT COALESCE(max(posicion), 0) + 1 FROM contactos WHERE cliente_id = $1)))`,
        [id, dto.nombre.trim(), dto.cargo?.trim() || null, dto.celular || null, dto.correo?.trim().toLowerCase() || null,
          dto.dni || null, !!dto.decisor, dto.nota?.trim() || null, sesion.sub],
      );
      await this.registrarMedios(tx, id, [dto.celular], [dto.correo], 'ASESORA');
    });
    return this.detalle(id, sesion);
  }

  async editarPersona(id: string, contactoId: string, dto: PersonaDto, sesion: SesionUsuario) {
    await this.asegurarEditor(id, sesion);
    const [k] = await this.db.query(`SELECT posicion FROM contactos WHERE id = $1 AND cliente_id = $2`, [contactoId, id]);
    if (!k) throw new NotFoundException('La persona no existe');
    if (k.posicion === 2 && !dto.celular) throw new BadRequestException('El otro contacto necesita teléfono');
    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE contactos SET nombre = $3, cargo = $4, celular = $5, correo = $6, dni = $7, decisor = $8, nota = $9
         WHERE id = $1 AND cliente_id = $2`,
        [contactoId, id, dto.nombre.trim(), dto.cargo?.trim() || null, dto.celular || null, dto.correo?.trim().toLowerCase() || null,
          dto.dni || null, !!dto.decisor, dto.nota?.trim() || null],
      );
      await this.registrarMedios(tx, id, [dto.celular], [dto.correo], 'ASESORA');
    });
    return this.detalle(id, sesion);
  }

  /** El representante legal y el otro contacto se cambian, no se quitan; las demás personas sí */
  async quitarPersona(id: string, contactoId: string, sesion: SesionUsuario) {
    await this.asegurarEditor(id, sesion);
    const [k] = await this.db.query(`SELECT posicion FROM contactos WHERE id = $1 AND cliente_id = $2`, [contactoId, id]);
    if (!k) throw new NotFoundException('La persona no existe');
    if (k.posicion <= 2) throw new BadRequestException('El representante legal y el otro contacto no se quitan: edítalos');
    await this.db.query(`DELETE FROM contactos WHERE id = $1`, [contactoId]);
    return this.detalle(id, sesion);
  }

  // ───────────── Teléfonos y correos de la empresa ─────────────
  async agregarMedio(id: string, dto: NuevoMedioDto, sesion: SesionUsuario) {
    await this.asegurarEditor(id, sesion);
    const valor = dto.tipo === 'TELEFONO' ? dto.valor.replace(/\D/g, '').replace(/^51(?=\d{9}$)/, '') : dto.valor.trim().toLowerCase();
    if (dto.tipo === 'TELEFONO' && !/^[90]\d{8}$/.test(valor)) {
      throw new BadRequestException('El teléfono debe tener 9 dígitos: celular (9…) o fijo con código de ciudad (01…, 044…)');
    }
    if (dto.tipo === 'CORREO' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) throw new BadRequestException('El correo no es válido');
    const r = await this.db.query(
      `INSERT INTO medios_contacto (cliente_id, tipo, valor, origen, actualizado_por, actualizado_at) VALUES ($1, $2, $3, 'ASESORA', $4, now())
       ON CONFLICT (cliente_id, tipo, valor) DO NOTHING RETURNING id`, [id, dto.tipo, valor, sesion.sub],
    );
    if (!r.length) throw new ConflictException(dto.tipo === 'TELEFONO' ? 'Ese teléfono ya está en la lista' : 'Ese correo ya está en la lista');
    return this.detalle(id, sesion);
  }

  async estadoMedio(id: string, medioId: string, dto: EstadoMedioDto, sesion: SesionUsuario) {
    await this.asegurarEditor(id, sesion);
    const r = await this.db.query(
      `UPDATE medios_contacto SET estado = $3, nota = COALESCE($4, nota), actualizado_por = $5, actualizado_at = now()
       WHERE id = $1 AND cliente_id = $2 RETURNING id`, [medioId, id, dto.estado, dto.nota?.trim() || null, sesion.sub],
    );
    if (!r.length) throw new NotFoundException('Ese teléfono o correo no existe');
    return this.detalle(id, sesion);
  }

  /** Teléfonos y correos nuevos a la lista de la empresa (los repetidos se ignoran) */
  async registrarMedios(tx: EntityManager, clienteId: string, telefonos: (string | null | undefined)[], correos: (string | null | undefined)[], origen: 'SUNAT' | 'BASE' | 'ASESORA') {
    const lista = [
      ...telefonos.filter((t): t is string => !!t && /^[90]\d{8}$/.test(t)).map((v) => ({ tipo: 'TELEFONO', valor: v })),
      ...correos.filter((c): c is string => !!c && c.includes('@')).map((v) => ({ tipo: 'CORREO', valor: v.trim().toLowerCase().slice(0, 150) })),
    ];
    if (!lista.length) return;
    await tx.query(
      `INSERT INTO medios_contacto (cliente_id, tipo, valor, origen)
       SELECT $1, x.tipo, x.valor, $3 FROM jsonb_to_recordset($2::jsonb) AS x(tipo text, valor text)
       ON CONFLICT (cliente_id, tipo, valor) DO NOTHING`, [clienteId, JSON.stringify(lista), origen],
    );
  }

  /** Asesor a cargo o back office */
  private async asegurarEditor(id: string, sesion: SesionUsuario) {
    const [e] = await this.db.query(`SELECT asesor_id AS "asesorId" FROM clientes WHERE id = $1`, [id]);
    if (!e) throw new NotFoundException('La empresa no existe');
    const esDueno = e.asesorId === sesion.sub && sesion.permisos.includes('PROSPECTO_CREAR');
    if (!esDueno && !sesion.permisos.includes('EMPRESA_EDITAR')) {
      throw new ForbiddenException('Solo el asesor a cargo o back office pueden editar los contactos');
    }
  }

  // ───────────── Contrato con su operador actual (asesor a cargo o back office) ─────────────
  async guardarContratoActual(id: string, operadorId: number | null, fin: string | null, lineas: number | null, sesion: SesionUsuario) {
    const [e] = await this.db.query(`SELECT asesor_id AS "asesorId" FROM clientes WHERE id = $1`, [id]);
    if (!e) throw new NotFoundException('La empresa no existe');
    const esDueno = e.asesorId === sesion.sub && sesion.permisos.includes('PROSPECTO_CREAR');
    if (!esDueno && !sesion.permisos.includes('EMPRESA_EDITAR')) {
      throw new ForbiddenException('Solo el asesor a cargo o back office pueden editar este dato');
    }
    if (operadorId !== null) {
      const [op] = await this.db.query(`SELECT 1 FROM operadores WHERE id = $1`, [operadorId]);
      if (!op) throw new BadRequestException('El operador elegido no existe');
    }
    if (fin !== null) {
      const [{ ok }] = await this.db.query(
        `SELECT $1::date BETWEEN (now() AT TIME ZONE 'America/Lima')::date - 365 AND (now() AT TIME ZONE 'America/Lima')::date + 365 * 5 AS ok`, [fin],
      );
      if (!ok) throw new BadRequestException('La fecha de fin de contrato debe estar entre hace un año y dentro de cinco años');
    }
    await this.db.query(
      `UPDATE clientes SET operador_actual_id = $1, fin_contrato_actual = $2, lineas_actuales = $4, updated_at = now() WHERE id = $3`,
      [operadorId, fin, id, lineas],
    );
    return this.detalle(id, sesion);
  }

  // ───────────── Corregir razón social y ubicación (back office / admin) ─────────────
  async corregirDatos(id: string, razonSocial: string, distritoId: string, sesion: SesionUsuario) {
    const [d] = await this.db.query(`SELECT 1 FROM distritos WHERE id = $1`, [distritoId]);
    if (!d) throw new BadRequestException('El distrito elegido no existe');
    const filas = await this.db.query(
      `UPDATE clientes SET razon_social = $1, distrito_id = $2, updated_at = now() WHERE id = $3 RETURNING id`,
      [razonSocial.trim(), distritoId, id],
    );
    if (!(Array.isArray(filas[0]) ? filas[0] : filas).length) throw new NotFoundException('La empresa no existe');
    return this.detalle(id, sesion);
  }

  // ───────────── Asesores activos (para reasignar) ─────────────
  asesoresActivos() {
    return this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, eq.nombre AS equipo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos eq ON eq.id = u.equipo_id
       WHERE r.codigo = 'ASESOR' AND u.activo ORDER BY eq.nombre NULLS LAST, u.nombres, u.apellidos`,
    );
  }

  // ───────────── Reasignar (gerencia) ─────────────
  async reasignar(id: string, asesorId: string, sesion: SesionUsuario) {
    const [destino] = await this.db.query(
      `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 AND u.activo AND r.codigo = 'ASESOR'`,
      [asesorId],
    );
    if (!destino) throw new BadRequestException('El usuario elegido no es un asesor activo');

    await this.db.transaction(async (tx) => {
      const [actual] = await tx.query(`SELECT asesor_id AS "asesorId" FROM clientes WHERE id = $1 FOR UPDATE`, [id]);
      if (!actual) throw new NotFoundException('La empresa no existe');
      if (actual.asesorId === asesorId) throw new BadRequestException('La empresa ya está asignada a ese asesor');
      await tx.query(
        `UPDATE clientes SET asesor_id = $1, asignado_at = now(), ultima_gestion_at = now(), updated_at = now(),
                prorrogada = false, aviso_liberacion = false, bloqueo_tipo = NULL, bloqueo_hasta = NULL
         WHERE id = $2`,
        [asesorId, id],
      );
      await tx.query(
        `INSERT INTO asignaciones (cliente_id, asesor_anterior, asesor_nuevo, motivo, asignado_por)
         VALUES ($1, $2, $3, 'REASIGNACION', $4)`,
        [id, actual.asesorId, asesorId, sesion.sub],
      );
      // La negociación abierta (si hay) pasa al nuevo asesor junto con la empresa
      await tx.query(
        `UPDATE oportunidades SET asesor_id = $1, updated_at = now() WHERE cliente_id = $2 AND resultado = 'EN_CURSO'`,
        [asesorId, id],
      );
      await this.retencion.recalcular(tx, id);
    });
    return this.detalle(id, sesion);
  }

  // ───────────── Tiempo en la ficha (solo el asesor a cargo) ─────────────
  /** Se llama al abrir la ficha. Devuelve el id de la visita, o null si no es su empresa. */
  async iniciarVisita(clienteId: string, sesion: SesionUsuario) {
    const [c] = await this.db.query(`SELECT asesor_id AS "asesorId" FROM clientes WHERE id = $1`, [clienteId]);
    if (!c) throw new NotFoundException('La empresa no existe');
    if (c.asesorId !== sesion.sub) return { id: null };
    const [v] = await this.db.query(
      `INSERT INTO visitas_ficha (usuario_id, cliente_id) VALUES ($1, $2) RETURNING id`, [sesion.sub, clienteId],
    );
    return { id: v.id as string };
  }

  /**
   * Pulso cada 20 segundos mientras la ficha está visible. Suma el tiempo real desde el pulso anterior,
   * con tope de 40 s (si la pestaña quedó en segundo plano o se cortó la conexión, no se cuenta ese tiempo).
   */
  async pulsoVisita(visitaId: string, sesion: SesionUsuario) {
    await this.db.query(
      `UPDATE visitas_ficha
       SET segundos = segundos + LEAST(GREATEST(extract(epoch FROM now() - ultimo_pulso), 0), 40)::int, ultimo_pulso = now()
       WHERE id = $1 AND usuario_id = $2 AND ultimo_pulso > now() - interval '30 minutes'`,
      [visitaId, sesion.sub],
    );
    return { ok: true };
  }

  // ───────────── Ayudantes ─────────────
  /** Asesor: solo lo suyo · Supervisor: su equipo · Gerencia, back office y admin: todo */
  private puedeVerComercial(s: SesionUsuario, asesorId: string | null, equipoId: string | null) {
    if (['GERENTE', 'BACKOFFICE', 'ADMIN'].includes(s.rol)) return true;
    if (s.rol === 'SUPERVISOR') return !!equipoId && equipoId === s.equipoId;
    return asesorId === s.sub;
  }

  /** Representante (1) y otro contacto (2). Se actualizan en su lugar para no perder con quién se habló en cada gestión. */
  private async reemplazarContactos(tx: EntityManager, clienteId: string, contactos: ContactoDto[], usuarioId: string) {
    if (contactos.slice(1, 2).some((c) => !c.celular)) throw new BadRequestException('Falta el teléfono del otro contacto');
    for (const posicion of [1, 2]) {
      const c = contactos[posicion - 1];
      if (!c) { await tx.query(`DELETE FROM contactos WHERE cliente_id = $1 AND posicion = $2`, [clienteId, posicion]); continue; }
      await tx.query(
        `INSERT INTO contactos (cliente_id, nombre, celular, correo, dni, cargo, posicion, origen, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ASESORA', $8)
         ON CONFLICT (cliente_id, posicion) DO UPDATE
           SET nombre = EXCLUDED.nombre, celular = EXCLUDED.celular, correo = EXCLUDED.correo, dni = EXCLUDED.dni,
               cargo = COALESCE(EXCLUDED.cargo, contactos.cargo)`,
        // Solo el contacto 1 (representante legal) lleva DNI
        [clienteId, c.nombre.trim(), c.celular || null, c.correo?.trim() || null, posicion === 1 ? c.dni || null : null,
          c.cargo?.trim() || null, posicion, usuarioId],
      );
    }
    await this.registrarMedios(tx, clienteId, contactos.map((c) => c.celular), contactos.map((c) => c.correo), 'ASESORA');
  }

  private async listar(f: ListarEmpresasDto, cond: string[], params: unknown[], sesion: SesionUsuario, orden = 'c.updated_at DESC') {
    const p = [...params];
    const where = [...cond];
    if (f.q?.trim()) {
      // Sin tildes ni mayúsculas: "clinica" encuentra "Clínica"
      p.push(`%${sinTildes(f.q.trim())}%`);
      where.push(`(c.ruc LIKE $${p.length} OR ${SIN_TILDES('c.razon_social')} LIKE $${p.length})`);
    }
    if (f.estado) { p.push(f.estado); where.push(`c.estado = $${p.length}`); }
    if (f.distritoId) { p.push(f.distritoId); where.push(`c.distrito_id = $${p.length}`); }
    if (f.operadorId) { p.push(f.operadorId); where.push(`c.operador_actual_id = $${p.length}`); }
    if (f.lineasMin) { p.push(f.lineasMin); where.push(`c.lineas_actuales >= $${p.length}`); }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [{ total }] = await this.db.query(`SELECT count(*)::int AS total FROM clientes c ${filtro}`, p);
    const porPagina = f.porPagina ?? 20;
    const pagina = f.pagina ?? 1;
    const filas = await this.db.query(
      `SELECT ${COLUMNAS_GENERALES} ${UNIONES} ${filtro}
       ORDER BY ${orden} LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
      p,
    );
    return {
      total, pagina, porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)),
      filas: filas.map((f: Parameters<typeof conBloqueo>[0]) => conBloqueo(f, sesion.sub)),
    };
  }
}