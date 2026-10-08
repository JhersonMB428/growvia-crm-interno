import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { SesionUsuario } from '../auth/decorators/usuario-actual.decorator';
import { FIN_CONTRATO_SQL } from '../negociaciones/negociaciones.service';

export const REPORTES = ['ventas', 'negociaciones', 'gestiones', 'cartera', 'metas'] as const;
export type Reporte = (typeof REPORTES)[number];

const Z = `'America/Lima'`;
/** Inicio del mes $n y fin del mes $m (AAAA-MM), en hora de Lima */
const INICIO = (n: number) => `(($${n} || '-01')::date)::timestamp AT TIME ZONE ${Z}`;
const FIN = (n: number) => `((($${n} || '-01')::date + interval '1 month'))::timestamp AT TIME ZONE ${Z}`;
/** Fecha y hora de Lima como texto, para que Excel muestre la hora local */
const LIMA = (col: string) => `to_char(${col} AT TIME ZONE ${Z}, 'YYYY-MM-DD HH24:MI')`;
const TOTALES = `
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(i.cantidad), 0)::int AS lineas,
           COALESCE(sum(i.cantidad) FILTER (WHERE i.modalidad = 'PORTABILIDAD'), 0)::int AS portas,
           COALESCE(sum(i.cantidad * i.cargo_fijo_unit), 0)::float8 AS cargo
    FROM oportunidad_items i WHERE i.oportunidad_id = o.id
  ) t ON true`;

