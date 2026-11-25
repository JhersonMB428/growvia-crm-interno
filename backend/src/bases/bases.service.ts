import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { RetencionService } from '../empresas/retencion';
import { errorRuc } from '../empresas/ruc';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { SunatService } from '../sunat/sunat.service';

const MAX_FILAS = 5000;

/** Archivo recibido por el formulario (lo que entrega multer) */
export interface ArchivoSubido { originalname: string; buffer: Buffer; size: number }

/** Columnas que se reconocen en la primera fila del Excel (sin tildes ni mayúsculas) */
const COLUMNAS: Record<string, string[]> = {
  ruc: ['ruc', 'n ruc', 'nro ruc', 'numero de ruc'],
  razon: ['razon social', 'empresa', 'nombre de la empresa', 'cliente'],
  ubigeo: ['ubigeo', 'codigo ubigeo'],
  departamento: ['departamento', 'dpto', 'region'],
  provincia: ['provincia'],
  distrito: ['distrito'],
  // El contacto 1 es el representante legal (SUNAT)
  nombre1: ['representantel legal sunat', 'representante legal sunat', 'representante legal', 'representante', 'contacto 1', 'contacto', 'nombre contacto', 'contacto 1 nombre', 'nombre del contacto'],
  dni1: ['dni', 'dni representante', 'dni del representante', 'documento'],
  celular1: ['telefono', 'celular 1', 'celular', 'telefono 1', 'contacto 1 celular', 'movil'],
  correo1: ['correo', 'correo 1', 'email', 'contacto 1 correo', 'e-mail'],
  lineas: ['cantidad de lineas', 'lineas', 'n lineas', 'nro lineas', 'numero de lineas', 'cantidad lineas'],
  operador: ['operador', 'operador actual'],
  nombre2: ['contacto 2', 'contacto 2 nombre'],
  celular2: ['celular 2', 'contacto 2 celular', 'telefono 2'],
  correo2: ['correo 2', 'contacto 2 correo', 'email 2'],
};
/** Estructura pedida por Ann (nov 2026). "Contacto 2", "Celular 2" y "Correo 2" se siguen aceptando si vienen. */
const PLANTILLA = ['RUC', 'Razón social', 'Representante legal SUNAT', 'DNI', 'Teléfono', 'Correo', 'Departamento', 'Provincia', 'Distrito', 'Cantidad de líneas', 'Operador'];

/** "Lima Metropolitana " → "LIMA METROPOLITANA" sin tildes */
const normal = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

type Motivo = 'RUC_INVALIDO' | 'RUC_DUPLICADO' | 'UBIGEO_INVALIDO' | 'DATO_FALTANTE' | 'DATO_INVALIDO';
type ContactoBase = { nombre: string; celular: string | null; correo: string | null; dni: string | null };
interface FilaValida {
  fila: number; ruc: string; razon: string; distritoId: string | null; lineas: number | null; operadorId: number | null;
  contactos: ContactoBase[];
  /** Empresa que ya está en el CRM con ese RUC: la fila no crea otra, completa (o corrige) sus datos */
  clienteId: string | null;
  cambios: Cambios | null;
}
/** Qué aporta una fila a una empresa que ya existe */
interface Cambios { completa: string[]; diferencias: { campo: string; crm: string; base: string }[] }
/** Datos actuales de una empresa del CRM, para comparar con la base */
interface FotoCrm {
  id: string; ruc: string; razon: string; distritoId: string | null; lineas: number | null; operadorId: number | null; asesor: string | null;
  contactos: (ContactoBase & { posicion: number })[];
}
type Nombres = { distrito: (id: string) => string; operador: (id: number) => string };

/** Sin tildes, signos ni orden: "Pérez Rojas, Juan" = "JUAN PEREZ ROJAS" */
const mismoTexto = (a: string | null, b: string | null) => {
  // Los puntos no separan palabras ("S.A.C." = "SAC"); el resto de signos, sí
  const n = (t: string | null) => normal(t).replace(/\./g, '').replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(Boolean).sort().join(' ');
  return n(a) === n(b);
};

/**
 * Compara una fila de la base con la empresa del CRM:
 *  - completa: datos que el CRM no tiene y la base sí (se agregan siempre).
 *  - diferencias: el CRM y la base tienen valores distintos (al aprobar se elige cuál se queda).
 */
