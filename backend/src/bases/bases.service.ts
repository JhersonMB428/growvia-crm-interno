import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

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
  nombre1: ['contacto 1', 'contacto', 'nombre contacto', 'contacto 1 nombre', 'nombre del contacto'],
  celular1: ['celular 1', 'celular', 'telefono', 'contacto 1 celular', 'movil'],
  correo1: ['correo 1', 'correo', 'email', 'contacto 1 correo', 'e-mail'],
  nombre2: ['contacto 2', 'contacto 2 nombre'],
  celular2: ['celular 2', 'contacto 2 celular', 'telefono 2'],
  correo2: ['correo 2', 'contacto 2 correo', 'email 2'],
};
const PLANTILLA = ['RUC', 'Razón social', 'Departamento', 'Provincia', 'Distrito', 'Contacto 1', 'Celular 1', 'Correo 1', 'Contacto 2', 'Celular 2', 'Correo 2'];

/** "Lima Metropolitana " → "LIMA METROPOLITANA" sin tildes */
const normal = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

type Motivo = 'RUC_INVALIDO' | 'RUC_DUPLICADO' | 'UBIGEO_INVALIDO' | 'DATO_FALTANTE' | 'DATO_INVALIDO';
interface FilaValida { fila: number; ruc: string; razon: string; distritoId: string | null; contactos: { nombre: string; celular: string; correo: string | null }[] }
interface FilaError { fila: number; ruc: string | null; motivo: Motivo; detalle: string; datos: Record<string, string> }

/**
 * Carga de bases de empresas desde Excel (.xlsx) o CSV.
 * 1) Se sube el archivo: se revisa fila por fila y queda PENDIENTE_APROBACION con sus errores.
 * 2) El supervisor (o gerencia) lo aprueba: las filas válidas se crean como empresas, asignadas o libres.
 */
@Injectable()
export class BasesService {
  constructor(private readonly db: DataSource, private readonly notificaciones: NotificacionesService) {}