const ETAPA: Record<string, string> = { PROSPECCION: 'Prospección', CONTACTO: 'Contacto', NEGOCIACION: 'Negociación', CIERRE: 'Cierre' };
const RESULTADO: Record<string, string> = { EN_CURSO: 'En curso', GANADA: 'Ganada', PERDIDA: 'Perdida' };
const ESTADO_VENTA: Record<string, string> = {
  EN_VALIDACION: 'Por validar', OBSERVADA: 'Observada', VALIDADA: 'Validada', EN_POSVENTA: 'En posventa', ACTIVA: 'Activa', ANULADA: 'Anulada',
};
const TIPO: Record<string, string> = { NUEVA: 'Nueva', AMPLIACION: 'Ampliación', RENOVACION: 'Renovación' };
const CANAL: Record<string, string> = { LLAMADA: 'Llamada', WHATSAPP: 'WhatsApp', CORREO: 'Correo', VISITA: 'Visita' };
const RES_GESTION: Record<string, string> = {
  INTERESADO: 'Interesado', NO_CONTESTA: 'No contesta', VOLVER_A_LLAMAR: 'Volver a llamar', RECHAZA: 'Rechaza', OTRO: 'Otro',
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

type Formato = 'texto' | 'numero' | 'soles' | 'fecha' | 'fechaHora' | 'pct';
interface Columna { titulo: string; clave: string; ancho?: number; formato?: Formato; total?: boolean }

const FORMATOS: Partial<Record<Formato, string>> = {
  numero: '#,##0', soles: '"S/" #,##0.00', fecha: 'dd/mm/yyyy', fechaHora: 'dd/mm/yyyy hh:mm', pct: '0%',
};

/** "2026-10-07 14:30" (hora de Lima) → Date que Excel muestra igual */
const aFecha = (v: unknown) => (typeof v === 'string' && v ? new Date(`${v.replace(' ', 'T')}${v.length > 10 ? ':00' : 'T00:00:00'}Z`) : null);

/**
 * Exportaciones a Excel. Solo gerencia (permiso DATOS_EXPORTAR); cada descarga queda en la bitácora.
 * Cada archivo lleva quién lo exportó y cuándo, y la marca "uso interno".
 */
@Injectable()
export class ExportacionService {
  constructor(private readonly db: DataSource) {}

  async generar(tipo: Reporte, f: { desde?: string; hasta?: string; contactos?: boolean }, s: SesionUsuario) {
    const [yo] = await this.db.query(`SELECT nombres || ' ' || apellidos AS nombre FROM usuarios WHERE id = $1`, [s.sub]);
    const { desde, hasta } = this.rango(tipo, f.desde, f.hasta);
    const periodo = tipo === 'cartera' ? 'Al día de hoy' : desde === hasta ? nombreMes(desde) : `${nombreMes(desde)} a ${nombreMes(hasta)}`;

    let titulo: string;
    let columnas: Columna[];
    let filas: Record<string, unknown>[];

    if (tipo === 'ventas') {
      titulo = 'Ventas ganadas';
      columnas = [
        { titulo: 'Código', clave: 'codigo', ancho: 17 }, { titulo: 'Fecha de cierre', clave: 'cierre', formato: 'fechaHora', ancho: 17 },
        { titulo: 'Empresa', clave: 'empresa', ancho: 36 }, { titulo: 'RUC', clave: 'ruc', ancho: 13 }, { titulo: 'Distrito', clave: 'distrito', ancho: 20 },
        { titulo: 'Asesor', clave: 'asesor', ancho: 24 }, { titulo: 'Equipo', clave: 'equipo', ancho: 14 }, { titulo: 'Tipo', clave: 'tipo', ancho: 11 },
        { titulo: 'Estado', clave: 'estado', ancho: 13 }, { titulo: 'Líneas', clave: 'lineas', formato: 'numero', total: true, ancho: 9 },
        { titulo: 'Portabilidades', clave: 'portas', formato: 'numero', total: true, ancho: 14 },
        { titulo: 'Cargo fijo mensual', clave: 'cargo', formato: 'soles', total: true, ancho: 18 },
        { titulo: 'Validada', clave: 'validada', formato: 'fechaHora', ancho: 17 }, { titulo: 'Activada', clave: 'activada', formato: 'fechaHora', ancho: 17 },
        { titulo: 'N° orden operador', clave: 'orden', ancho: 18 }, { titulo: 'Correcciones', clave: 'correcciones', formato: 'numero', ancho: 12 },
        { titulo: 'Plazo (meses)', clave: 'plazo', formato: 'numero', ancho: 13 }, { titulo: 'Fin de contrato', clave: 'finContrato', formato: 'fecha', ancho: 15 },
      ];
      filas = (await this.db.query(
        `SELECT o.codigo, ${LIMA('o.fecha_cierre')} AS cierre, c.razon_social AS empresa, c.ruc, d.nombre AS distrito,
                ua.nombres || ' ' || ua.apellidos AS asesor, eq.nombre AS equipo, o.tipo, o.estado_venta AS estado,
                t.lineas, t.portas, t.cargo, ${LIMA('o.fecha_validacion')} AS validada, ${LIMA('o.fecha_activacion')} AS activada,
                o.orden_operador AS orden, o.correcciones, NULLIF(o.plazo_meses, 0) AS plazo,
                CASE WHEN o.estado_venta = 'ACTIVA' AND o.plazo_meses > 0 THEN to_char(${FIN_CONTRATO_SQL}, 'YYYY-MM-DD') END AS "finContrato"
         FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id LEFT JOIN distritos d ON d.id = c.distrito_id
         JOIN usuarios ua ON ua.id = o.asesor_id LEFT JOIN equipos eq ON eq.id = COALESCE(o.equipo_id, ua.equipo_id) ${TOTALES}
         WHERE o.resultado = 'GANADA' AND o.fecha_cierre >= ${INICIO(1)} AND o.fecha_cierre < ${FIN(2)}
         ORDER BY o.fecha_cierre`, [desde, hasta],
      )).map((r: Record<string, unknown>) => ({ ...r, tipo: TIPO[r.tipo as string], estado: ESTADO_VENTA[r.estado as string] ?? r.estado }));
    } else if (tipo === 'negociaciones') {
      titulo = 'Negociaciones (embudo)';
      columnas = [
        { titulo: 'Código', clave: 'codigo', ancho: 17 }, { titulo: 'Empresa', clave: 'empresa', ancho: 36 }, { titulo: 'RUC', clave: 'ruc', ancho: 13 },
        { titulo: 'Asesor', clave: 'asesor', ancho: 24 }, { titulo: 'Equipo', clave: 'equipo', ancho: 14 }, { titulo: 'Tipo', clave: 'tipo', ancho: 11 },
        { titulo: 'Etapa', clave: 'etapa', ancho: 13 }, { titulo: 'Resultado', clave: 'resultado', ancho: 11 }, { titulo: 'Motivo de pérdida', clave: 'motivo', ancho: 26 },
        { titulo: 'Líneas', clave: 'lineas', formato: 'numero', total: true, ancho: 9 }, { titulo: 'Cargo fijo mensual', clave: 'cargo', formato: 'soles', total: true, ancho: 18 },
        { titulo: 'Abierta', clave: 'abierta', formato: 'fechaHora', ancho: 17 }, { titulo: 'Cerrada', clave: 'cerrada', formato: 'fechaHora', ancho: 17 },
      ];
      // Abiertas o cerradas dentro del periodo
      filas = (await this.db.query(
        `SELECT o.codigo, c.razon_social AS empresa, c.ruc, ua.nombres || ' ' || ua.apellidos AS asesor, eq.nombre AS equipo, o.tipo, o.etapa,
                o.resultado, o.motivo_perdida AS motivo, t.lineas, t.cargo, ${LIMA('o.created_at')} AS abierta, ${LIMA('o.fecha_cierre')} AS cerrada
         FROM oportunidades o JOIN clientes c ON c.id = o.cliente_id JOIN usuarios ua ON ua.id = o.asesor_id
         LEFT JOIN equipos eq ON eq.id = COALESCE(o.equipo_id, ua.equipo_id) ${TOTALES}
         WHERE (o.created_at >= ${INICIO(1)} AND o.created_at < ${FIN(2)}) OR (o.fecha_cierre >= ${INICIO(1)} AND o.fecha_cierre < ${FIN(2)})
         ORDER BY o.created_at`, [desde, hasta],
      )).map((r: Record<string, unknown>) => ({ ...r, tipo: TIPO[r.tipo as string], etapa: ETAPA[r.etapa as string], resultado: RESULTADO[r.resultado as string] }));
    } else if (tipo === 'gestiones') {
      titulo = 'Gestiones';
      columnas = [
        { titulo: 'Fecha', clave: 'fecha', formato: 'fechaHora', ancho: 17 }, { titulo: 'Asesor', clave: 'asesor', ancho: 24 }, { titulo: 'Equipo', clave: 'equipo', ancho: 14 },
        { titulo: 'Empresa', clave: 'empresa', ancho: 36 }, { titulo: 'RUC', clave: 'ruc', ancho: 13 }, { titulo: 'Canal', clave: 'canal', ancho: 11 },
        { titulo: 'Resultado', clave: 'resultado', ancho: 16 }, { titulo: 'Comentario', clave: 'comentario', ancho: 50 },
        { titulo: 'Próxima acción', clave: 'proxima', formato: 'fechaHora', ancho: 17 }, { titulo: 'Estado de la próxima', clave: 'estadoProxima', ancho: 19 },
      ];
      filas = (await this.db.query(
        `SELECT ${LIMA('g.created_at')} AS fecha, u.nombres || ' ' || u.apellidos AS asesor, eq.nombre AS equipo, c.razon_social AS empresa, c.ruc,
                g.canal, g.resultado, g.comentario, ${LIMA('g.proxima_accion')} AS proxima,
                CASE WHEN g.proxima_accion IS NULL THEN NULL
                     WHEN g.proxima_hecha_at IS NOT NULL THEN 'Hecha'
                     WHEN g.proxima_accion < date_trunc('day', now() AT TIME ZONE ${Z}) AT TIME ZONE ${Z} THEN 'No realizada'
                     ELSE 'Pendiente' END AS "estadoProxima"
         FROM gestiones g JOIN usuarios u ON u.id = g.usuario_id LEFT JOIN equipos eq ON eq.id = u.equipo_id JOIN clientes c ON c.id = g.cliente_id
         WHERE g.created_at >= ${INICIO(1)} AND g.created_at < ${FIN(2)}
         ORDER BY g.created_at`, [desde, hasta],
      )).map((r: Record<string, unknown>) => ({ ...r, canal: CANAL[r.canal as string] ?? r.canal, resultado: RES_GESTION[r.resultado as string] ?? r.resultado }));
    } else if (tipo === 'cartera') {
      titulo = f.contactos ? 'Cartera de empresas (con contactos)' : 'Cartera de empresas';
      columnas = [
        { titulo: 'RUC', clave: 'ruc', ancho: 13 }, { titulo: 'Razón social', clave: 'empresa', ancho: 38 },
        { titulo: 'Departamento', clave: 'departamento', ancho: 14 }, { titulo: 'Provincia', clave: 'provincia', ancho: 14 }, { titulo: 'Distrito', clave: 'distrito', ancho: 20 },
        { titulo: 'Estado', clave: 'estado', ancho: 11 }, { titulo: 'Origen', clave: 'origen', ancho: 14 }, { titulo: 'Asesor a cargo', clave: 'asesor', ancho: 24 },
        { titulo: 'Equipo', clave: 'equipo', ancho: 14 }, { titulo: 'Asignada desde', clave: 'asignada', formato: 'fecha', ancho: 14 },
        { titulo: 'Última gestión', clave: 'ultimaGestion', formato: 'fecha', ancho: 14 },
        ...(f.contactos ? [
          { titulo: 'Contacto principal', clave: 'c1', ancho: 24 }, { titulo: 'Celular', clave: 'c1cel', ancho: 12 }, { titulo: 'Correo', clave: 'c1correo', ancho: 26 },
          { titulo: 'Contacto secundario', clave: 'c2', ancho: 24 }, { titulo: 'Celular 2', clave: 'c2cel', ancho: 12 }, { titulo: 'Correo 2', clave: 'c2correo', ancho: 26 },
        ] as Columna[] : []),
      ];
      filas = await this.db.query(
        `SELECT c.ruc, c.razon_social AS empresa, dep.nombre AS departamento, pr.nombre AS provincia, d.nombre AS distrito,
                CASE c.estado WHEN 'VENTA' THEN 'Cliente' ELSE 'Prospecto' END AS estado,
                CASE c.origen WHEN 'BASE' THEN 'Base cargada' ELSE 'Prospección' END AS origen,
                u.nombres || ' ' || u.apellidos AS asesor, eq.nombre AS equipo,
                to_char(c.asignado_at AT TIME ZONE ${Z}, 'YYYY-MM-DD') AS asignada, to_char(c.ultima_gestion_at AT TIME ZONE ${Z}, 'YYYY-MM-DD') AS "ultimaGestion"
                ${f.contactos ? `, k1.nombre AS c1, k1.celular AS c1cel, k1.correo AS c1correo, k2.nombre AS c2, k2.celular AS c2cel, k2.correo AS c2correo` : ''}
         FROM clientes c
         LEFT JOIN distritos d ON d.id = c.distrito_id LEFT JOIN provincias pr ON pr.id = d.provincia_id LEFT JOIN departamentos dep ON dep.id = pr.departamento_id
         LEFT JOIN usuarios u ON u.id = c.asesor_id LEFT JOIN equipos eq ON eq.id = u.equipo_id
         ${f.contactos ? `LEFT JOIN contactos k1 ON k1.cliente_id = c.id AND k1.posicion = 1 LEFT JOIN contactos k2 ON k2.cliente_id = c.id AND k2.posicion = 2` : ''}
         ORDER BY c.razon_social`,
      );
    } else {
      titulo = 'Metas y avance por asesor';
      columnas = [
        { titulo: 'Asesor', clave: 'asesor', ancho: 26 }, { titulo: 'Equipo', clave: 'equipo', ancho: 14 },
        { titulo: 'Meta (líneas)', clave: 'meta', formato: 'numero', total: true, ancho: 13 }, { titulo: 'Líneas activas', clave: 'lineas', formato: 'numero', total: true, ancho: 14 },
        { titulo: 'Avance', clave: 'avance', formato: 'pct', ancho: 10 }, { titulo: 'Ventas activas', clave: 'ventas', formato: 'numero', total: true, ancho: 14 },
        { titulo: 'Cargo fijo activo', clave: 'cargo', formato: 'soles', total: true, ancho: 18 },
        { titulo: 'Por activar (líneas)', clave: 'porActivar', formato: 'numero', total: true, ancho: 18 },
      ];
      filas = (await this.db.query(
        `SELECT u.nombres || ' ' || u.apellidos AS asesor, eq.nombre AS equipo, m.meta_lineas AS meta,
                COALESCE(a.lineas, 0)::int AS lineas, COALESCE(a.ventas, 0)::int AS ventas, COALESCE(a.cargo, 0)::float8 AS cargo,
                COALESCE(p.lineas, 0)::int AS "porActivar"
         FROM usuarios u JOIN roles r ON r.id = u.rol_id LEFT JOIN equipos eq ON eq.id = u.equipo_id
         LEFT JOIN metas m ON m.alcance = 'ASESOR' AND m.asesor_id = u.id AND m.periodo = ($1 || '-01')::date
         LEFT JOIN LATERAL (
           SELECT sum(t.lineas) AS lineas, count(*) AS ventas, sum(t.cargo) AS cargo FROM oportunidades o ${TOTALES}
           WHERE o.asesor_id = u.id AND o.estado_venta = 'ACTIVA' AND o.fecha_activacion >= ${INICIO(1)} AND o.fecha_activacion < ${FIN(1)}
         ) a ON true
         LEFT JOIN LATERAL (
           SELECT sum(t.lineas) AS lineas FROM oportunidades o ${TOTALES}
           WHERE o.asesor_id = u.id AND o.estado_venta IN ('EN_VALIDACION','OBSERVADA','VALIDADA','EN_POSVENTA')
         ) p ON true
         WHERE r.codigo = 'ASESOR' AND u.activo
         ORDER BY eq.nombre NULLS LAST, lineas DESC, asesor`, [desde],
      )).map((r: Record<string, unknown>) => ({ ...r, avance: r.meta ? Number(r.lineas) / Number(r.meta) : null }));
    }

    const archivo = await this.libro(titulo, periodo, yo?.nombre ?? '', columnas, filas);
    const sufijo = tipo === 'cartera' ? new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) : desde === hasta ? desde : `${desde}_a_${hasta}`;
    return { archivo, nombre: `growvia-${tipo}-${sufijo}.xlsx`, filas: filas.length, periodo };
  }

  /** Revisa el periodo pedido: meses AAAA-MM, desde ≤ hasta y como máximo 12 meses */
  private rango(tipo: Reporte, desde?: string, hasta?: string) {
    const actual = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit' }).slice(0, 7);
    const d = desde ?? actual;
    const h = tipo === 'metas' ? d : hasta ?? d;
    if (h < d) throw new BadRequestException('El mes final no puede ser anterior al inicial');
    const meses = (Number(h.slice(0, 4)) - Number(d.slice(0, 4))) * 12 + Number(h.slice(5, 7)) - Number(d.slice(5, 7)) + 1;
    if (meses > 12) throw new BadRequestException('Se pueden exportar como máximo 12 meses a la vez');
    return { desde: d, hasta: h };
  }

  private async libro(titulo: string, periodo: string, usuario: string, columnas: Columna[], filas: Record<string, unknown>[]) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Growvia CRM';
    wb.created = new Date();
    const ws = wb.addWorksheet(titulo.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }] });
    const ahora = new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    ws.getCell('A1').value = `Growvia · ${titulo} · ${periodo}`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF013936' } };
    ws.getCell('A2').value = `Exportado por ${usuario} el ${ahora} · Uso interno y confidencial de Growvia. No compartir fuera de la empresa.`;
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF6B7C78' } };

    const cabecera = ws.getRow(4);
    columnas.forEach((c, i) => {
      const celda = cabecera.getCell(i + 1);
      celda.value = c.titulo;
      celda.font = { bold: true, color: { argb: 'FFC7E196' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF013936' } };
      celda.alignment = { vertical: 'middle' };
      ws.getColumn(i + 1).width = c.ancho ?? 14;
      if (c.formato && FORMATOS[c.formato]) ws.getColumn(i + 1).numFmt = FORMATOS[c.formato]!;
    });
    cabecera.height = 22;

    filas.forEach((f, n) => {
      const fila = ws.getRow(5 + n);
      columnas.forEach((c, i) => {
        const v = f[c.clave];
        fila.getCell(i + 1).value = (c.formato === 'fecha' || c.formato === 'fechaHora') ? aFecha(v) : (v ?? null) as ExcelJS.CellValue;
      });
    });

    if (filas.length) {
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columnas.length } };
      // Fila de totales con fórmulas (siguen funcionando si filtran o editan)
      if (columnas.some((c) => c.total)) {
        const ultima = 4 + filas.length;
        const total = ws.getRow(ultima + 1);
        total.getCell(1).value = 'Total';
        columnas.forEach((c, i) => {
          if (!c.total) return;
          const letra = ws.getColumn(i + 1).letter;
          total.getCell(i + 1).value = { formula: `SUBTOTAL(9,${letra}5:${letra}${ultima})` };
        });
        total.font = { bold: true };
        total.eachCell((celda) => { celda.border = { top: { style: 'thin', color: { argb: 'FF013936' } } }; });
      }
    } else {
      ws.getCell('A5').value = 'No hay datos en este periodo.';
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}