function comparar(f: Pick<FilaValida, 'razon' | 'distritoId' | 'lineas' | 'operadorId' | 'contactos'>, c: FotoCrm, n: Nombres): Cambios {
  const completa: string[] = [];
  const diferencias: Cambios['diferencias'] = [];
  const campo = <T>(nombre: string, base: T | null, crm: T | null, texto: (v: T) => string, igual = (a: T, b: T) => a === b) => {
    if (base === null || base === undefined) return;
    if (crm === null || crm === undefined) completa.push(`${nombre}: ${texto(base)}`);
    else if (!igual(base, crm)) diferencias.push({ campo: nombre, crm: texto(crm), base: texto(base) });
  };
  campo('Razón social', f.razon, c.razon, (v) => v, (a, b) => mismoTexto(a, b));
  campo('Ubicación', f.distritoId, c.distritoId, n.distrito);
  campo('Cantidad de líneas', f.lineas, c.lineas, (v) => String(v));
  campo('Operador', f.operadorId, c.operadorId, n.operador);

  const [rb, ob] = f.contactos;
  const rc = c.contactos.find((k) => k.posicion === 1);
  const oc = c.contactos.find((k) => k.posicion === 2);
  if (rb) {
    if (!rc) completa.push(`Representante legal: ${rb.nombre}`);
    else if (mismaPersona(rb, rc)) {
      campo('DNI del representante', rb.dni, rc.dni, (v) => v);
      campo('Teléfono', rb.celular, rc.celular, (v) => v);
      campo('Correo', rb.correo, rc.correo, (v) => v, (a, b) => a.toLowerCase() === b.toLowerCase());
    } else {
      diferencias.push({ campo: 'Representante legal', crm: detalleContacto(rc), base: detalleContacto(rb) });
    }
  }
  if (ob) {
    if (!oc) completa.push(`Otro contacto: ${ob.nombre}`);
    else if (ob.celular !== oc.celular) diferencias.push({ campo: 'Otro contacto', crm: detalleContacto(oc), base: detalleContacto(ob) });
  }
  return { completa, diferencias };
}
/** Mismo representante si coincide el DNI, o el nombre cuando falta el DNI en alguno */
const mismaPersona = (a: ContactoBase, b: ContactoBase) =>
  a.dni && b.dni ? a.dni === b.dni : mismoTexto(a.nombre, b.nombre) || a.nombre === 'Sin nombre';
const detalleContacto = (k: ContactoBase) => [k.nombre, k.dni && `DNI ${k.dni}`, k.celular, k.correo].filter(Boolean).join(' · ');
/** Teléfono a 9 dígitos: celular 9…, fijo con código 0… (un fijo de Lima de 7 dígitos se completa con 01) */
function telefono(t: string): string {
  const d = t.replace(/\D/g, '').replace(/^51(?=\d{9}$)/, '');
  return /^[2-7]\d{6}$/.test(d) ? `01${d}` : d;
}
interface FilaError { fila: number; ruc: string | null; motivo: Motivo; detalle: string; datos: Record<string, string> }

/**
 * Carga de bases de empresas desde Excel (.xlsx) o CSV.
 * 1) Se sube el archivo: se revisa fila por fila y queda PENDIENTE_APROBACION con sus errores.
 * 2) El supervisor (o gerencia) lo aprueba: las filas válidas se crean como empresas, asignadas o libres.
 */
@Injectable()
export class BasesService {
  constructor(
    private readonly db: DataSource,
    private readonly notificaciones: NotificacionesService,
    private readonly retencion: RetencionService,
    private readonly sunat: SunatService,
  ) {}

  // ───────────── Plantilla vacía (no contiene datos) ─────────────
  async plantilla(): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Empresas');
    hoja.addRow(PLANTILLA);
    hoja.addRow(['20601234567', 'Ejemplo S.A.C.', 'Juan Pérez Rojas', '41234567', '987654321', 'jperez@ejemplo.pe', 'Lima', 'Lima', 'Miraflores', 25, 'Movistar']);
    hoja.getRow(1).font = { bold: true };
    hoja.columns.forEach((c, i) => { c.width = [14, 34, 30, 12, 13, 28, 14, 14, 18, 18, 14][i] ?? 16; });
    // RUC, DNI y teléfono como texto (que Excel no les quite los ceros ni los vuelva notación científica)
    for (const col of [1, 4, 5]) hoja.getColumn(col).numFmt = '@';
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  // ───────────── Subir y revisar ─────────────
  async subir(archivo: ArchivoSubido | undefined, opciones: { asignarA?: string; origen?: 'INTERNA' | 'COMPRADA'; proveedor?: string }, s: SesionUsuario) {
    if (!archivo) throw new BadRequestException('Adjunta el archivo Excel');
    const destino = await this.resolverDestino(opciones.asignarA, s);
    const origen = opciones.origen ?? 'INTERNA';
    const proveedor = origen === 'COMPRADA' ? opciones.proveedor?.trim() || null : null;
    if (origen === 'COMPRADA' && !proveedor) throw new BadRequestException('Escribe a quién se compró la base (proveedor)');
    const filas = await this.leer(archivo);
    if (!filas.length) throw new BadRequestException('El archivo no tiene filas con datos');
    if (filas.length > MAX_FILAS) throw new BadRequestException(`El archivo tiene ${filas.length} filas; el máximo por carga es ${MAX_FILAS}`);

    const { validas, errores, iguales } = await this.revisar(filas);
    const actualizar = validas.filter((v) => v.clienteId).length;

    const id = await this.db.transaction(async (tx) => {
      const [lote] = await tx.query(
        `INSERT INTO lotes_importacion (subido_por, archivo_nombre, total_filas, filas_ok, filas_error, estado, asignar_a,
                                        origen, proveedor, filas_actualizar, filas_iguales)
         VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_APROBACION', $6, $7, $8, $9, $10) RETURNING id`,
        [s.sub, archivo.originalname.slice(0, 200), filas.length, validas.length, errores.length, destino, origen, proveedor, actualizar, iguales],
      );
      // Inserción por bloques para que 1000+ filas no sean 1000 consultas
      for (let i = 0; i < validas.length; i += 500) {
        const bloque = validas.slice(i, i + 500);
        await tx.query(
          `INSERT INTO lote_filas (lote_id, fila, ruc, razon_social, distrito_id, contactos, lineas, operador_id, cliente_id, cambios)
           SELECT $1, x.fila, x.ruc, x.razon, x.distrito, x.contactos, x.lineas, x.operador, x.cliente, x.cambios FROM jsonb_to_recordset($2::jsonb)
             AS x(fila int, ruc text, razon text, distrito text, contactos jsonb, lineas smallint, operador smallint, cliente uuid, cambios jsonb)`,
          [lote.id, JSON.stringify(bloque.map((v) => ({
            fila: v.fila, ruc: v.ruc, razon: v.razon, distrito: v.distritoId, contactos: v.contactos, lineas: v.lineas, operador: v.operadorId,
            cliente: v.clienteId, cambios: v.cambios,
          })))],
        );
      }
      for (let i = 0; i < errores.length; i += 500) {
        await tx.query(
          `INSERT INTO lote_errores (lote_id, fila, ruc, motivo, detalle, datos)
           SELECT $1, x.fila, x.ruc, x.motivo, x.detalle, x.datos FROM jsonb_to_recordset($2::jsonb)
             AS x(fila int, ruc text, motivo text, detalle text, datos jsonb)`,
          [lote.id, JSON.stringify(errores.slice(i, i + 500))],
        );
      }
      return lote.id as string;
    });

    // Aviso a quien debe aprobar (supervisor del equipo del que sube, si sube un asesor)
    if (s.rol === 'ASESOR' && s.equipoId) {
      const [eq] = await this.db.query(`SELECT supervisor_id AS "supervisorId" FROM equipos WHERE id = $1`, [s.equipoId]);
      if (eq?.supervisorId) {
        await this.notificaciones.crear(eq.supervisorId, {
          tipo: 'BASE_APROBADA', titulo: 'Base por aprobar',
          mensaje: `Un asesor de tu equipo subió "${archivo.originalname}" con ${validas.length - actualizar} empresas nuevas${actualizar ? ` y ${actualizar} que completan datos` : ''}.`, entidad: 'LOTE', entidadId: id,
        });
      }
    }
    return this.detalle(id, s);
  }

