import { HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { errorRuc } from '../empresas/ruc';

export interface Representante { nombre: string; tipoDocumento: string | null; documento: string | null; dni: string | null; cargo: string | null; desde: string | null }
export interface DatosSunat {
  ruc: string; razonSocial: string | null; estado: string | null; condicion: string | null; direccion: string | null;
  /** Distrito del CRM (código ubigeo) si se pudo ubicar con lo que devuelve SUNAT */
  distritoId: string | null; ubicacion: string | null;
  representantes: Representante[];
  /** Hay algo que advertir: baja, suspensión, no habido… */
  alerta: string | null;
}

/** Texto limpio aunque la API mande números, null u otra cosa */
const txt = (v: unknown): string => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).replace(/\s+/g, ' ').trim());
/** La API puede devolver un objeto, una lista o el objeto dentro de otra clave */
const primero = (d: unknown): Record<string, unknown> => {
  const x = Array.isArray(d) ? d[0] : d;
  return x && typeof x === 'object' ? x as Record<string, unknown> : {};
};
const lista = (d: unknown): Record<string, unknown>[] => {
  if (Array.isArray(d)) return d.filter((x) => x && typeof x === 'object');
  if (d && typeof d === 'object') {
    const dentro = Object.values(d).find(Array.isArray);
    if (dentro) return (dentro as unknown[]).filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  }
  return [];
};
const sinTildes = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

/**
 * Consulta de RUC en SUNAT a través de apiconsulta.dev (https://docs.apiconsulta.dev).
 * Solo funciona si está configurado APICONSULTA_TOKEN; sin token el CRM sigue igual y el botón no aparece.
 * Cada consulta exitosa gasta 1 consulta del plan: se guarda 30 min en memoria y hay un tope diario.
 */
@Injectable()
export class SunatService {
  private readonly log = new Logger('SUNAT');
  private readonly cache = new Map<string, { datos: DatosSunat; hasta: number }>();
  private trabajando = false;
  /** Consultas hechas hoy en esta instancia (también cuentan las de RUC que aún no están en el CRM) */
  private hoy = { dia: '', n: 0 };

  constructor(private readonly config: ConfigService, private readonly db: DataSource) {}

  get activo() { return !!this.config.get<string>('APICONSULTA_TOKEN'); }
  private get base() { return (this.config.get<string>('APICONSULTA_URL') || 'https://api.apiconsulta.dev').replace(/\/$/, ''); }
  private get maxDia() { return Number(this.config.get('APICONSULTA_MAX_DIA') ?? 300) || 300; }

  /** Datos de SUNAT de un RUC: empresa y representantes legales */
  async consultar(ruc: string): Promise<DatosSunat> {
    try {
      return await this.consultarSinControl(ruc);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      // Algo inesperado en la respuesta: se registra para revisarlo y la ejecutiva ve un mensaje claro
      this.log.error(`Error al leer la respuesta de SUNAT para ${ruc}: ${(e as Error)?.stack ?? e}`);
      throw new ServiceUnavailableException('No se pudo leer la respuesta de SUNAT. Completa los datos a mano y avisa a soporte.');
    }
  }

