import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { CorreoService } from '../correo/correo.service';
import { ParametrosService } from '../sistema/parametros.service';

/** Back office solo administra asesores y supervisores; administración, todos los roles */
const ROLES_BACKOFFICE = ['ASESOR', 'SUPERVISOR'];
/** Roles que pueden tener empresas a cargo */
const ROLES_CARTERA = ['ASESOR', 'SUPERVISOR'];

/** TypeORM devuelve [filas, cantidad] en UPDATE ... RETURNING */
const filasDe = <T>(x: unknown[]): T[] => (Array.isArray(x[0]) ? x[0] : x) as T[];

/** Contraseña temporal legible (sin 0/O, 1/l/I) con letras y números */
function claveTemporal() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numeros = '23456789';
  const todo = letras + numeros;
  let c = letras[randomInt(letras.length)] + numeros[randomInt(numeros.length)];
  while (c.length < 12) c += todo[randomInt(todo.length)];
  return c.split('').sort(() => randomInt(3) - 1).join('');
}

export interface DatosUsuario { nombres: string; apellidos: string; email: string; rol: string; equipoId?: string | null }

/** Usuarios y equipos (administración y back office) */
@Injectable()
export class AdminUsuariosService {
  constructor(
    private readonly db: DataSource,
    private readonly correo: CorreoService,
    private readonly parametros: ParametrosService,
    private readonly config: ConfigService,
  ) {}

  private puedeGestionar(s: SesionUsuario, rol: string) {
    return s.rol === 'ADMIN' || ROLES_BACKOFFICE.includes(rol);
  }