  // ───────────── Listado ─────────────
  async listar(s: SesionUsuario) {
    const params: unknown[] = [];
    let filtro = 'true';
    if (s.rol === 'ASESOR') { params.push(s.sub); filtro = 'l.subido_por = $1'; }
    else if (s.rol === 'SUPERVISOR') { params.push(s.sub, s.equipoId); filtro = '(l.subido_por = $1 OR us.equipo_id = $2)'; }
    const filas = await this.db.query(
      `SELECT l.id, l.archivo_nombre AS archivo, l.total_filas AS total, l.filas_ok AS validas, l.filas_error AS "conError", l.estado,
              l.origen, l.proveedor, l.filas_actualizar AS "actualizar", l.filas_iguales AS iguales,
              l.empresas_creadas AS creadas, l.empresas_actualizadas AS actualizadas,
              l.created_at AS fecha, us.nombres || ' ' || us.apellidos AS "subidoPor",
              CASE WHEN l.asignar_a IS NULL THEN NULL ELSE ua.nombres || ' ' || ua.apellidos END AS "asignarA"
       FROM lotes_importacion l JOIN usuarios us ON us.id = l.subido_por LEFT JOIN usuarios ua ON ua.id = l.asignar_a
       WHERE ${filtro} ORDER BY l.created_at DESC LIMIT 100`, params,
    );
    return { filas };
  }

