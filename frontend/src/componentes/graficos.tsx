import './graficos.css';

/** Barra de avance contra la meta: sólida = logrado, tenue = proyección al cierre */
export function BarraMeta({ logrado, meta, proyeccion, etiqueta }: { logrado: number; meta: number | null; proyeccion?: number; etiqueta: string }) {
  if (!meta) return <div className="barra-meta barra-meta--sin" aria-label={`${etiqueta}: sin meta definida`}><span>Sin meta definida</span></div>;
  const tope = Math.max(meta, logrado, proyeccion ?? 0);
  const ancho = (v: number) => `${Math.min(100, (v / tope) * 100)}%`;
  return (
    <div className="barra-meta" role="img"
      aria-label={`${etiqueta}: ${logrado} de ${meta} (${Math.round((logrado / meta) * 100)}%)${proyeccion ? `, proyección ${proyeccion}` : ''}`}>
      {proyeccion !== undefined && proyeccion > logrado && <span className="barra-meta__proyeccion" style={{ width: ancho(proyeccion) }} />}
      <span className="barra-meta__logrado" style={{ width: ancho(logrado) }} />
      <span className="barra-meta__marca" style={{ left: ancho(meta) }} title={`Meta: ${meta}`} />
    </div>
  );
}

export interface Dato { etiqueta: string; valor: number; detalle?: string }

/** Columnas verticales de una sola serie (p. ej. líneas por mes). La última se resalta. */
export function Columnas({ datos, titulo, formato = String }: { datos: Dato[]; titulo: string; formato?: (n: number) => string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <figure className="columnas" aria-label={titulo}>
      <div className="columnas__area">
        {datos.map((d, i) => (
          <div key={d.etiqueta} className={`columnas__col${i === datos.length - 1 ? ' columnas__col--actual' : ''}`} tabIndex={0}>
            {i === datos.length - 1 && <span className="columnas__valor numeros">{formato(d.valor)}</span>}
            <span className="columnas__barra" style={{ height: `${(d.valor / max) * 100}%` }}>
              <span className="columnas__tip" role="tooltip"><b>{formato(d.valor)}</b>{d.detalle ? <span>{d.detalle}</span> : null}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="columnas__ejes">{datos.map((d) => <span key={d.etiqueta}>{d.etiqueta}</span>)}</div>
      <table className="oculto-visual"><caption>{titulo}</caption><tbody>
        {datos.map((d) => <tr key={d.etiqueta}><th>{d.etiqueta}</th><td>{formato(d.valor)}</td></tr>)}
      </tbody></table>
    </figure>
  );
}

/** Barras horizontales de una sola serie con etiqueta y valor (p. ej. distritos, operadores) */
export function Barras({ datos, titulo, formato = String }: { datos: Dato[]; titulo: string; formato?: (n: number) => string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="barras" role="list" aria-label={titulo}>
      {datos.map((d) => (
        <div key={d.etiqueta} className="barras__fila" role="listitem" title={d.detalle ? `${d.etiqueta}: ${d.detalle}` : undefined}>
          <span className="barras__etiqueta recortar">{d.etiqueta}</span>
          <span className="barras__pista"><span className="barras__barra" style={{ width: `${(d.valor / max) * 100}%` }} /></span>
          <span className="barras__valor numeros">{formato(d.valor)}</span>
        </div>
      ))}
    </div>
  );
}
/** Actividad por día: columnas finas con la fecha cada pocos días y el detalle al pasar el mouse */
export function ActividadDiaria({ datos, titulo, unidad = 'acciones' }: { datos: { dia: string; total: number; usuarios?: number }[]; titulo: string; unidad?: string }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const cada = datos.length > 45 ? 14 : datos.length > 14 ? 5 : 1;
  const corto = (dia: string) => new Date(`${dia}T12:00:00`).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  return (
    <figure className="actividad" aria-label={titulo}>
      <div className="actividad__area">
        {datos.map((d) => (
          <div key={d.dia} className="actividad__col" tabIndex={0}>
            <span className="actividad__barra" style={{ height: `${(d.total / max) * 100}%` }} />
            <span className="columnas__tip" role="tooltip">
              <b>{corto(d.dia)}</b><span>{d.total} {unidad}</span>{d.usuarios !== undefined && <span>{d.usuarios} {d.usuarios === 1 ? 'usuario' : 'usuarios'}</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="actividad__ejes">
        {datos.map((d, i) => <span key={d.dia}>{i % cada === 0 || i === datos.length - 1 ? corto(d.dia) : ''}</span>)}
      </div>
      <table className="oculto-visual"><caption>{titulo}</caption><tbody>
        {datos.map((d) => <tr key={d.dia}><th>{d.dia}</th><td>{d.total}</td></tr>)}
      </tbody></table>
    </figure>
  );
}

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** Mapa de calor día × hora: cuándo se trabaja en el CRM (más intenso = más acciones) */
export function MapaCalor({ datos, titulo }: { datos: { dia: number; hora: number; n: number }[]; titulo: string }) {
  const horasConDatos = datos.map((d) => d.hora);
  const desde = Math.min(7, ...horasConDatos);
  const hasta = Math.max(20, ...horasConDatos);
  const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const valor = new Map(datos.map((d) => [`${d.dia}-${d.hora}`, d.n]));
  const max = Math.max(1, ...datos.map((d) => d.n));
  return (
    <figure className="calor" aria-label={titulo} style={{ ['--horas' as string]: horas.length }}>
      <div className="calor__fila calor__fila--ejes"><span />{horas.map((h) => <span key={h}>{h % 2 === 0 ? `${h}h` : ''}</span>)}</div>
      {DIAS_SEMANA.map((nombre, i) => (
        <div key={nombre} className="calor__fila">
          <span className="calor__dia">{nombre}</span>
          {horas.map((h) => {
            const n = valor.get(`${i + 1}-${h}`) ?? 0;
            return (
              <span key={h} className="calor__celda" tabIndex={n ? 0 : -1}
                style={{ opacity: n ? 0.18 + 0.82 * (n / max) : 1, background: n ? 'var(--acento)' : 'var(--linea)' }}
                title={`${nombre} ${h}:00–${h + 1}:00 · ${n} ${n === 1 ? 'acción' : 'acciones'}`} />
            );
          })}
        </div>
      ))}
      <figcaption className="calor__leyenda"><span>Menos</span><i style={{ opacity: 0.25 }} /><i style={{ opacity: 0.55 }} /><i /><span>Más</span></figcaption>
    </figure>
  );
}