  // ───────────── Usuarios ─────────────
  async catalogos(s: SesionUsuario) {
    const roles = (await this.db.query(`SELECT codigo, nombre FROM roles ORDER BY id`))
      .filter((r: { codigo: string }) => this.puedeGestionar(s, r.codigo));
    const equipos = await this.db.query(
      `SELECT e.id, e.nombre, e.supervisor_id AS "supervisorId" FROM equipos e WHERE e.activo ORDER BY e.nombre`,
    );
    // A quién se le pueden pasar las empresas de alguien que se va
    const cartera = await this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre, eq.nombre AS equipo
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos eq ON eq.id = u.equipo_id
       WHERE u.activo AND r.codigo = ANY($1) ORDER BY u.nombres`, [ROLES_CARTERA],
    );
    return { roles, equipos, cartera };
  }

  async listar(f: { q?: string; rol?: string; equipoId?: string; estado?: string }, s: SesionUsuario) {
    const cond: string[] = [];
    const p: unknown[] = [];
    if (f.q) { p.push(`%${f.q.trim().toLowerCase()}%`); cond.push(`(lower(u.nombres || ' ' || u.apellidos) LIKE $${p.length} OR lower(u.email) LIKE $${p.length})`); }
    if (f.rol) { p.push(f.rol); cond.push(`r.codigo = $${p.length}`); }
    if (f.equipoId) { p.push(f.equipoId); cond.push(`u.equipo_id = $${p.length}`); }
    if (f.estado !== 'todos') cond.push(f.estado === 'inactivos' ? 'NOT u.activo' : 'u.activo');
    const filas = await this.db.query(
      `SELECT u.id, u.nombres, u.apellidos, u.email, r.codigo AS rol, r.nombre AS "rolNombre", u.equipo_id AS "equipoId", eq.nombre AS equipo,
              u.activo, u.clave_temporal AS "claveTemporal", u.created_at AS creado,
              floor(extract(epoch FROM u.foto_at) * 1000)::float8 AS "fotoVersion",
              (eq.supervisor_id = u.id) AS "esSupervisorDelEquipo",
              (SELECT max(b.created_at) FROM bitacora b WHERE b.usuario_id = u.id AND b.accion = 'LOGIN') AS "ultimoIngreso",
              (SELECT count(*)::int FROM clientes c WHERE c.asesor_id = u.id) AS empresas
       FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos eq ON eq.id = u.equipo_id
       ${cond.length ? `WHERE ${cond.join(' AND ')}` : ''}
       ORDER BY u.activo DESC, r.id, u.nombres LIMIT 300`, p,
    );
    return filas.map((u: { rol: string; id: string }) => ({ ...u, editable: this.puedeGestionar(s, u.rol), soyYo: u.id === s.sub }));
  }

  async crear(d: DatosUsuario, s: SesionUsuario) {
    if (!this.puedeGestionar(s, d.rol)) throw new ForbiddenException('No puedes crear usuarios con ese rol');
    if (d.rol === 'ASESOR' && !d.equipoId) throw new BadRequestException('Elige el equipo del asesor');
    const clave = claveTemporal();
    const minutos = await this.parametros.numero('minutos_recordatorio_defecto', 30);
    let id: string;
    try {
      id = await this.db.transaction(async (tx) => {
        const [u] = await tx.query(
          `INSERT INTO usuarios (nombres, apellidos, email, password_hash, rol_id, equipo_id, clave_temporal, minutos_recordatorio, creado_por)
           VALUES ($1, $2, lower($3), $4, (SELECT id FROM roles WHERE codigo = $5), $6, true, $7, $8) RETURNING id`,
          [d.nombres.trim(), d.apellidos.trim(), d.email.trim(), await bcrypt.hash(clave, 12), d.rol, d.equipoId ?? null, minutos, s.sub],
        );
        if (d.equipoId) await this.registrarEquipo(tx, u.id, null, d.equipoId, s);
        if (d.rol === 'SUPERVISOR' && d.equipoId) await this.ponerSupervisor(tx, d.equipoId, u.id, s);
        return u.id as string;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Ya existe un usuario con ese correo');
      throw e;
    }
    await this.enviarClave(d.email, d.nombres, clave, true);
    return { id, claveTemporal: clave };
  }

  async editar(id: string, d: DatosUsuario, s: SesionUsuario) {
    const u = await this.cargar(id);
    if (!this.puedeGestionar(s, u.rol) || !this.puedeGestionar(s, d.rol)) throw new ForbiddenException('No puedes editar usuarios con ese rol');
    if (id === s.sub && d.rol !== u.rol) throw new BadRequestException('No puedes cambiar tu propio rol');
    if (d.rol === 'ASESOR' && !d.equipoId) throw new BadRequestException('Elige el equipo del asesor');
    if (ROLES_CARTERA.includes(u.rol) && !ROLES_CARTERA.includes(d.rol) && u.empresas > 0) {
      throw new BadRequestException(`Tiene ${u.empresas} empresas a cargo. Reasígnalas (desactivándolo) antes de cambiarle el rol.`);
    }
    const equipoNuevo = d.equipoId ?? null;
    const cambiaAcceso = d.rol !== u.rol || equipoNuevo !== u.equipoId;
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          `UPDATE usuarios SET nombres = $2, apellidos = $3, email = lower($4), rol_id = (SELECT id FROM roles WHERE codigo = $5), equipo_id = $6,
                  credenciales_at = CASE WHEN $7 THEN now() ELSE credenciales_at END, updated_at = now()
           WHERE id = $1`,
          [id, d.nombres.trim(), d.apellidos.trim(), d.email.trim(), d.rol, equipoNuevo, cambiaAcceso],
        );
        if (equipoNuevo !== u.equipoId) await this.registrarEquipo(tx, id, u.equipoId, equipoNuevo, s);
        // Si deja de ser supervisor o cambia de equipo, deja de dirigir el anterior
        if (d.rol !== 'SUPERVISOR' || equipoNuevo !== u.equipoId) {
          await tx.query(`UPDATE equipos SET supervisor_id = NULL WHERE supervisor_id = $1 AND id IS DISTINCT FROM $2`, [id, d.rol === 'SUPERVISOR' ? equipoNuevo : null]);
        }
        if (d.rol === 'SUPERVISOR' && equipoNuevo) await this.ponerSupervisor(tx, equipoNuevo, id, s);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Ya existe un usuario con ese correo');
      throw e;
    }
    return { ok: true, debeVolverAEntrar: cambiaAcceso };
  }

  /** Nueva contraseña temporal: se cierran sus sesiones y equipos de confianza */
  async restablecerClave(id: string, s: SesionUsuario) {
    const u = await this.cargar(id);
    if (!this.puedeGestionar(s, u.rol)) throw new ForbiddenException('No puedes restablecer la contraseña de ese usuario');
    if (!u.activo) throw new BadRequestException('El usuario está desactivado');
    const clave = claveTemporal();
    await this.db.transaction(async (tx) => {
      await tx.query(
        `UPDATE usuarios SET password_hash = $2, clave_temporal = true, credenciales_at = now(), updated_at = now() WHERE id = $1`,
        [id, await bcrypt.hash(clave, 12)],
      );
      await tx.query(`UPDATE dispositivos_confiables SET revocado_at = now() WHERE usuario_id = $1 AND revocado_at IS NULL`, [id]);
    });
    await this.enviarClave(u.email, u.nombres, clave, false);
    return { claveTemporal: clave };
  }

  /**
   * Desactiva a alguien que se va. Sus empresas pasan a otro asesor (con sus negociaciones abiertas y ventas observadas)
   * o vuelven al repositorio (sus negociaciones abiertas se cierran como perdidas).
   */
  async desactivar(id: string, destino: string | undefined, s: SesionUsuario) {
    if (id === s.sub) throw new BadRequestException('No puedes desactivarte a ti mismo');
    const u = await this.cargar(id);
    if (!this.puedeGestionar(s, u.rol)) throw new ForbiddenException('No puedes desactivar a ese usuario');
    if (!u.activo) throw new BadRequestException('El usuario ya está desactivado');

    const [{ observadas }] = await this.db.query(
      `SELECT count(*)::int AS observadas FROM oportunidades WHERE asesor_id = $1 AND estado_venta = 'OBSERVADA'`, [id],
    );
    if ((u.empresas > 0 || observadas > 0) && !destino) throw new BadRequestException('Elige a quién pasan sus empresas o si vuelven al repositorio');
    if (destino === 'repositorio' && observadas > 0) {
      throw new BadRequestException(`Tiene ${observadas} ventas observadas por corregir: pásalas a otro asesor.`);
    }
    if (destino && destino !== 'repositorio') {
      const [d] = await this.db.query(
        `SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 AND u.activo AND r.codigo = ANY($2) AND u.id <> $3`,
        [destino, ROLES_CARTERA, id],
      );
      if (!d) throw new BadRequestException('Elige un asesor o supervisor activo para sus empresas');
    }

    const resumen = await this.db.transaction(async (tx) => {
      let empresas = 0;
      let negociaciones = 0;
      if (destino && destino !== 'repositorio') {
        const movidas = filasDe<{ id: string }>(await tx.query(
          `UPDATE clientes SET asesor_id = $2, asignado_at = now(), updated_at = now() WHERE asesor_id = $1 RETURNING id`, [id, destino],
        ));
        empresas = movidas.length;
        await tx.query(
          `INSERT INTO asignaciones (cliente_id, asesor_anterior, asesor_nuevo, motivo, asignado_por)
           SELECT unnest($1::uuid[]), $2, $3, 'REASIGNACION', $4`, [movidas.map((m) => m.id), id, destino, s.sub],
        );
        negociaciones = filasDe(await tx.query(
          `UPDATE oportunidades SET asesor_id = $2, updated_at = now()
           WHERE asesor_id = $1 AND (resultado = 'EN_CURSO' OR estado_venta = 'OBSERVADA') RETURNING id`, [id, destino],
        )).length;
      } else if (destino === 'repositorio') {
        const abiertas = filasDe<{ id: string; etapa: string }>(await tx.query(
          `UPDATE oportunidades SET resultado = 'PERDIDA', motivo_perdida = 'Asesor dado de baja', fecha_cierre = now(), updated_at = now()
           WHERE asesor_id = $1 AND resultado = 'EN_CURSO' RETURNING id, etapa`, [id],
        ));
        negociaciones = abiertas.length;
        for (const o of abiertas) {
          await tx.query(
            `INSERT INTO historial_etapas (oportunidad_id, etapa_anterior, etapa_nueva, detalle, usuario_id) VALUES ($1, $2, $2, 'Cerrada: asesor dado de baja', $3)`,
            [o.id, o.etapa, s.sub],
          );
        }
        const liberadas = filasDe<{ id: string }>(await tx.query(
          `UPDATE clientes SET asesor_id = NULL, asignado_at = NULL, updated_at = now() WHERE asesor_id = $1 RETURNING id`, [id],
        ));
        empresas = liberadas.length;
        await tx.query(
          `INSERT INTO asignaciones (cliente_id, asesor_anterior, motivo, asignado_por) SELECT unnest($1::uuid[]), $2, 'LIBERACION', $3`,
          [liberadas.map((l) => l.id), id, s.sub],
        );
      }
      await tx.query(`UPDATE usuarios SET activo = false, credenciales_at = now(), updated_at = now() WHERE id = $1`, [id]);
      await tx.query(`UPDATE equipos SET supervisor_id = NULL WHERE supervisor_id = $1`, [id]);
      await tx.query(`UPDATE dispositivos_confiables SET revocado_at = now() WHERE usuario_id = $1 AND revocado_at IS NULL`, [id]);
      await tx.query(`UPDATE accesos_moviles SET estado = 'REVOCADA', revocado_por = $2, revocado_at = now() WHERE usuario_id = $1 AND estado = 'APROBADA'`, [id, s.sub]);
      await tx.query(`UPDATE accesos_moviles SET estado = 'RECHAZADA', respuesta = 'Usuario desactivado', respondido_at = now() WHERE usuario_id = $1 AND estado = 'PENDIENTE'`, [id]);
      return { empresas, negociaciones };
    });
    return { ok: true, ...resumen };
  }

  async reactivar(id: string, s: SesionUsuario) {
    const u = await this.cargar(id);
    if (!this.puedeGestionar(s, u.rol)) throw new ForbiddenException('No puedes reactivar a ese usuario');
    await this.db.query(`UPDATE usuarios SET activo = true, updated_at = now() WHERE id = $1`, [id]);
    return { ok: true };
  }

  // ───────────── Equipos ─────────────
  async listarEquipos() {
    const equipos = await this.db.query(
      `SELECT e.id, e.nombre, e.activo, e.supervisor_id AS "supervisorId", s.nombres || ' ' || s.apellidos AS supervisor,
              (SELECT count(*)::int FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.equipo_id = e.id AND u.activo AND r.codigo = 'ASESOR') AS asesores,
              (SELECT string_agg(u.nombres || ' ' || u.apellidos, ', ' ORDER BY u.nombres) FROM usuarios u JOIN roles r ON r.id = u.rol_id
               WHERE u.equipo_id = e.id AND u.activo AND r.codigo = 'ASESOR') AS integrantes
       FROM equipos e LEFT JOIN usuarios s ON s.id = e.supervisor_id ORDER BY e.activo DESC, e.nombre`,
    );
    const supervisores = await this.db.query(
      `SELECT u.id, u.nombres || ' ' || u.apellidos AS nombre FROM usuarios u JOIN roles r ON r.id = u.rol_id
       WHERE u.activo AND r.codigo = 'SUPERVISOR' ORDER BY u.nombres`,
    );
    return { equipos, supervisores };
  }

  async guardarEquipo(id: string | null, nombre: string, supervisorId: string | null, activo: boolean, s: SesionUsuario) {
    try {
      await this.db.transaction(async (tx) => {
        let equipoId = id;
        if (!equipoId) {
          [{ id: equipoId }] = await tx.query(`INSERT INTO equipos (nombre) VALUES ($1) RETURNING id`, [nombre.trim()]);
        } else {
          const [e] = await tx.query(`SELECT activo FROM equipos WHERE id = $1 FOR UPDATE`, [equipoId]);
          if (!e) throw new NotFoundException('El equipo no existe');
          if (!activo) {
            // Cuenta a los integrantes; su supervisor queda sin equipo al desactivarlo
            const [{ n }] = await tx.query(
              `SELECT count(*)::int AS n FROM usuarios WHERE equipo_id = $1 AND activo
                 AND id IS DISTINCT FROM (SELECT supervisor_id FROM equipos WHERE id = $1)`, [equipoId],
            );
            if (n > 0) throw new BadRequestException(`El equipo tiene ${n} integrantes activos: muévelos a otro equipo antes de desactivarlo.`);
          }
          await tx.query(`UPDATE equipos SET nombre = $2, activo = $3 WHERE id = $1`, [equipoId, nombre.trim(), activo]);
        }
        await this.ponerSupervisor(tx, equipoId!, activo ? supervisorId : null, s);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '23505') throw new ConflictException('Ya existe un equipo con ese nombre');
      throw e;
    }
    return this.listarEquipos();
  }

  // ───────────── Ayudantes ─────────────
  private async cargar(id: string) {
    const [u] = await this.db.query(
      `SELECT u.id, u.email, u.nombres, u.activo, u.equipo_id AS "equipoId", r.codigo AS rol,
              (SELECT count(*)::int FROM clientes c WHERE c.asesor_id = u.id) AS empresas
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`, [id],
    );
    if (!u) throw new NotFoundException('El usuario no existe');
    return u as { id: string; email: string; nombres: string; activo: boolean; equipoId: string | null; rol: string; empresas: number };
  }

  /** El supervisor de un equipo también pertenece a él (así ve sus aprobaciones). Quien deja de serlo vuelve a entrar. */
  private async ponerSupervisor(tx: EntityManager, equipoId: string, usuarioId: string | null, s: SesionUsuario) {
    const [e] = await tx.query(`SELECT supervisor_id AS "actual" FROM equipos WHERE id = $1`, [equipoId]);
    if (e?.actual === usuarioId) return;
    if (usuarioId) {
      const [u] = await tx.query(
        `SELECT u.equipo_id AS "equipoId" FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1 AND u.activo AND r.codigo = 'SUPERVISOR'`, [usuarioId],
      );
      if (!u) throw new BadRequestException('El supervisor debe ser un usuario activo con rol Supervisor');
      await tx.query(`UPDATE equipos SET supervisor_id = NULL WHERE supervisor_id = $1`, [usuarioId]);
      if (u.equipoId !== equipoId) {
        await tx.query(`UPDATE usuarios SET equipo_id = $2, credenciales_at = now() WHERE id = $1`, [usuarioId, equipoId]);
        await this.registrarEquipo(tx, usuarioId, u.equipoId, equipoId, s);
      }
    }
    if (e?.actual) {
      // El supervisor anterior queda sin equipo
      await tx.query(`UPDATE usuarios SET equipo_id = NULL, credenciales_at = now() WHERE id = $1 AND equipo_id = $2`, [e.actual, equipoId]);
      await this.registrarEquipo(tx, e.actual, equipoId, null, s);
    }
    await tx.query(`UPDATE equipos SET supervisor_id = $2 WHERE id = $1`, [equipoId, usuarioId]);
  }

  private registrarEquipo(tx: EntityManager, usuarioId: string, anterior: string | null, nuevo: string | null, s: SesionUsuario) {
    return tx.query(
      `INSERT INTO historial_equipos (usuario_id, equipo_anterior, equipo_nuevo, cambiado_por) VALUES ($1, $2, $3, $4)`, [usuarioId, anterior, nuevo, s.sub],
    );
  }

  private async enviarClave(email: string, nombres: string, clave: string, nuevo: boolean) {
    const url = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
    const asunto = nuevo ? 'Tu acceso al CRM de Growvia' : 'Tu contraseña del CRM fue restablecida';
    await this.correo.enviar(email, asunto,
      `Hola ${nombres}:\n\n${nuevo ? 'Ya tienes usuario en el CRM de Growvia.' : 'Restablecieron tu contraseña del CRM.'}\n\n` +
      `Ingresa en ${url} con tu correo y esta contraseña temporal:\n\n${clave}\n\n` +
      `Al entrar, el CRM te pedirá elegir una contraseña propia. No la compartas con nadie.\n\nGrowvia CRM`,
    ).catch(() => undefined);
  }
}