  // ───────────── Detalle con errores y vista previa ─────────────
  async detalle(id: string, s: SesionUsuario) {
    const [l] = await this.db.query(
      `SELECT l.id, l.archivo_nombre AS archivo, l.total_filas AS total, l.filas_ok AS validas, l.filas_error AS "conError", l.estado,
              l.created_at AS fecha, l.revisado_at AS "revisadoAt", l.motivo_rechazo AS "motivoRechazo",
              l.origen, l.proveedor, l.filas_actualizar AS "actualizar", l.filas_iguales AS iguales, l.en_diferencias AS "enDiferencias",
              l.empresas_creadas AS creadas, l.empresas_actualizadas AS actualizadas,
              l.subido_por AS "subidoPorId", us.nombres || ' ' || us.apellidos AS "subidoPor", us.equipo_id AS "equipoId",
              l.asignar_a AS "asignarAId", CASE WHEN l.asignar_a IS NULL THEN NULL ELSE ua.nombres || ' ' || ua.apellidos END AS "asignarA",
              CASE WHEN l.aprobado_por IS NULL THEN NULL ELSE ap.nombres || ' ' || ap.apellidos END AS "revisadoPor"
       FROM lotes_importacion l JOIN usuarios us ON us.id = l.subido_por
       LEFT JOIN usuarios ua ON ua.id = l.asignar_a LEFT JOIN usuarios ap ON ap.id = l.aprobado_por
       WHERE l.id = $1`, [id],
    );
    if (!l) throw new NotFoundException('La carga no existe');
    if (!this.puedeVer(l, s)) throw new ForbiddenException('No tienes acceso a esta carga');
    const errores = await this.db.query(
      `SELECT fila, ruc, motivo, detalle, datos FROM lote_errores WHERE lote_id = $1 ORDER BY fila LIMIT 1000`, [id],
    );
    const muestra = await this.db.query(
      `SELECT f.fila, f.ruc, f.razon_social AS "razonSocial", di.nombre AS distrito, pr.nombre AS provincia,
              jsonb_array_length(f.contactos) AS contactos, f.contactos->0->>'nombre' AS representante,
              f.lineas, op.nombre AS operador
       FROM lote_filas f LEFT JOIN distritos di ON di.id = f.distrito_id LEFT JOIN provincias pr ON pr.id = di.provincia_id
       LEFT JOIN operadores op ON op.id = f.operador_id
       WHERE f.lote_id = $1 AND f.cliente_id IS NULL ORDER BY f.fila LIMIT 20`, [id],
    );
    // Empresas que ya están en el CRM: qué completa la base y en qué difiere
    const existentes = await this.db.query(
      `SELECT f.fila, f.ruc, c.razon_social AS "razonSocial", CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS asesor,
              f.cambios->'completa' AS completa, f.cambios->'diferencias' AS diferencias
       FROM lote_filas f JOIN clientes c ON c.id = f.cliente_id LEFT JOIN usuarios u ON u.id = c.asesor_id
       WHERE f.lote_id = $1
       ORDER BY jsonb_array_length(COALESCE(f.cambios->'diferencias', '[]')) DESC, f.fila LIMIT 300`, [id],
    );
    const [{ conDiferencias }] = await this.db.query(
      `SELECT count(*) FILTER (WHERE jsonb_array_length(COALESCE(cambios->'diferencias', '[]')) > 0)::int AS "conDiferencias"
       FROM lote_filas WHERE lote_id = $1 AND cliente_id IS NOT NULL`, [id],
    );
    // Filas válidas a las que les falta algo de la estructura completa (representante con DNI, teléfono y correo, ubicación, líneas, operador)
    const [{ incompletas }] = await this.db.query(
      `SELECT count(*) FILTER (WHERE f.distrito_id IS NULL OR f.lineas IS NULL OR f.operador_id IS NULL
                                 OR f.contactos->0->>'dni' IS NULL OR f.contactos->0->>'correo' IS NULL)::int AS incompletas
       FROM lote_filas f WHERE f.lote_id = $1 AND f.cliente_id IS NULL`, [id],
    );
    const { subidoPorId: _a, equipoId: _b, asignarAId: _c, ...datos } = l;
    return { ...datos, nuevas: l.validas - l.actualizar, errores, muestra, existentes, conDiferencias, incompletas, puedeRevisar: l.estado === 'PENDIENTE_APROBACION' && this.puedeRevisar(l, s) };
  }

  // ───────────── Aprobar: crea las empresas nuevas y completa las que ya existen ─────────────
  async aprobar(id: string, enDiferencias: 'CRM' | 'BASE', s: SesionUsuario) {
    const resultado = await this.db.transaction(async (tx) => {
      const [l] = await tx.query(
        `SELECT l.id, l.estado, l.asignar_a AS "asignarA", l.subido_por AS "subidoPorId", l.archivo_nombre AS archivo, us.equipo_id AS "equipoId",
                l.filas_iguales AS iguales
         FROM lotes_importacion l JOIN usuarios us ON us.id = l.subido_por WHERE l.id = $1 FOR UPDATE OF l`, [id],
      );
      if (!l) throw new NotFoundException('La carga no existe');
      if (!this.puedeRevisar(l, s)) throw new ForbiddenException('No puedes aprobar esta carga');
      if (l.estado !== 'PENDIENTE_APROBACION') throw new BadRequestException('Esta carga ya fue revisada');

      // RUC que se registraron mientras la carga esperaba: tampoco se repiten, se completan
      await tx.query(
        `UPDATE lote_filas f SET cliente_id = c.id FROM clientes c WHERE f.lote_id = $1 AND f.cliente_id IS NULL AND c.ruc = f.ruc`, [id],
      );

      const creadas = await tx.query(
        `WITH nuevas AS (
           INSERT INTO clientes (ruc, razon_social, distrito_id, asesor_id, origen, lote_id, asignado_at, creado_por, retencion_hasta,
                                 lineas_actuales, operador_actual_id, sunat_pendiente)
           SELECT f.ruc, f.razon_social, f.distrito_id, $2, 'BASE', $1, CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END, $3,
                  CASE WHEN $2::uuid IS NULL THEN NULL ELSE $4::timestamptz END, f.lineas, f.operador_id,
                  -- Sin representante o sin su DNI: se completa después desde SUNAT
                  (f.contactos->0->>'dni') IS NULL
           FROM lote_filas f WHERE f.lote_id = $1 AND f.cliente_id IS NULL
           ON CONFLICT (ruc) DO NOTHING
           RETURNING id, ruc
         ), contactos AS (
           INSERT INTO contactos (cliente_id, nombre, celular, correo, dni, posicion)
           SELECT n.id, x.nombre, x.celular, x.correo, CASE WHEN x.ord = 1 THEN x.dni END, x.ord::smallint
           FROM nuevas n JOIN lote_filas f ON f.lote_id = $1 AND f.ruc = n.ruc
           CROSS JOIN LATERAL ROWS FROM (jsonb_to_recordset(f.contactos) AS (nombre text, celular text, correo text, dni text)) WITH ORDINALITY AS x(nombre, celular, correo, dni, ord)
           WHERE x.ord <= 2
         ), historial AS (
           INSERT INTO asignaciones (cliente_id, asesor_nuevo, motivo, asignado_por)
           SELECT n.id, $2, 'CARGA', $3 FROM nuevas n
         )
         SELECT count(*)::int AS n FROM nuevas`,
        [id, l.asignarA, s.sub, await this.retencion.inicial(true)],
      );
      const n = creadas[0].n as number;

      // Empresas que ya estaban: se comparan otra vez con sus datos de este momento
      const existentes: { ruc: string; razon: string; distritoId: string | null; lineas: number | null; operadorId: number | null; contactos: ContactoBase[] }[] =
        await tx.query(
          `SELECT f.ruc, f.razon_social AS razon, f.distrito_id AS "distritoId", f.lineas, f.operador_id AS "operadorId", f.contactos
           FROM lote_filas f WHERE f.lote_id = $1 AND f.cliente_id IS NOT NULL ORDER BY f.fila`, [id],
        );
      const fotos = await this.fotos(tx, existentes.map((e) => e.ruc), true);
      let actualizadas = 0;
      for (const f of existentes) {
        const c = fotos.get(f.ruc);
        if (c && await this.fusionar(tx, f, c, enDiferencias)) actualizadas++;
      }

      // Las que ya estaban y no cambiaron (solo tenían diferencias y se mantuvo el CRM) cuentan como "sin datos nuevos"
      const sinCambio = existentes.length - actualizadas;
      const procesadas = n + existentes.length + l.iguales;
      await tx.query(
        `UPDATE lotes_importacion SET estado = 'LISTO', aprobado_por = $2, revisado_at = now(), procesado_at = now(), en_diferencias = $5,
                empresas_creadas = $3, empresas_actualizadas = $4, filas_iguales = filas_iguales + $7, filas_ok = $6, filas_error = total_filas - $6 WHERE id = $1`,
        [id, s.sub, n, actualizadas, enDiferencias, procesadas, sinCambio],
      );
      await tx.query(`DELETE FROM lote_filas WHERE lote_id = $1`, [id]);

      const mensaje = `De "${l.archivo}": ${n} empresas nuevas${actualizadas ? ` y ${actualizadas} que ya estaban en el CRM con datos completados` : ''}.`;
      if (l.subidoPorId !== s.sub) {
        await this.notificaciones.crear(l.subidoPorId, { tipo: 'BASE_APROBADA', titulo: 'Base aprobada', mensaje, entidad: 'LOTE', entidadId: id }, tx);
      }
      if (n && l.asignarA && l.asignarA !== l.subidoPorId && l.asignarA !== s.sub) {
        await this.notificaciones.crear(l.asignarA, {
          tipo: 'EMPRESA_ASIGNADA', titulo: 'Nuevas empresas asignadas', mensaje: `Se te asignaron ${n} empresas de una base cargada.`, entidad: 'LOTE', entidadId: id,
        }, tx);
      }
      return { creadas: n, actualizadas, iguales: (l.iguales as number) + sinCambio };
    });
    // Si la consulta a SUNAT está activa, los representantes que faltan se completan solos en los próximos minutos
    return { ...resultado, completaSunat: this.sunat.activo, carga: await this.detalle(id, s) };
  }