  private async consultarSinControl(ruc: string): Promise<DatosSunat> {
    // Solo el formato: las empresas antiguas del CRM pueden tener RUC sin dígito verificador válido (SUNAT dirá si existe)
    if (!/^(10|20)\d{9}$/.test(ruc)) throw new NotFoundException(errorRuc(ruc) ?? 'RUC no válido');
    if (!this.activo) throw new ServiceUnavailableException('La consulta a SUNAT no está configurada en este CRM');
    const guardado = this.cache.get(ruc);
    if (guardado && guardado.hasta > Date.now()) return guardado.datos;
    if ((await this.consultasDeHoy()) >= this.maxDia) {
      throw new ServiceUnavailableException('Se alcanzó el tope de consultas a SUNAT de hoy. Vuelve a intentarlo mañana.');
    }

    const dia = this.diaLima();
    this.hoy = { dia, n: (this.hoy.dia === dia ? this.hoy.n : 0) + 1 };
    const [empresa, reps] = await Promise.all([this.llamar('/ruc', ruc), this.llamar('/ruc-representantes', ruc).catch((err) => { this.log.warn(`Representantes de ${ruc}: ${(err as Error)?.message}`); return []; })]);
    const e = primero(empresa);
    const ubic = await this.ubicar({ ubigeo: txt(e.ubigeo), departamento: txt(e.departamento), provincia: txt(e.provincia), distrito: txt(e.distrito) });
    const estado = txt(e.estado).toUpperCase() || null;
    const condicion = txt(e.condicion).toUpperCase() || null;
    const datos: DatosSunat = {
      ruc,
      razonSocial: txt(e.nombre_o_razon_social ?? e.razon_social ?? e.nombre) || null,
      estado, condicion,
      direccion: txt(e.direccion) || null,
      distritoId: ubic?.id ?? null, ubicacion: ubic?.texto ?? null,
      representantes: lista(reps).map((r) => {
        const doc = txt(r.numero_de_documento ?? r.numero_documento ?? r.documento).replace(/\D/g, '');
        const tipo = txt(r.tipo_de_documento ?? r.tipo_documento).toUpperCase() || null;
        return {
          nombre: txt(r.nombre ?? r.nombres),
          tipoDocumento: tipo, documento: doc || null,
          dni: (tipo === null || tipo.includes('DNI') || tipo.includes('IDENTIDAD')) && /^\d{8}$/.test(doc) ? doc : null,
          cargo: txt(r.cargo) || null, desde: txt(r.fecha_desde ?? r.desde) || null,
        };
      }).filter((r) => r.nombre),
      alerta: estado && estado !== 'ACTIVO' ? `En SUNAT figura como ${estado.toLowerCase()}: probablemente ya no opera`
        : condicion && condicion !== 'HABIDO' ? `En SUNAT figura como ${condicion.toLowerCase()}: su dirección no se pudo verificar` : null,
    };
    this.cache.set(ruc, { datos, hasta: Date.now() + 30 * 60_000 });
    // Si la empresa ya está en el CRM, se guarda lo que dijo SUNAT
    await this.db.query(
      `UPDATE clientes SET sunat_estado = $2, sunat_condicion = $3, sunat_consultado_at = now() WHERE ruc = $1`,
      [ruc, estado, condicion],
    );
    return datos;
  }

  /** Representante que conviene registrar: gerente general primero, luego el más antiguo con DNI */
  static principal(reps: Representante[]): Representante | null {
    const conDni = reps.filter((r) => r.dni);
    const lista = conDni.length ? conDni : reps;
    return lista.find((r) => /GERENTE GENERAL|GERENTE/.test(sinTildes(r.cargo))) ?? lista.find((r) => /TITULAR|PRESIDENTE|ADMINISTRADOR/.test(sinTildes(r.cargo))) ?? lista[0] ?? null;
  }

  /**
   * Cola: empresas que llegaron por bases sin representante legal (o sin su DNI).
   * Cada 5 minutos se completan hasta 20, sin pasar el tope diario.
   */
  @Cron('30 */5 * * * *', { timeZone: 'America/Lima' })
  async completarPendientes() {
    if (!this.activo || this.trabajando) return;
    this.trabajando = true;
    try {
      const libres = this.maxDia - (await this.consultasDeHoy());
      if (libres <= 0) return;
      const pendientes: { id: string; ruc: string }[] = await this.db.query(
        `SELECT id, ruc FROM clientes WHERE sunat_pendiente ORDER BY created_at LIMIT $1`, [Math.min(20, libres)],
      );
      for (const p of pendientes) {
        try {
          const d = await this.consultar(p.ruc);
          await this.completarEmpresa(p.id, d);
        } catch (e) {
          if (e instanceof ServiceUnavailableException) break; // SUNAT caído o tope: se reintenta en la próxima vuelta
          await this.db.query(`UPDATE clientes SET sunat_pendiente = false, sunat_consultado_at = now(), sunat_estado = COALESCE(sunat_estado, 'NO ENCONTRADO') WHERE id = $1`, [p.id]);
        }
      }
    } finally {
      this.trabajando = false;
    }
  }

