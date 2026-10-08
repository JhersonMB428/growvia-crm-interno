import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { validarClave } from '../auth/clave';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { BitacoraService } from '../bitacora/bitacora.service';
import { CorreoService } from '../correo/correo.service';
import { ParametrosService } from '../sistema/parametros.service';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');

/** Mi perfil: datos, contraseña, avisos y equipos de confianza */
@Injectable()
export class PerfilService {
  constructor(
    private readonly db: DataSource,
    private readonly auth: AuthService,
    private readonly bitacora: BitacoraService,
    private readonly correo: CorreoService,
    private readonly parametros: ParametrosService,
  ) {}

  /** `huella` es el identificador de este navegador: sirve para marcar "este equipo" en la lista */
  async datos(s: SesionUsuario, huella?: string) {
    const [u] = await this.db.query(
      `SELECT u.nombres, u.apellidos, u.email, r.nombre AS rol, eq.nombre AS equipo,
              sup.nombres || ' ' || sup.apellidos AS supervisor,
              u.aviso_correo AS "avisoCorreo", u.minutos_recordatorio AS "minutosRecordatorio",
              u.credenciales_at AS "claveCambiada", u.created_at AS "creado"
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
       LEFT JOIN equipos eq ON eq.id = u.equipo_id LEFT JOIN usuarios sup ON sup.id = eq.supervisor_id
       WHERE u.id = $1`, [s.sub],
    );
    if (!u) throw new NotFoundException('Usuario no encontrado');
    const actual = huella ? hash(huella) : '';
    const dispositivos = await this.db.query(
      `SELECT id, COALESCE(nombre, 'Equipo sin nombre') AS nombre, created_at AS "creado", ultimo_uso_at AS "ultimoUso", expira_at AS "expira",
              huella_hash = $2 AS actual
       FROM dispositivos_confiables WHERE usuario_id = $1 AND revocado_at IS NULL AND expira_at > now()
       ORDER BY ultimo_uso_at DESC NULLS LAST`, [s.sub, actual],
    );
    return { ...u, dispositivos, diasConfianza: await this.parametros.numero('dias_dispositivo_confiable', 7) };
  }

  async cambiarClave(s: SesionUsuario, actual: string, nueva: string, huella: string | undefined, ip: string) {
    // Máximo 5 intentos fallidos cada 15 minutos (se cuentan en la bitácora)
    const [{ fallidos }] = await this.db.query(
      `SELECT count(*)::int AS fallidos FROM bitacora WHERE usuario_id = $1 AND accion = 'CLAVE_FALLIDA' AND created_at > now() - interval '15 minutes'`, [s.sub],
    );
    if (fallidos >= 5) throw new HttpException('Demasiados intentos. Espera 15 minutos y vuelve a probar.', HttpStatus.TOO_MANY_REQUESTS);

    const [u] = await this.db.query(`SELECT email, nombres, password_hash AS "hash" FROM usuarios WHERE id = $1`, [s.sub]);
    if (!(await bcrypt.compare(actual, u.hash))) {
      await this.bitacora.registrar(s.sub, 'CLAVE_FALLIDA', { ip });
      throw new BadRequestException('Tu contraseña actual no es correcta');
    }
    if (actual === nueva) throw new BadRequestException('La nueva contraseña debe ser distinta de la actual');
    validarClave(nueva, u.email, u.nombres);

    await this.db.transaction(async (tx) => {
      await tx.query(`UPDATE usuarios SET password_hash = $2, clave_temporal = false, credenciales_at = now(), updated_at = now() WHERE id = $1`, [s.sub, await bcrypt.hash(nueva, 12)]);
      // Los demás equipos de confianza vuelven a pedir código; este se queda
      await tx.query(
        `UPDATE dispositivos_confiables SET revocado_at = now() WHERE usuario_id = $1 AND revocado_at IS NULL AND huella_hash <> $2`,
        [s.sub, huella ? hash(huella) : ''],
      );
    });
    await this.correo.enviar(u.email, 'Tu contraseña del CRM cambió',
      `Hola ${u.nombres}:\n\nTu contraseña del CRM de Growvia acaba de cambiar. Se cerraron las sesiones en tus otros equipos.\n\n` +
      `Si no fuiste tú, avisa de inmediato a tu supervisor.\n\nGrowvia CRM`).catch(() => undefined);
    // Esta sesión sigue: se entrega un token nuevo (los anteriores dejan de valer)
    return this.auth.emitirSesion(s.sub);
  }

  async guardarAvisos(s: SesionUsuario, avisoCorreo: boolean, minutosRecordatorio: number) {
    await this.db.query(
      `UPDATE usuarios SET aviso_correo = $2, minutos_recordatorio = $3, updated_at = now() WHERE id = $1`, [s.sub, avisoCorreo, minutosRecordatorio],
    );
    return { avisoCorreo, minutosRecordatorio };
  }

  async quitarDispositivo(s: SesionUsuario, id: string) {
    const r = await this.db.query(
      `UPDATE dispositivos_confiables SET revocado_at = now() WHERE id = $1 AND usuario_id = $2 AND revocado_at IS NULL RETURNING id`, [id, s.sub],
    );
    if (!(Array.isArray(r[0]) ? r[0] : r).length) throw new NotFoundException('Ese equipo ya no está en tu lista');
    return { ok: true };
  }

  async quitarTodos(s: SesionUsuario) {
    await this.db.query(`UPDATE dispositivos_confiables SET revocado_at = now() WHERE usuario_id = $1 AND revocado_at IS NULL`, [s.sub]);
    return { ok: true };
  }
}