  /**
   * Junta una fila de la base con la empresa que ya existe, sin crear otra:
   *  - lo que el CRM no tiene, se agrega;
   *  - lo que es distinto, se queda como está ('CRM') o se reemplaza ('BASE').
   * No cambia al asesor a cargo. Devuelve si hubo algún cambio.
   */
  private async fusionar(tx: EntityManager, f: Pick<FilaValida, 'razon' | 'distritoId' | 'lineas' | 'operadorId' | 'contactos'>, c: FotoCrm, regla: 'CRM' | 'BASE') {
    const usarBase = regla === 'BASE';
    const elegir = <T>(base: T | null, crm: T | null) => (base === null || base === undefined ? crm : crm === null || crm === undefined || usarBase ? base : crm);
    let cambio = false;

    const razon = usarBase && !mismoTexto(f.razon, c.razon) ? f.razon : c.razon;
    const distritoId = elegir(f.distritoId, c.distritoId);
    const lineas = elegir(f.lineas, c.lineas);
    const operadorId = elegir(f.operadorId, c.operadorId);
    if (razon !== c.razon || distritoId !== c.distritoId || lineas !== c.lineas || operadorId !== c.operadorId) {
      await tx.query(
        `UPDATE clientes SET razon_social = $2, distrito_id = $3, lineas_actuales = $4, operador_actual_id = $5, updated_at = now() WHERE id = $1`,
        [c.id, razon, distritoId, lineas, operadorId],
      );
      cambio = true;
    }

    const guardar = async (k: ContactoBase, posicion: 1 | 2, actual?: ContactoBase) => {
      let final: ContactoBase;
      if (!actual) final = k;
      else if (posicion === 1 && !mismaPersona(k, actual)) final = usarBase ? k : actual;   // otro representante
      else if (posicion === 2 && k.celular !== actual.celular) final = usarBase ? k : actual;
      else {
        final = {
          nombre: actual.nombre === 'Sin nombre' ? k.nombre : actual.nombre,
          dni: elegir(k.dni, actual.dni), celular: elegir(k.celular, actual.celular),
          correo: elegir(k.correo, actual.correo),
        };
      }
      if (actual && final.nombre === actual.nombre && final.dni === actual.dni && final.celular === actual.celular && final.correo === actual.correo) return;
      if (posicion === 2 && !final.celular) return;
      await tx.query(
        `INSERT INTO contactos (cliente_id, nombre, celular, correo, dni, posicion) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (cliente_id, posicion) DO UPDATE SET nombre = EXCLUDED.nombre, celular = EXCLUDED.celular, correo = EXCLUDED.correo, dni = EXCLUDED.dni`,
        [c.id, final.nombre.slice(0, 100), final.celular, final.correo, posicion === 1 ? final.dni : null, posicion],
      );
      cambio = true;
    };
    const [rb, ob] = f.contactos;
    if (rb) await guardar(rb, 1, c.contactos.find((k) => k.posicion === 1));
    if (ob) await guardar(ob, 2, c.contactos.find((k) => k.posicion === 2));

    // Sigue sin representante con DNI: que lo complete SUNAT
    await tx.query(
      `UPDATE clientes SET sunat_pendiente = true WHERE id = $1 AND sunat_consultado_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM contactos k WHERE k.cliente_id = $1 AND k.posicion = 1 AND k.dni IS NOT NULL)`, [c.id],
    );
    return cambio;
  }