  // ───────────── Plantilla vacía (no contiene datos) ─────────────
  async plantilla(): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Empresas');
    hoja.addRow(PLANTILLA);
    hoja.addRow(['20601234567', 'Ejemplo S.A.C.', 'Lima', 'Lima', 'Miraflores', 'Juan Pérez', '987654321', 'jperez@ejemplo.pe', '', '', '']);
    hoja.getRow(1).font = { bold: true };
    hoja.columns.forEach((c, i) => { c.width = i === 1 ? 34 : 16; });
    hoja.getColumn(1).numFmt = '@';
    hoja.getColumn(7).numFmt = '@';
    hoja.getColumn(10).numFmt = '@';
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  // ───────────── Subir y revisar ─────────────
  async subir(archivo: ArchivoSubido | undefined, asignarA: string | undefined, s: SesionUsuario) {
    if (!archivo) throw new BadRequestException('Adjunta el archivo Excel');
    const destino = await this.resolverDestino(asignarA, s);
    const filas = await this.leer(archivo);
    if (!filas.length) throw new BadRequestException('El archivo no tiene filas con datos');
    if (filas.length > MAX_FILAS) throw new BadRequestException(`El archivo tiene ${filas.length} filas; el máximo por carga es ${MAX_FILAS}`);

    const { validas, errores } = await this.revisar(filas);

    const id = await this.db.transaction(async (tx) => {
      const [lote] = await tx.query(
        `INSERT INTO lotes_importacion (subido_por, archivo_nombre, total_filas, filas_ok, filas_error, estado, asignar_a)
         VALUES ($1, $2, $3, $4, $5, 'PENDIENTE_APROBACION', $6) RETURNING id`,
        [s.sub, archivo.originalname.slice(0, 200), filas.length, validas.length, errores.length, destino],
      );
      // Inserción por bloques para que 1000+ filas no sean 1000 consultas
      for (let i = 0; i < validas.length; i += 500) {
        const bloque = validas.slice(i, i + 500);
        await tx.query(
          `INSERT INTO lote_filas (lote_id, fila, ruc, razon_social, distrito_id, contactos)
           SELECT $1, x.fila, x.ruc, x.razon, x.distrito, x.contactos FROM jsonb_to_recordset($2::jsonb)
             AS x(fila int, ruc text, razon text, distrito text, contactos jsonb)`,
          [lote.id, JSON.stringify(bloque.map((v) => ({ fila: v.fila, ruc: v.ruc, razon: v.razon, distrito: v.distritoId, contactos: v.contactos })))],
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
          mensaje: `Un asesor de tu equipo subió "${archivo.originalname}" con ${validas.length} empresas válidas.`, entidad: 'LOTE', entidadId: id,
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
              jsonb_array_length(f.contactos) AS contactos
       FROM lote_filas f LEFT JOIN distritos di ON di.id = f.distrito_id LEFT JOIN provincias pr ON pr.id = di.provincia_id
       WHERE f.lote_id = $1 ORDER BY f.fila LIMIT 20`, [id],
    );
    const { subidoPorId: _a, equipoId: _b, asignarAId: _c, ...datos } = l;
    return { ...datos, errores, muestra, puedeRevisar: l.estado === 'PENDIENTE_APROBACION' && this.puedeRevisar(l, s) };
  }

  // ───────────── Aprobar: crea las empresas ─────────────
  async aprobar(id: string, s: SesionUsuario) {
    const resultado = await this.db.transaction(async (tx) => {
      const [l] = await tx.query(
        `SELECT l.id, l.estado, l.asignar_a AS "asignarA", l.subido_por AS "subidoPorId", l.archivo_nombre AS archivo, us.equipo_id AS "equipoId"
         FROM lotes_importacion l JOIN usuarios us ON us.id = l.subido_por WHERE l.id = $1 FOR UPDATE OF l`, [id],
      );
      if (!l) throw new NotFoundException('La carga no existe');
      if (!this.puedeRevisar(l, s)) throw new ForbiddenException('No puedes aprobar esta carga');
      if (l.estado !== 'PENDIENTE_APROBACION') throw new BadRequestException('Esta carga ya fue revisada');

      // RUC que se registraron después de subir el archivo: pasan a errores
      const ocupados = await tx.query(
        `INSERT INTO lote_errores (lote_id, fila, ruc, motivo, detalle, datos)
         SELECT f.lote_id, f.fila, f.ruc, 'RUC_DUPLICADO', 'Se registró en el CRM mientras la carga esperaba aprobación',
                jsonb_build_object('razonSocial', f.razon_social)
         FROM lote_filas f JOIN clientes c ON c.ruc = f.ruc WHERE f.lote_id = $1 RETURNING fila`, [id],
      );
      const nOcupados = (Array.isArray(ocupados[0]) ? ocupados[0] : ocupados).length;

      const creadas = await tx.query(
        `WITH nuevas AS (
           INSERT INTO clientes (ruc, razon_social, distrito_id, asesor_id, origen, lote_id, asignado_at, creado_por)
           SELECT f.ruc, f.razon_social, f.distrito_id, $2, 'BASE', $1, CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END, $3
           FROM lote_filas f WHERE f.lote_id = $1 AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.ruc = f.ruc)
           ON CONFLICT (ruc) DO NOTHING
           RETURNING id, ruc
         ), contactos AS (
           INSERT INTO contactos (cliente_id, nombre, celular, correo, posicion)
           SELECT n.id, x.nombre, x.celular, x.correo, x.ord::smallint
           FROM nuevas n JOIN lote_filas f ON f.lote_id = $1 AND f.ruc = n.ruc
           CROSS JOIN LATERAL ROWS FROM (jsonb_to_recordset(f.contactos) AS (nombre text, celular text, correo text)) WITH ORDINALITY AS x(nombre, celular, correo, ord)
           WHERE x.ord <= 2
         ), historial AS (
           INSERT INTO asignaciones (cliente_id, asesor_nuevo, motivo, asignado_por)
           SELECT n.id, $2, 'CARGA', $3 FROM nuevas n
         )
         SELECT count(*)::int AS n FROM nuevas`,
        [id, l.asignarA, s.sub],
      );
      const n = creadas[0].n as number;
      await tx.query(
        `UPDATE lotes_importacion SET estado = 'LISTO', aprobado_por = $2, revisado_at = now(), procesado_at = now(),
                filas_ok = $3, filas_error = total_filas - $3 WHERE id = $1`, [id, s.sub, n],
      );
      await tx.query(`DELETE FROM lote_filas WHERE lote_id = $1`, [id]);

      const mensaje = `Se crearon ${n} empresas de "${l.archivo}"${nOcupados ? ` (${nOcupados} ya existían)` : ''}.`;
      if (l.subidoPorId !== s.sub) {
        await this.notificaciones.crear(l.subidoPorId, { tipo: 'BASE_APROBADA', titulo: 'Base aprobada', mensaje, entidad: 'LOTE', entidadId: id }, tx);
      }
      if (l.asignarA && l.asignarA !== l.subidoPorId && l.asignarA !== s.sub) {
        await this.notificaciones.crear(l.asignarA, {
          tipo: 'EMPRESA_ASIGNADA', titulo: 'Nuevas empresas asignadas', mensaje: `Se te asignaron ${n} empresas de una base cargada.`, entidad: 'LOTE', entidadId: id,
        }, tx);
      }
      return { creadas: n, yaExistian: nOcupados };
    });
    return { ...resultado, carga: await this.detalle(id, s) };
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
    const rucs = filas.map((f) => f.datos.ruc?.replace(/\D/g, '')).filter((r) => /^\d{11}$/.test(r));
    const existentes: { ruc: string; asesor: string | null }[] = rucs.length ? await this.db.query(
      `SELECT c.ruc, u.nombres || ' ' || u.apellidos AS asesor FROM clientes c LEFT JOIN usuarios u ON u.id = c.asesor_id WHERE c.ruc = ANY($1)`,
      [rucs],
    ) : [];
    const enCrm = new Map(existentes.map((e) => [e.ruc, e.asesor]));
    const vistos = new Map<string, number>();
    const validas: FilaValida[] = [];
    const errores: FilaError[] = [];

    for (const { fila, datos } of filas) {
      const err = (motivo: Motivo, detalle: string, ruc: string | null = null) => errores.push({ fila, ruc, motivo, detalle, datos });
      const ruc = (datos.ruc ?? '').replace(/\D/g, '');
      if (!ruc) { err('DATO_FALTANTE', 'Falta el RUC'); continue; }
      if (!/^(10|20)\d{9}$/.test(ruc)) { err('RUC_INVALIDO', 'El RUC debe tener 11 dígitos y empezar con 10 o 20', ruc.slice(0, 20)); continue; }
      if (vistos.has(ruc)) { err('RUC_DUPLICADO', `Repetido en el archivo (también en la fila ${vistos.get(ruc)})`, ruc); continue; }
      vistos.set(ruc, fila);
      if (enCrm.has(ruc)) { err('RUC_DUPLICADO', `Ya está en el CRM${enCrm.get(ruc) ? ` (lo tiene ${enCrm.get(ruc)})` : ' (libre en el repositorio)'}`, ruc); continue; }
      const razon = (datos.razon ?? '').replace(/\s+/g, ' ').trim();
      if (razon.length < 3) { err('DATO_FALTANTE', 'Falta la razón social', ruc); continue; }

      const distrito = this.ubicar(datos, ubigeo);
      if (distrito === 'invalido') { err('UBIGEO_INVALIDO', 'No se encontró el distrito (revisa departamento, provincia y distrito)', ruc); continue; }
      if (distrito === 'ambiguo') { err('UBIGEO_INVALIDO', 'Hay varios distritos con ese nombre: indica la provincia', ruc); continue; }

      const contactos: FilaValida['contactos'] = [];
      let malo = '';
      for (const k of ['1', '2']) {
        const nombre = (datos[`nombre${k}`] ?? '').trim();
        const celular = (datos[`celular${k}`] ?? '').replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
        const correo = (datos[`correo${k}`] ?? '').trim();
        if (!nombre && !celular && !correo) continue;
        if (!/^9\d{8}$/.test(celular)) { malo = `Celular del contacto ${k} no válido (9 dígitos y empieza con 9)`; break; }
        if (correo && !correoValido(correo)) { malo = `Correo del contacto ${k} no válido`; break; }
        contactos.push({ nombre: (nombre || 'Sin nombre').slice(0, 100), celular, correo: correo ? correo.slice(0, 150) : null });
      }
      if (malo) { err('DATO_INVALIDO', malo, ruc); continue; }

      validas.push({ fila, ruc, razon: razon.slice(0, 200), distritoId: distrito, contactos });
    }
    return { validas, errores };
  }

  private async cargarUbigeo() {
    const filas: { id: string; dist: string; prov: string; dep: string }[] = await this.db.query(
      `SELECT di.id, di.nombre AS dist, pr.nombre AS prov, de.nombre AS dep
       FROM distritos di JOIN provincias pr ON pr.id = di.provincia_id JOIN departamentos de ON de.id = pr.departamento_id`,
    );
    const ids = new Set(filas.map((f) => f.id));
    const completo = new Map<string, string>();
    const porProv = new Map<string, string[]>();
    const porDist = new Map<string, string[]>();
    for (const f of filas) {
      completo.set(`${normal(f.dep)}|${normal(f.prov)}|${normal(f.dist)}`, f.id);
      const kp = `${normal(f.prov)}|${normal(f.dist)}`;
      porProv.set(kp, [...(porProv.get(kp) ?? []), f.id]);
      porDist.set(normal(f.dist), [...(porDist.get(normal(f.dist)) ?? []), f.id]);
    }
    return { ids, completo, porProv, porDist };
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