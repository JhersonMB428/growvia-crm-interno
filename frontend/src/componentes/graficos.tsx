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