  // ───────────── Rechazar ─────────────
  async rechazar(id: string, motivo: string, s: SesionUsuario) {
    await this.db.transaction(async (tx) => {
      const [l] = await tx.query(
        `SELECT l.estado, l.subido_por AS "subidoPorId", l.archivo_nombre AS archivo, us.equipo_id AS "equipoId"
         FROM lotes_importacion l JOIN usuarios us ON us.id = l.subido_por WHERE l.id = $1 FOR UPDATE OF l`, [id],
      );
      if (!l) throw new NotFoundException('La carga no existe');
      if (!this.puedeRevisar(l, s)) throw new ForbiddenException('No puedes rechazar esta carga');
      if (l.estado !== 'PENDIENTE_APROBACION') throw new BadRequestException('Esta carga ya fue revisada');
      await tx.query(
        `UPDATE lotes_importacion SET estado = 'RECHAZADO', aprobado_por = $2, revisado_at = now(), motivo_rechazo = $3 WHERE id = $1`,
        [id, s.sub, motivo.trim()],
      );
      await tx.query(`DELETE FROM lote_filas WHERE lote_id = $1`, [id]);
      if (l.subidoPorId !== s.sub) {
        await this.notificaciones.crear(l.subidoPorId, {
          tipo: 'BASE_APROBADA', titulo: 'Base rechazada', mensaje: `"${l.archivo}" fue rechazada: “${motivo.trim()}”.`, entidad: 'LOTE', entidadId: id,
        }, tx);
      }
    });
    return this.detalle(id, s);
  }

