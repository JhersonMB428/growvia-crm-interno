import { useEffect, useState } from 'react';
import { ErrorApi } from '../../api/cliente';
import { soles } from '../../api/negociaciones';
import { mesActual, mesCorto, mesLargo, moverMes, pct, tablerosApi, variacion, type TableroGerencia } from '../../api/tableros';
import { Barras, BarraMeta, Columnas } from '../../componentes/graficos';
import './tableros.css';

type Medida = 'lineas' | 'ventas' | 'cargo';
const MEDIDAS: { valor: Medida; texto: string }[] = [
  { valor: 'lineas', texto: 'Líneas' }, { valor: 'ventas', texto: 'Ventas' }, { valor: 'cargo', texto: 'Cargo fijo' },
];

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  const v = variacion(actual, anterior);
  if (!v) return <span className="kpi__detalle">Sin datos del mes anterior</span>;
  return <span className="kpi__detalle"><span className={`kpi__variacion${v.startsWith('−') ? ' kpi__variacion--baja' : ''}`}>{v}</span> vs. mes anterior</span>;
}

/** Resumen general de gerencia: indicadores del mes, equipos, distritos, operadores y comparación de meses */
export function ResumenGerencia() {
  const [mes, setMes] = useState(mesActual());
  const [medida, setMedida] = useState<Medida>('lineas');
  const [t, setT] = useState<TableroGerencia | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setT(null);
    tablerosApi.gerencia(mes).then(setT).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el resumen'));
  }, [mes]);

  const k = t?.kpi;
  const formato = medida === 'cargo' ? soles : String;

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Resumen general</h1>
          <p>Cuenta solo lo activado en el mes (la venta suma cuando el servicio queda activo).</p>
        </div>
        <div className="selector-mes" aria-label="Mes del reporte">
          <button type="button" className="calendario__flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>‹</button>
          <b>{mesLargo(mes)}</b>
          <button type="button" className="calendario__flecha" aria-label="Mes siguiente" disabled={mes >= mesActual()} onClick={() => setMes(moverMes(mes, 1))}>›</button>
        </div>
      </div>

      {error && <div className="alerta" role="alert">{error}</div>}
      {!t && !error && <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>}

      {t && k && (
        <>
          <div className="kpis kpis--seis">
            <section className="kpi vidrio">
              <span className="kpi__titulo">Líneas activas</span>
              <span className="kpi__valor numeros">{k.lineas}{k.metaLineas !== null && <small> / {k.metaLineas}</small>}</span>
              <BarraMeta logrado={k.lineas} meta={k.metaLineas} proyeccion={mes === mesActual() ? k.proyeccion : undefined} etiqueta="Avance de la meta de la empresa" />
              <span className="kpi__detalle">{pct(k.lineas, k.metaLineas) !== null ? `${pct(k.lineas, k.metaLineas)}% de la meta` : 'Sin meta definida'}{mes === mesActual() ? ` · proyección ${k.proyeccion}` : ''}</span>
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Cargo fijo vendido</span>
              <span className="kpi__valor numeros">{soles(k.cargo)}</span>
              <Variacion actual={k.cargo} anterior={t.mesAnterior.cargo} />
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Ventas activas</span>
              <span className="kpi__valor numeros">{k.ventas}</span>
              <span className="kpi__detalle">Ticket promedio {soles(k.ventas ? Math.round(k.cargo / k.ventas) : 0)}</span>
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Portabilidad</span>
              <span className="kpi__valor numeros">{pct(k.portas, k.lineas) ?? 0}%</span>
              <span className="kpi__detalle">{k.portas} de {k.lineas} líneas</span>
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Por activar</span>
              <span className="kpi__valor numeros">{k.porActivar}</span>
              <span className="kpi__detalle">ventas en validación o posventa</span>
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Ventas observadas</span>
              <span className="kpi__valor numeros">{pct(t.proceso.observadas, t.proceso.ganadas) ?? 0}%</span>
              <span className="kpi__detalle">{t.proceso.observadas} de {t.proceso.ganadas} ganadas · cierre en {t.proceso.diasCierre} días promedio</span>
            </section>
          </div>

          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel-titulo">
              <h2 className="h2">Comparación con meses anteriores</h2>
              <div className="pestanas" role="group" aria-label="Medida">
                {MEDIDAS.map((m) => (
                  <button key={m.valor} type="button" className={`pestana${medida === m.valor ? ' pestana--activa' : ''}`} aria-pressed={medida === m.valor} onClick={() => setMedida(m.valor)}>{m.texto}</button>
                ))}
              </div>
            </div>
            <Columnas titulo={`${MEDIDAS.find((m) => m.valor === medida)!.texto} activas por mes`} formato={formato}
              datos={t.historial.map((h) => ({ etiqueta: mesCorto(h.mes), valor: h[medida], detalle: mesLargo(h.mes) }))} />
          </section>

          <div className="rejilla-tablero">
            <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="panel-titulo"><h2 className="h2">¿Dónde vendemos más?</h2><span>Top 10 distritos por líneas activas</span></div>
              {t.distritos.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Sin ventas activas este mes.</p>}
              {t.distritos.length > 0 && (
                <div className="tabla-scroll">
                  <table className="tabla">
                    <thead><tr><th>Distrito</th><th style={{ minWidth: 140 }}>Líneas</th><th className="num">Ventas</th><th className="num">Cargo fijo</th><th className="num">vs. mes ant.</th></tr></thead>
                    <tbody>
                      {t.distritos.map((d) => {
                        const max = t.distritos[0].lineas || 1;
                        const v = variacion(d.lineas, d.lineasMesAnterior);
                        return (
                          <tr key={d.distrito + d.provincia}>
                            <td><b>{d.distrito}</b>{d.provincia && <div className="tenue">{d.provincia}</div>}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="barras__pista" style={{ flex: 1 }}><span className="barras__barra" style={{ width: `${(d.lineas / max) * 100}%` }} /></span>
                                <span className="numeros" style={{ minWidth: 32, textAlign: 'right' }}>{d.lineas}</span>
                              </div>
                            </td>
                            <td className="num">{d.ventas}</td>
                            <td className="num">{soles(d.cargo)}</td>
                            <td className="num">{v ?? 'Nuevo'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h2 className="h2">Equipos</h2>
                {t.equipos.map((e, i) => (
                  <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="panel-titulo">
                      <b>{i + 1}.º {e.nombre}</b>
                      <span className="numeros">{e.lineas}{e.metaLineas ? ` / ${e.metaLineas}` : ''} líneas · {soles(e.cargo)}</span>
                    </div>
                    <BarraMeta logrado={e.lineas} meta={e.metaLineas} etiqueta={`Avance de ${e.nombre}`} />
                    <span style={{ fontSize: 13, color: 'var(--texto-suave)' }}>{e.supervisor ? `Sup. ${e.supervisor}` : 'Sin supervisor'} · {e.ventas} ventas</span>
                  </div>
                ))}
              </section>
              <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="panel-titulo"><h2 className="h2">De qué operador vienen</h2><span>{k.portas} líneas portadas</span></div>
                {t.operadores.length === 0 ? <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Sin portabilidades activas este mes.</p>
                  : <Barras titulo="Líneas portadas por operador de origen" datos={t.operadores.map((o) => ({ etiqueta: o.nombre, valor: o.lineas, detalle: `${pct(o.lineas, k.portas)}%` }))} />}
              </section>
            </div>
          </div>
        </>
      )}
    </>
  );
}