import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AlmacenamientoService } from '../almacenamiento/almacenamiento.service';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';

/** El navegador ya la recorta y achica a 256 px: 2 MB alcanza de sobra */
export const MAX_FOTO_MB = 2;
export interface FotoSubida { buffer: Buffer; size: number; mimetype: string }

/** Solo fotos de verdad: se revisan los primeros bytes, no la extensión */
function formatoFoto(b: Buffer): { mime: string; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * Fotos de perfil. Se guardan junto a los expedientes (Azure Blob o disco) y solo se entregan
 * a usuarios con sesión iniciada. Back office y administración pueden quitar una foto inapropiada.
 */
@Injectable()
export class FotosService {
  constructor(private readonly db: DataSource, private readonly almacen: AlmacenamientoService) {}

  async subir(s: SesionUsuario, archivo: FotoSubida | undefined) {
    if (!archivo?.buffer?.length) throw new BadRequestException('Elige una foto');
    const formato = formatoFoto(archivo.buffer);
    if (!formato) throw new BadRequestException('La foto debe ser JPG, PNG o WEBP');
    const clave = `fotos/${s.sub}-${Date.now()}.${formato.ext}`;
    await this.almacen.guardar(clave, archivo.buffer, formato.mime);
    const [anterior] = await this.db.query(`SELECT foto_clave AS clave FROM usuarios WHERE id = $1`, [s.sub]);
    const r = await this.db.query(
      `UPDATE usuarios SET foto_clave = $2, foto_at = now() WHERE id = $1 RETURNING (extract(epoch FROM foto_at) * 1000)::bigint AS v`, [s.sub, clave],
    );
    if (anterior?.clave) await this.almacen.borrar(anterior.clave).catch(() => undefined);
    return { fotoVersion: Number((Array.isArray(r[0]) ? r[0] : r)[0].v) };
  }

  async quitarMia(s: SesionUsuario) {
    await this.quitar(s.sub);
    return { fotoVersion: null };
  }

  /** Back office: solo asesores y supervisores · Administración: cualquiera */
  async quitarDeOtro(id: string, s: SesionUsuario) {
    const [u] = await this.db.query(`SELECT r.codigo AS rol FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`, [id]);
    if (!u) throw new NotFoundException('El usuario no existe');
    if (s.rol !== 'ADMIN' && !['ASESOR', 'SUPERVISOR'].includes(u.rol)) throw new ForbiddenException('Solo administración puede quitar la foto de este usuario');
    await this.quitar(id);
    return { ok: true };
  }

  /** Cualquier usuario con sesión puede ver la foto de otro (sale en pantallas compartidas) */
  async leer(id: string) {
    const [u] = await this.db.query(`SELECT foto_clave AS clave FROM usuarios WHERE id = $1`, [id]);
    if (!u?.clave) throw new NotFoundException('Este usuario no tiene foto');
    const datos = await this.almacen.leer(u.clave);
    return { datos, mime: MIME[u.clave.split('.').pop() ?? ''] ?? 'application/octet-stream' };
  }

  private async quitar(id: string) {
    const [u] = await this.db.query(`SELECT foto_clave AS clave FROM usuarios WHERE id = $1`, [id]);
    await this.db.query(`UPDATE usuarios SET foto_clave = NULL, foto_at = NULL WHERE id = $1`, [id]);
    if (u?.clave) await this.almacen.borrar(u.clave).catch(() => undefined);
  }
}