  /** Completa (sin pisar lo que ya hay) el representante, su DNI y la ubicación de una empresa del CRM */
  async completarEmpresa(clienteId: string, d: DatosSunat) {
    const rep = SunatService.principal(d.representantes);
    await this.db.transaction(async (tx) => {
      if (d.distritoId) await tx.query(`UPDATE clientes SET distrito_id = COALESCE(distrito_id, $2) WHERE id = $1`, [clienteId, d.distritoId]);
      if (rep) {
        const [actual] = await tx.query(`SELECT id, nombre, dni FROM contactos WHERE cliente_id = $1 AND posicion = 1`, [clienteId]);
        if (!actual) {
          await tx.query(
            `INSERT INTO contactos (cliente_id, nombre, celular, correo, dni, posicion) VALUES ($1, $2, NULL, NULL, $3, 1)`,
            [clienteId, rep.nombre.slice(0, 100), rep.dni],
          );
        } else if (!actual.dni && rep.dni) {
          // Solo se pone el DNI si el nombre registrado es el mismo representante
          const igual = SunatService.mismoNombre(actual.nombre, rep.nombre);
          if (igual) await tx.query(`UPDATE contactos SET dni = $2 WHERE id = $1`, [actual.id, rep.dni]);
        }
      }
      await tx.query(`UPDATE clientes SET sunat_pendiente = false WHERE id = $1`, [clienteId]);
    });
  }

  /** "PEREZ ROJAS JUAN" y "Juan Pérez Rojas" son la misma persona */
  static mismoNombre(a: string, b: string) {
    const partes = (t: string) => sinTildes(t).replace(/[^A-Z ]/g, '').split(' ').filter((p) => p.length > 1).sort().join(' ');
    return !!a && partes(a) === partes(b);
  }

  // ───────── Ayudantes ─────────
  private async consultasDeHoy(): Promise<number> {
    const [r] = await this.db.query(
      `SELECT count(*)::int AS n FROM clientes WHERE sunat_consultado_at >= date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'`,
    );
    return Math.max(r.n, this.hoy.dia === this.diaLima() ? this.hoy.n : 0);
  }

  private diaLima() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }); }

  /** Lo último consultado de un RUC (para guardarlo al crear la empresa sin gastar otra consulta) */
  enCache(ruc: string): DatosSunat | null {
    const g = this.cache.get(ruc);
    return g && g.hasta > Date.now() ? g.datos : null;
  }

  private async llamar(ruta: string, ruc: string): Promise<unknown> {
    let r: Response;
    try {
      r = await fetch(this.base + ruta, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.get('APICONSULTA_TOKEN')}` },
        body: JSON.stringify({ ruc }),
        signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new ServiceUnavailableException('SUNAT no responde en este momento. Intenta de nuevo en unos segundos.');
    }
    const texto = await r.text();
    let cuerpo: { success?: boolean; data?: unknown; message?: string; code?: string } | null = null;
    try { cuerpo = JSON.parse(texto); } catch { /* no es JSON */ }
    if (!cuerpo) this.log.warn(`apiconsulta ${ruta} respondió ${r.status} sin JSON: ${texto.slice(0, 200)}`);
    if (r.ok && cuerpo?.success !== false) return cuerpo?.data ?? null;
    if (r.status === 404 || cuerpo?.code === 'document_not_found') throw new NotFoundException('SUNAT no tiene registrado ese RUC');
    if (r.status === 401 || r.status === 403) {
      this.log.error(`apiconsulta rechazó el token (${r.status}): revisa APICONSULTA_TOKEN`);
      throw new ServiceUnavailableException('La consulta a SUNAT no está disponible (revisa el token de apiconsulta)');
    }
    if (r.status === 429) throw new ServiceUnavailableException('Se alcanzó el límite de consultas del plan de apiconsulta');
    this.log.warn(`apiconsulta ${ruta} respondió ${r.status}: ${cuerpo?.message ?? ''}`);
    throw new ServiceUnavailableException('SUNAT no responde en este momento. Intenta de nuevo en unos segundos.');
  }

  /** Ubigeo si viene; si no, departamento/provincia/distrito por nombre */
  private async ubicar(e: { ubigeo: string; departamento: string; provincia: string; distrito: string }): Promise<{ id: string; texto: string } | null> {
    const filas: { id: string; texto: string }[] = await this.db.query(
      `SELECT di.id, di.nombre || ' · ' || pr.nombre || ' · ' || de.nombre AS texto
       FROM distritos di JOIN provincias pr ON pr.id = di.provincia_id JOIN departamentos de ON de.id = pr.departamento_id
       WHERE di.id = $1
          OR (upper(translate(di.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) = $2 AND upper(translate(pr.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) = $3
              AND upper(translate(de.nombre, 'áéíóúÁÉÍÓÚñÑ', 'aeiouAEIOUnN')) = $4)
       LIMIT 2`,
      [e.ubigeo.replace(/\D/g, '').padStart(6, '0'), sinTildes(e.distrito), sinTildes(e.provincia), sinTildes(e.departamento)],
    );
    return filas.length === 1 ? filas[0] : null;
  }
}
