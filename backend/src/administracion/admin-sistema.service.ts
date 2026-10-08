import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { ParametrosService } from '../sistema/parametros.service';

const filasDe = <T>(x: unknown[]): T[] => (Array.isArray(x[0]) ? x[0] : x) as T[];
const duplicado = (e: unknown, msg: string) => {
  if ((e as { code?: string }).code === '23505') throw new ConflictException(msg);
  throw e;
};

/** Planes, operadores y parámetros del sistema (solo administración) */
@Injectable()
export class AdminSistemaService {
  constructor(private readonly db: DataSource, private readonly parametros: ParametrosService) {}

  // ───────────── Planes y operadores ─────────────
  async catalogo() {
    const planes = await this.db.query(
      `SELECT p.id, p.tipo, p.nombre, p.cargo_ref::float8 AS "cargoRef", p.activo,
              (SELECT count(*)::int FROM oportunidad_items i WHERE i.plan_id = p.id) AS usos
       FROM planes_servicio p ORDER BY p.tipo DESC, p.activo DESC, p.nombre`,
    );
    const operadores = await this.db.query(
      `SELECT o.id, o.nombre, o.activo, (SELECT count(*)::int FROM oportunidad_items i WHERE i.operador_origen_id = o.id) AS usos
       FROM operadores o ORDER BY o.activo DESC, o.nombre`,
    );
    return { planes, operadores };
  }

  async guardarPlan(id: number | null, tipo: string, nombre: string, cargoRef: number, activo: boolean) {
    try {
      if (id) {
        const r = filasDe(await this.db.query(
          `UPDATE planes_servicio SET nombre = $2, cargo_ref = $3, activo = $4 WHERE id = $1 RETURNING id`, [id, nombre.trim(), cargoRef, activo],
        ));
        if (!r.length) throw new NotFoundException('El plan no existe');
      } else {
        await this.db.query(`INSERT INTO planes_servicio (tipo, nombre, cargo_ref) VALUES ($1, $2, $3)`, [tipo, nombre.trim(), cargoRef]);
      }
    } catch (e) { duplicado(e, 'Ya existe un plan con ese nombre'); }
    return this.catalogo();
  }

  async guardarOperador(id: number | null, nombre: string, activo: boolean) {
    try {
      if (id) {
        const r = filasDe(await this.db.query(`UPDATE operadores SET nombre = $2, activo = $3 WHERE id = $1 RETURNING id`, [id, nombre.trim(), activo]));
        if (!r.length) throw new NotFoundException('El operador no existe');
      } else {
        await this.db.query(`INSERT INTO operadores (nombre) VALUES ($1)`, [nombre.trim()]);
      }
    } catch (e) { duplicado(e, 'Ya existe un operador con ese nombre'); }
    return this.catalogo();
  }

  // ───────────── Parámetros ─────────────
  listarParametros() {
    return this.db.query(
      `SELECT p.clave, p.valor, p.descripcion, p.tipo, p.minimo, p.maximo, p.editable, p.updated_at AS "actualizado",
              u.nombres || ' ' || u.apellidos AS "actualizadoPor"
       FROM parametros p LEFT JOIN usuarios u ON u.id = p.actualizado_por ORDER BY p.editable DESC, p.clave`,
    );
  }

  async guardarParametro(clave: string, valor: string, s: SesionUsuario) {
    const [p] = await this.db.query(`SELECT tipo, minimo, maximo, editable FROM parametros WHERE clave = $1`, [clave]);
    if (!p) throw new NotFoundException('El parámetro no existe');
    if (!p.editable) throw new BadRequestException('Este parámetro no se puede cambiar desde aquí');
    const v = valor.trim();
    if (p.tipo === 'hora') {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new BadRequestException('Escribe la hora como HH:MM (ej. 08:00)');
    } else {
      if (!/^\d+$/.test(v)) throw new BadRequestException('Escribe un número entero');
      const n = Number(v);
      if ((p.minimo !== null && n < p.minimo) || (p.maximo !== null && n > p.maximo)) {
        throw new BadRequestException(`El valor debe estar entre ${p.minimo} y ${p.maximo}`);
      }
    }
    await this.db.query(`UPDATE parametros SET valor = $2, actualizado_por = $3, updated_at = now() WHERE clave = $1`, [clave, v, s.sub]);
    this.parametros.limpiar(clave);
    return this.listarParametros();
  }
}