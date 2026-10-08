import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AlmacenamientoService } from '../almacenamiento/almacenamiento.service';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';

export interface ArchivoSubido { originalname: string; buffer: Buffer; size: number }
export type TipoDocumento = 'CONTRATO' | 'DNI' | 'FICHA_RUC' | 'CARTA_PORTABILIDAD' | 'OTRO';

export const MAX_MB = 10;
const MAX_DOCUMENTOS = 15;

/** Tipos permitidos, reconocidos por los primeros bytes (no por la extensión, que se puede cambiar) */
function detectarTipo(b: Buffer): { mime: string; ext: string } | null {
  if (b.subarray(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

interface Venta {
  id: string; codigo: string; resultado: string; estadoVenta: string | null; asesorId: string;
  duenoEmpresaId: string | null; equipoVentaId: string | null; equipoAsesorId: string | null;
}

/**
 * Expediente digital de cada venta.
 *  - Ven los documentos quienes ven la negociación (asesor, su supervisor, gerencia, back office).
 *  - Suben: el asesor a cargo mientras la negocia o la corrige; back office mientras la valida y en posventa.
 *  - Nadie borra de verdad: el documento queda oculto (auditoría).
 */
@Injectable()
export class ExpedienteService {
  constructor(
    private readonly db: DataSource,
    private readonly almacen: AlmacenamientoService,
  ) {}

  async listar(oportunidadId: string, s: SesionUsuario) {
    const v = await this.venta(oportunidadId, s);
    const filas: { id: string; tipo: TipoDocumento; nombre: string; mime: string; tamano: number; fecha: string; subidoPorId: string; subidoPor: string }[] =
      await this.db.query(
        `SELECT d.id, d.tipo, d.nombre, d.mime, d.tamano, d.created_at AS fecha, d.subido_por AS "subidoPorId",
                u.nombres || ' ' || u.apellidos AS "subidoPor"
         FROM documentos_venta d JOIN usuarios u ON u.id = d.subido_por
         WHERE d.oportunidad_id = $1 AND d.eliminado_at IS NULL ORDER BY d.created_at`, [oportunidadId],
      );
    return {
      documentos: filas.map(({ subidoPorId, ...d }) => ({ ...d, puedeEliminar: this.puedeEliminar(v, subidoPorId, s) })),
      puedeSubir: this.puedeSubir(v, s),
      maximo: MAX_DOCUMENTOS,
      maxMb: MAX_MB,
    };
  }

  async subir(oportunidadId: string, tipo: TipoDocumento, archivo: ArchivoSubido | undefined, s: SesionUsuario) {
    if (!archivo?.size) throw new BadRequestException('Adjunta el archivo');
    const v = await this.venta(oportunidadId, s);
    if (!this.puedeSubir(v, s)) throw new ForbiddenException('En este momento no puedes agregar documentos a esta venta');
    const formato = detectarTipo(archivo.buffer);
    if (!formato) throw new BadRequestException('Solo se aceptan PDF o fotos (JPG, PNG o WEBP)');

    const [{ total }] = await this.db.query(
      `SELECT count(*)::int AS total FROM documentos_venta WHERE oportunidad_id = $1 AND eliminado_at IS NULL`, [oportunidadId],
    );
    if (total >= MAX_DOCUMENTOS) throw new BadRequestException(`El expediente ya tiene ${MAX_DOCUMENTOS} documentos. Elimina alguno antes de subir otro.`);

    // Nombre visible: sin rutas y con un largo razonable. La clave en el almacenamiento es aleatoria.
    const nombre = (archivo.originalname.split(/[\\/]/).pop() || `documento.${formato.ext}`).slice(-200);
    const clave = `ventas/${oportunidadId}/${randomUUID()}.${formato.ext}`;
    await this.almacen.guardar(clave, archivo.buffer, formato.mime);
    await this.db.query(
      `INSERT INTO documentos_venta (oportunidad_id, tipo, nombre, clave, mime, tamano, subido_por) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [oportunidadId, tipo, nombre, clave, formato.mime, archivo.size, s.sub],
    );
    return this.listar(oportunidadId, s);
  }

  /** El archivo, para verlo en el navegador (pasa por aquí para revisar permisos) */
  async archivo(id: string, s: SesionUsuario) {
    const d = await this.documento(id);
    await this.venta(d.oportunidadId, s);
    return { nombre: d.nombre, mime: d.mime, datos: await this.almacen.leer(d.clave) };
  }

  async eliminar(id: string, s: SesionUsuario) {
    const d = await this.documento(id);
    const v = await this.venta(d.oportunidadId, s);
    if (!this.puedeEliminar(v, d.subidoPor, s)) throw new ForbiddenException('No puedes eliminar este documento');
    await this.db.query(`UPDATE documentos_venta SET eliminado_at = now(), eliminado_por = $1 WHERE id = $2`, [s.sub, id]);
    return this.listar(d.oportunidadId, s);
  }

  // ───────────── Reglas ─────────────
  private esBackoffice(s: SesionUsuario) {
    return s.permisos.includes('VENTA_VALIDAR');
  }

  private esAsesorACargo(v: Venta, s: SesionUsuario) {
    return v.asesorId === s.sub && v.duenoEmpresaId === s.sub && s.permisos.includes('NEGOCIACION_GESTIONAR');
  }

  private puedeSubir(v: Venta, s: SesionUsuario) {
    if (this.esBackoffice(s)) return v.resultado === 'GANADA' && v.estadoVenta !== 'ANULADA';
    if (this.esAsesorACargo(v, s)) {
      return v.resultado === 'EN_CURSO' || (v.resultado === 'GANADA' && ['EN_VALIDACION', 'OBSERVADA'].includes(v.estadoVenta ?? ''));
    }
    return false;
  }

  /** Back office hasta que se activa; el asesor solo lo suyo y mientras la negocia o la corrige */
  private puedeEliminar(v: Venta, subidoPor: string, s: SesionUsuario) {
    if (this.esBackoffice(s)) return v.resultado === 'GANADA' && !['ACTIVA', 'ANULADA'].includes(v.estadoVenta ?? '');
    return subidoPor === s.sub && this.esAsesorACargo(v, s) && (v.resultado === 'EN_CURSO' || v.estadoVenta === 'OBSERVADA');
  }

  // ───────────── Ayudantes ─────────────
  /** Carga la venta y revisa que el usuario la pueda ver (mismas reglas que la ficha de la negociación) */
  private async venta(id: string, s: SesionUsuario): Promise<Venta> {
    const [v]: Venta[] = await this.db.query(
      `SELECT o.id, o.codigo, o.resultado, o.estado_venta AS "estadoVenta", o.asesor_id AS "asesorId",
              c.asesor_id AS "duenoEmpresaId", o.equipo_id AS "equipoVentaId", ua.equipo_id AS "equipoAsesorId"
       FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id JOIN usuarios ua ON ua.id = o.asesor_id
       WHERE o.id = $1`, [id],
    );
    if (!v) throw new NotFoundException('La negociación no existe');
    const ve = ['GERENTE', 'BACKOFFICE', 'ADMIN'].includes(s.rol)
      || (s.rol === 'SUPERVISOR' && !!s.equipoId && (v.equipoVentaId ?? v.equipoAsesorId) === s.equipoId)
      || v.asesorId === s.sub;
    if (!ve) throw new ForbiddenException('No tienes acceso a esta negociación');
    return v;
  }

  private async documento(id: string) {
    const [d] = await this.db.query(
      `SELECT oportunidad_id AS "oportunidadId", nombre, mime, clave, subido_por AS "subidoPor"
       FROM documentos_venta WHERE id = $1 AND eliminado_at IS NULL`, [id],
    );
    if (!d) throw new NotFoundException('El documento no existe');
    return d as { oportunidadId: string; nombre: string; mime: string; clave: string; subidoPor: string };
  }
}