  /** A quién se pueden asignar las empresas de una carga */
  async destinos(s: SesionUsuario) {
    if (s.rol === 'ASESOR') return { repositorio: false, asesores: [] };
    const params: unknown[] = [];
    let filtro = '';
    if (s.rol === 'SUPERVISOR') { params.push(s.equipoId); filtro = 'AND u.equipo_id = $1'; }
    const asesores = await this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, e.nombre AS equipo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos e ON e.id = u.equipo_id
       WHERE r.codigo = 'ASESOR' AND u.activo ${filtro} ORDER BY e.nombre NULLS LAST, nombre`, params,
    );
    return { repositorio: true, asesores };
  }

  // ───────────── Ayudantes ─────────────

  /** Asesor: siempre a sí mismo · Supervisor: repositorio o un asesor de su equipo · Gerencia/admin: repositorio o cualquier asesor */
  private async resolverDestino(asignarA: string | undefined, s: SesionUsuario): Promise<string | null> {
    if (s.rol === 'ASESOR') return s.sub;
    if (!asignarA || asignarA === 'repositorio') return null;
    const [a] = await this.db.query(
      `SELECT u.equipo_id AS "equipoId" FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 AND u.activo AND r.codigo = 'ASESOR'`,
      [asignarA],
    );
    if (!a) throw new BadRequestException('El asesor elegido no existe o no está activo');
    if (s.rol === 'SUPERVISOR' && a.equipoId !== s.equipoId) throw new ForbiddenException('Solo puedes asignar a asesores de tu equipo');
    return asignarA;
  }

  private puedeVer(l: { subidoPorId: string; equipoId: string | null }, s: SesionUsuario) {
    if (['GERENTE', 'ADMIN', 'BACKOFFICE'].includes(s.rol)) return true;
    if (s.rol === 'SUPERVISOR') return l.subidoPorId === s.sub || (!!s.equipoId && l.equipoId === s.equipoId);
    return l.subidoPorId === s.sub;
  }

  /** Aprueba el supervisor del equipo de quien subió el archivo, o gerencia */
  private puedeRevisar(l: { subidoPorId: string; equipoId: string | null }, s: SesionUsuario) {
    if (!s.permisos.includes('BASE_APROBAR')) return false;
    if (s.rol === 'GERENTE' || s.rol === 'ADMIN') return true;
    return l.subidoPorId === s.sub || (!!s.equipoId && l.equipoId === s.equipoId);
  }

  /** Lee el archivo y devuelve cada fila como objeto con las columnas reconocidas */
  private async leer(archivo: ArchivoSubido): Promise<{ fila: number; datos: Record<string, string> }[]> {
    const libro = new ExcelJS.Workbook();
    const nombre = archivo.originalname.toLowerCase();
    try {
      if (nombre.endsWith('.csv')) await libro.csv.read(Readable.from(archivo.buffer.toString('utf8').replace(/^\uFEFF/, '')));
      else if (nombre.endsWith('.xlsx')) await libro.xlsx.load(archivo.buffer as unknown as ArrayBuffer);
      else throw new Error('formato');
    } catch {
      throw new BadRequestException('No se pudo leer el archivo. Usa la plantilla en formato Excel (.xlsx) o CSV.');
    }
    const hoja = libro.worksheets[0];
    if (!hoja) throw new BadRequestException('El archivo no tiene hojas');

    // Primera fila: encabezados → a qué campo corresponde cada columna
    const mapa: Record<number, string> = {};
    hoja.getRow(1).eachCell((celda, col) => {
      const h = normal(celda.text).toLowerCase().replace(/[°º.#]/g, '').replace(/\s+/g, ' ').trim();
      const campo = Object.entries(COLUMNAS).find(([, alias]) => alias.includes(h))?.[0];
      if (campo && !Object.values(mapa).includes(campo)) mapa[col] = campo;
    });
    if (!Object.values(mapa).includes('ruc') || !Object.values(mapa).includes('razon')) {
      throw new BadRequestException('La primera fila debe tener al menos las columnas "RUC" y "Razón social". Descarga la plantilla.');
    }

    const filas: { fila: number; datos: Record<string, string> }[] = [];
    hoja.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const datos: Record<string, string> = {};
      for (const [col, campo] of Object.entries(mapa)) datos[campo] = String(row.getCell(Number(col)).text ?? '').trim();
      if (Object.values(datos).some((v) => v)) filas.push({ fila: n, datos });
    });
    return filas;
  }

  /** Revisa cada fila: RUC, razón social, ubigeo, contactos y repetidos (en el archivo y en el CRM) */
  private async revisar(filas: { fila: number; datos: Record<string, string> }[]) {
    const ubigeo = await this.cargarUbigeo();
    const listaOperadores: { id: number; nombre: string }[] = await this.db.query(`SELECT id, nombre FROM operadores WHERE activo`);
    const operadores = new Map<string, number>(listaOperadores.map((o) => [normal(o.nombre), o.id]));
    const nombres = await this.nombres(ubigeo);
    const rucs = filas.map((f) => f.datos.ruc?.replace(/\D/g, '')).filter((r) => /^\d{11}$/.test(r));
    const enCrm = await this.fotos(this.db, rucs);
    const vistos = new Map<string, number>();
    const validas: FilaValida[] = [];
    const errores: FilaError[] = [];
    let iguales = 0;

    for (const { fila, datos } of filas) {
      const err = (motivo: Motivo, detalle: string, ruc: string | null = null) => errores.push({ fila, ruc, motivo, detalle, datos });
      const ruc = (datos.ruc ?? '').replace(/\D/g, '');
      if (!ruc) { err('DATO_FALTANTE', 'Falta el RUC'); continue; }
      // Si el RUC ya está en el CRM se acepta tal cual (empresas registradas antes de validar el dígito verificador)
      const problemaRuc = enCrm.has(ruc) ? null : errorRuc(ruc);
      if (problemaRuc) { err('RUC_INVALIDO', problemaRuc, ruc.slice(0, 20)); continue; }
      if (vistos.has(ruc)) { err('RUC_DUPLICADO', `Repetido en el archivo (también en la fila ${vistos.get(ruc)})`, ruc); continue; }
      vistos.set(ruc, fila);
      const razon = (datos.razon ?? '').replace(/\s+/g, ' ').trim();
      if (razon.length < 3) { err('DATO_FALTANTE', 'Falta la razón social', ruc); continue; }

      const distrito = this.ubicar(datos, ubigeo);
      if (distrito === 'invalido') { err('UBIGEO_INVALIDO', 'No se encontró el distrito (revisa departamento, provincia y distrito)', ruc); continue; }
      if (distrito === 'ambiguo') { err('UBIGEO_INVALIDO', 'Hay varios distritos con ese nombre: indica la provincia', ruc); continue; }

      const contactos: FilaValida['contactos'] = [];
      let malo = '';
      for (const k of ['1', '2']) {
        const quien = k === '1' ? 'del representante legal' : 'del contacto 2';
        const nombre = (datos[`nombre${k}`] ?? '').trim();
        const celular = telefono(datos[`celular${k}`] ?? '');
        const correo = (datos[`correo${k}`] ?? '').trim();
        // Excel suele quitar el 0 inicial del DNI: 7 dígitos → se completa
        const digitosDni = k === '1' ? (datos.dni1 ?? '').replace(/\D/g, '') : '';
        const dni = digitosDni.length === 7 ? `0${digitosDni}` : digitosDni;
        if (!nombre && !celular && !correo && !dni) continue;
        // El representante puede venir sin teléfono (nombre y DNI de SUNAT); el otro contacto, no
        if (!celular && k === '2') { malo = `Falta el teléfono ${quien}`; break; }
        if (celular && !/^[90]\d{8}$/.test(celular)) { malo = `Teléfono ${quien} no válido (celular de 9 dígitos o fijo con código de ciudad)`; break; }
        if (dni && !/^\d{8}$/.test(dni)) { malo = 'El DNI del representante debe tener 8 dígitos'; break; }
        if (correo && !correoValido(correo)) { malo = `Correo ${quien} no válido`; break; }
        contactos.push({ nombre: (nombre || 'Sin nombre').slice(0, 100), celular: celular || null, correo: correo ? correo.slice(0, 150) : null, dni: dni || null });
      }
      if (malo) { err('DATO_INVALIDO', malo, ruc); continue; }

      // Cantidad de líneas que tiene hoy y con qué operador (opcionales)
      const textoLineas = (datos.lineas ?? '').replace(/[\s,.]/g, '');
      const lineas = textoLineas ? Number(textoLineas) : null;
      if (lineas !== null && (!Number.isInteger(lineas) || lineas < 0 || lineas > 10000)) {
        err('DATO_INVALIDO', 'La cantidad de líneas debe ser un número entero entre 0 y 10 000', ruc); continue;
      }
      const textoOperador = normal(datos.operador);
      const operadorId = textoOperador ? operadores.get(textoOperador) ?? null : null;
      if (textoOperador && !operadorId) {
        err('DATO_INVALIDO', `Operador no reconocido: "${datos.operador}". Usa ${[...operadores.keys()].map((o) => o.charAt(0) + o.slice(1).toLowerCase()).join(', ')} o déjalo vacío`, ruc); continue;
      }

      const nueva: FilaValida = { fila, ruc, razon: razon.slice(0, 200), distritoId: distrito, contactos, lineas, operadorId, clienteId: null, cambios: null };
      // Ya está en el CRM: no se repite; se ve qué datos completa y en cuáles difiere
      const foto = enCrm.get(ruc);
      if (foto) {
        const cambios = comparar(nueva, foto, nombres);
        if (!cambios.completa.length && !cambios.diferencias.length) { iguales++; continue; }
        nueva.clienteId = foto.id;
        nueva.cambios = cambios;
      }
      validas.push(nueva);
    }
    return { validas, errores, iguales };
  }

  /** Datos actuales de las empresas del CRM con esos RUC */
  private async fotos(db: DataSource | EntityManager, rucs: string[], bloquear = false): Promise<Map<string, FotoCrm>> {
    if (!rucs.length) return new Map();
    const filas: FotoCrm[] = await db.query(
      `SELECT c.id, c.ruc, c.razon_social AS razon, c.distrito_id AS "distritoId", c.lineas_actuales AS lineas, c.operador_actual_id AS "operadorId",
              CASE WHEN u.id IS NULL THEN NULL ELSE u.nombres || ' ' || u.apellidos END AS asesor,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('nombre', k.nombre, 'celular', k.celular, 'correo', k.correo, 'dni', k.dni, 'posicion', k.posicion)
                                          ORDER BY k.posicion) FROM contactos k WHERE k.cliente_id = c.id), '[]') AS contactos
       FROM clientes c LEFT JOIN usuarios u ON u.id = c.asesor_id WHERE c.ruc = ANY($1)${bloquear ? ' FOR UPDATE OF c' : ''}`, [rucs],
    );
    return new Map(filas.map((f) => [f.ruc.trim(), f]));
  }

  /** Nombres legibles de distritos y operadores (para mostrar las diferencias) */
  private async nombres(ubigeo?: Awaited<ReturnType<BasesService['cargarUbigeo']>>): Promise<Nombres> {
    const u = ubigeo ?? await this.cargarUbigeo();
    const ops = new Map<number, string>((await this.db.query(`SELECT id, nombre FROM operadores`) as { id: number; nombre: string }[]).map((o) => [o.id, o.nombre]));
    return { distrito: (id) => u.textos.get(id) ?? id, operador: (id) => ops.get(id) ?? String(id) };
  }

  private async cargarUbigeo() {
    const filas: { id: string; dist: string; prov: string; dep: string }[] = await this.db.query(
      `SELECT di.id, di.nombre AS dist, pr.nombre AS prov, de.nombre AS dep
       FROM distritos di JOIN provincias pr ON pr.id = di.provincia_id JOIN departamentos de ON de.id = pr.departamento_id`,
    );
    const ids = new Set(filas.map((f) => f.id));
    const textos = new Map(filas.map((f) => [f.id, `${f.dist} (${f.prov}, ${f.dep})`]));
    const completo = new Map<string, string>();
    const porProv = new Map<string, string[]>();
    const porDist = new Map<string, string[]>();
    for (const f of filas) {
      completo.set(`${normal(f.dep)}|${normal(f.prov)}|${normal(f.dist)}`, f.id);
      const kp = `${normal(f.prov)}|${normal(f.dist)}`;
      porProv.set(kp, [...(porProv.get(kp) ?? []), f.id]);
      porDist.set(normal(f.dist), [...(porDist.get(normal(f.dist)) ?? []), f.id]);
    }
    return { ids, completo, porProv, porDist, textos };
  }

  /** Código ubigeo, o departamento/provincia/distrito por nombre. Sin datos de ubicación → null (se permite). */
  private ubicar(d: Record<string, string>, u: Awaited<ReturnType<BasesService['cargarUbigeo']>>): string | null | 'invalido' | 'ambiguo' {
    const codigo = (d.ubigeo ?? '').replace(/\D/g, '');
    if (codigo) return u.ids.has(codigo.padStart(6, '0')) ? codigo.padStart(6, '0') : 'invalido';
    const dist = normal(d.distrito);
    if (!dist) return d.provincia || d.departamento ? 'invalido' : null;
    const dep = normal(d.departamento);
    const prov = normal(d.provincia);
    if (dep && prov) return u.completo.get(`${dep}|${prov}|${dist}`) ?? 'invalido';
    const lista = prov ? u.porProv.get(`${prov}|${dist}`) : u.porDist.get(dist);
    if (!lista?.length) return 'invalido';
    return lista.length === 1 ? lista[0] : 'ambiguo';
  }
}