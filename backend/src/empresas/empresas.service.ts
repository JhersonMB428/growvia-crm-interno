import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { ParametrosService } from '../sistema/parametros.service';
import { ContactoDto } from './dto/contacto.dto';
import { CrearEmpresaDto } from './dto/crear-empresa.dto';
import { ListarEmpresasDto } from './dto/listar.dto';
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
  -- Estructura completa (Ann): representante con DNI, teléfono y correo, ubicación, líneas y operador
  (c.distrito_id IS NOT NULL AND c.lineas_actuales IS NOT NULL AND c.operador_actual_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM contactos k WHERE k.cliente_id = c.id AND k.posicion = 1 AND k.dni IS NOT NULL AND k.correo IS NOT NULL)) AS "datosCompletos"`;

/**
 * ¿Esta persona puede tomar la empresa libre?
 * "No interesado" la bloquea para todos; "sin respuesta" solo para el asesor que la tenía.
 */
function conBloqueo<T extends { bloqueoTipo: string | null; ultimoAsesorId: string | null }>(fila: T, usuarioId: string) {
  const { ultimoAsesorId, ...resto } = fila;
  const bloqueadaParaMi = fila.bloqueoTipo === 'RECHAZO' || (fila.bloqueoTipo === 'SIN_RESPUESTA' && ultimoAsesorId === usuarioId);
  return { ...resto, bloqueadaParaMi };
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
    if (!/^(10|20)\d{9}$/.test(ruc)) throw new BadRequestException('El RUC debe tener 11 dígitos y empezar con 10 o 20');
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
      await this.reemplazarContactos(tx, c.id, dto.contactos);
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
      `SELECT id, nombre, celular, correo, dni, posicion FROM contactos WHERE cliente_id = $1 ORDER BY posicion`, [id],
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
      ...general, libre: !e.asesorId, contactos, historial, contratoActual, puedeEditar: e.asesorId === sesion.sub, prorrogada,
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

  // ───────────── Contactos (máximo 2) ─────────────
  async guardarContactos(id: string, contactos: ContactoDto[], sesion: SesionUsuario) {
    const [e] = await this.db.query(`SELECT asesor_id AS "asesorId" FROM clientes WHERE id = $1`, [id]);
    if (!e) throw new NotFoundException('La empresa no existe');
    const esDueno = e.asesorId === sesion.sub && sesion.permisos.includes('PROSPECTO_CREAR');
    if (!esDueno && !sesion.permisos.includes('EMPRESA_EDITAR')) {
      throw new ForbiddenException('Solo el asesor a cargo o back office pueden editar los contactos');
    }
    await this.db.transaction((tx) => this.reemplazarContactos(tx, id, contactos));
    return this.detalle(id, sesion);
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

  private async reemplazarContactos(tx: EntityManager, clienteId: string, contactos: ContactoDto[]) {
    await tx.query(`DELETE FROM contactos WHERE cliente_id = $1`, [clienteId]);
    for (const [i, c] of contactos.slice(0, 2).entries()) {
      await tx.query(
        `INSERT INTO contactos (cliente_id, nombre, celular, correo, dni, posicion) VALUES ($1, $2, $3, $4, $5, $6)`,
        // Solo el contacto 1 (representante legal) lleva DNI
        [clienteId, c.nombre.trim(), c.celular, c.correo?.trim() || null, i === 0 ? c.dni || null : null, i + 1],
      );
    }
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