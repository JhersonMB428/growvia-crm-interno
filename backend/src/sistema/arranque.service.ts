import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { enProduccion } from '../produccion';

/** Hash de "Growvia2026!", la contraseña de los usuarios de prueba que crea la migración DatosIniciales */
const HASH_PRUEBA = '$2b$10$BRljbSOZFqR1pvrdsRoz.e0pU3RKnaNd9lk7m7cs1KEmfk.H.e22a';
const ADMIN_PRUEBA = 'admin@growvia.global';

/**
 * Al arrancar en Azure: nadie puede entrar con la contraseña de prueba.
 *  - El administrador queda con contraseña temporal (debe cambiarla al entrar) y, si existe
 *    CORREO_ADMIN_INICIAL, pasa a ese correo real para poder recibir el código de ingreso.
 *  - Los demás usuarios de prueba (María, Carlos, Lucía, Rosa) quedan desactivados.
 * En desarrollo no hace nada.
 */
@Injectable()
export class ArranqueService implements OnApplicationBootstrap {
  private readonly log = new Logger('Arranque');

  constructor(private readonly db: DataSource) {}

  async onApplicationBootstrap() {
    if (!enProduccion()) return;

    const correoAdmin = process.env.CORREO_ADMIN_INICIAL?.trim().toLowerCase();
    if (correoAdmin && correoAdmin !== ADMIN_PRUEBA) {
      const [ocupado] = await this.db.query(`SELECT 1 FROM usuarios WHERE lower(email) = $1`, [correoAdmin]);
      if (!ocupado) {
        const r = await this.db.query(
          `UPDATE usuarios SET email = $1 WHERE email = $2 AND password_hash = $3 RETURNING id`,
          [correoAdmin, ADMIN_PRUEBA, HASH_PRUEBA],
        );
        if ((Array.isArray(r[0]) ? r[0] : r).length) this.log.log(`El administrador inicial ahora usa ${correoAdmin}`);
      }
    }

    // Administrador: debe cambiar la contraseña de prueba en su primer ingreso
    await this.db.query(
      `UPDATE usuarios u SET clave_temporal = true
       FROM roles r WHERE r.id = u.rol_id AND r.codigo = 'ADMIN' AND u.password_hash = $1 AND NOT u.clave_temporal`,
      [HASH_PRUEBA],
    );

    // Resto de usuarios de prueba: fuera
    const r = await this.db.query(
      `UPDATE usuarios u SET activo = false, credenciales_at = now()
       FROM roles r WHERE r.id = u.rol_id AND r.codigo <> 'ADMIN' AND u.password_hash = $1 AND u.activo
       RETURNING u.id`,
      [HASH_PRUEBA],
    );
    const fuera: { id: string }[] = Array.isArray(r[0]) ? r[0] : r;
    if (fuera.length) {
      await this.db.query(`UPDATE equipos SET supervisor_id = NULL WHERE supervisor_id = ANY($1::uuid[])`, [fuera.map((u) => u.id)]);
      this.log.warn(`Se desactivaron ${fuera.length} usuarios de prueba (contraseña conocida)`);
    }
  }
}