import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { embudoApi, type FiltrosEmbudo, type ReporteEmbudo } from '../../api/embudo';
import { soles, TEXTO_ETAPA } from '../../api/negociaciones';
import { mesActual, mesLargo, moverMes, pct } from '../../api/tableros';
import { Barras } from '../../componentes/graficos';
import { useSesion } from '../../sesion/SesionContext';
import '../tableros/tableros.css';
import './embudo.css';

const PERIODOS: [number, string][] = [[1, 'Este mes'], [3, '3 meses'], [6, '6 meses'], [12, '12 meses']];
const dias = (n: number) => `${n.toLocaleString('es-PE')} ${n === 1 ? 'día' : 'días'}`;

/** Supervisor (su equipo) y gerencia: dónde se caen las negociaciones y por qué se pierden */
export function Embudo() {
  const { usuario } = useSesion();
  const esGerencia = usuario?.rol.codigo !== 'SUPERVISOR';
  const [meses, setMeses] = useState(3);
  const [equipoId, setEquipoId] = useState('');
  const [asesorId, setAsesorId] = useState('');
  const [r, setR] = useState<ReporteEmbudo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const hasta = mesActual();
    const f: FiltrosEmbudo = { desde: moverMes(hasta, -(meses - 1)), hasta, equipoId: equipoId || undefined, asesorId: asesorId || undefined };
    setR(null); setError('');
    embudoApi.reporte(f).then(setR).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el reporte'));
  }, [meses, equipoId, asesorId]);

  const asesores = r?.filtros.asesores.filter((a) => !equipoId || a.equipoId === equipoId) ?? [];
  const e = r?.embudo;
  const c = r?.cierres;
  const pasos = e ? [
    { titulo: 'Abiertas', valor: e.abiertas, nota: 'negociaciones nuevas en el periodo' },
    { titulo: 'Llegaron a contacto', valor: e.contacto, nota: 'hablaron con el cliente' },
    { titulo: 'Llegaron a negociación', valor: e.negociacion, nota: 'recibieron una propuesta' },
    { titulo: 'Ganadas', valor: e.ganadas, nota: 'el cliente aceptó' },
    { titulo: 'Activas', valor: e.activas, nota: 'servicio instalado y sumando a la meta' },
  ] : [];
  const tiempo = (etapa: string) => r?.tiempos.find((t) => t.etapa === etapa);

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Embudo y pérdidas</h1>
          <p>{r ? `${r.desde === r.hasta ? mesLargo(r.desde) : `${mesLargo(r.desde)} a ${mesLargo(r.hasta)}`} · ` : ''}En qué etapa se caen las negociaciones y por qué se pierden.</p>
        </div>
        <div className="embudo-filtros">
          <div className="pestanas" role="group" aria-label="Periodo">
            {PERIODOS.map(([m, t]) => (
              <button key={m} type="button" aria-pressed={meses === m} className={`pestana${meses === m ? ' pestana--activa' : ''}`} onClick={() => setMeses(m)}>{t}</button>
            ))}
          </div>
          {esGerencia && (
            <select className="entrada" aria-label="Equipo" value={equipoId} onChange={(ev) => { setEquipoId(ev.target.value); setAsesorId(''); }}>
              <option value="">Todos los equipos</option>
              {r?.filtros.equipos.map((q) => <option key={q.id} value={q.id}>{q.nombre}</option>)}
            </select>
          )}
          <select className="entrada" aria-label="Asesor" value={asesorId} onChange={(ev) => setAsesorId(ev.target.value)}>
            <option value="">{esGerencia ? 'Todos los asesores' : 'Todo mi equipo'}</option>
            {asesores.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="alerta" role="alert">{error}</div>}
      {!r && !error && <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>}

      {r && e && c && (
        <>
          <div className="kpis">
            <section className="kpi vidrio">
              <span className="kpi__titulo">Tasa de cierre</span>
              <span className="kpi__valor numeros">{c.tasa === null ? '—' : `${c.tasa}%`}</span>
              <span className="kpi__detalle">{c.ganadas} ganadas de {c.ganadas + c.perdidas} cerradas{c.anuladas ? ` · ${c.anuladas} anuladas después` : ''}</span>
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Ciclo de venta</span>
              <span className="kpi__valor numeros">{c.ganadas ? dias(c.cicloGanada) : '—'}</span>
              <span className="kpi__detalle">desde que se abre hasta que se gana{c.perdidas ? ` · las perdidas tardan ${dias(c.cicloPerdida)}` : ''}</span>
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Perdido</span>
              <span className={`kpi__valor numeros${c.perdidas ? ' embudo-perdido' : ''}`}>{soles(c.cargoPerdido)}</span>
              <span className="kpi__detalle">{c.perdidas} {c.perdidas === 1 ? 'negociación' : 'negociaciones'} · {c.lineasPerdidas} líneas en cargo fijo mensual</span>
            </section>
            <section className="kpi vidrio">
              <span className="kpi__titulo">Estancadas hoy</span>
              <span className={`kpi__valor numeros${r.estancadas.length ? ' embudo-alerta' : ''}`}>{r.estancadas.length}</span>
              <span className="kpi__detalle">más de {r.diasEstancada} días sin movimiento</span>
            </section>
          </div>

          <div className="embudo-dos">
            <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="panel-titulo">
                <h2 className="h2">Embudo</h2>
                <span>{e.enCurso ? `${e.enCurso} siguen en curso` : 'todas cerradas'}</span>
              </div>
              {e.abiertas === 0 && <p className="embudo-vacio">No se abrieron negociaciones en este periodo.</p>}
              {e.abiertas > 0 && (
                <ol className="embudo-pasos">
                  {pasos.map((paso, i) => {
                    const anterior = i > 0 ? pasos[i - 1].valor : null;
                    const pasa = anterior ? pct(paso.valor, anterior) : null;
                    return (
                      <li key={paso.titulo} className="embudo-paso">
                        <div className="embudo-paso__cabecera">
                          <b>{paso.titulo}</b>
                          <span className="numeros"><b>{paso.valor}</b> · {pct(paso.valor, e.abiertas)}%</span>
                        </div>
                        <span className="embudo-paso__pista"><span className="embudo-paso__barra" style={{ width: `${Math.max(2, (paso.valor / e.abiertas) * 100)}%` }} /></span>
                        <span className="embudo-paso__nota">
                          {paso.nota}
                          {pasa !== null && <> · <span className={pasa < 50 ? 'embudo-caida' : ''}>{pasa}% de la etapa anterior</span></>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              {e.perdidas > 0 && <p className="embudo-vacio">De estas negociaciones, {e.perdidas} ya se perdieron.</p>}
            </section>

            <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="panel-titulo"><h2 className="h2">Tiempo en cada etapa</h2><span>promedio</span></div>
              <div className="embudo-tiempos">
                {(['PROSPECCION', 'CONTACTO', 'NEGOCIACION'] as const).map((et) => {
                  const t = tiempo(et);
                  return (
                    <div key={et} className="embudo-tiempo">
                      <span>{TEXTO_ETAPA[et]}</span>
                      <b className="numeros">{t ? dias(t.dias) : '—'}</b>
                      <small>{t ? `${t.n} ${t.n === 1 ? 'paso' : 'pasos'} medidos` : 'sin datos'}</small>
                    </div>
                  );
                })}
              </div>
              <div className="panel-titulo"><h2 className="h2">¿En qué etapa se pierden?</h2></div>
              {r.porEtapa.length === 0
                ? <p className="embudo-vacio">No hay negociaciones perdidas en el periodo.</p>
                : <Barras titulo="Negociaciones perdidas por etapa" datos={(['PROSPECCION', 'CONTACTO', 'NEGOCIACION'] as const)
                    .map((et) => ({ etiqueta: TEXTO_ETAPA[et], valor: r.porEtapa.find((x) => x.etapa === et)?.n ?? 0 }))} />}
            </section>
          </div>

          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="panel-titulo"><h2 className="h2">Motivos de pérdida</h2><span>negociaciones perdidas en el periodo</span></div>
            {r.porMotivo.length === 0 && <p className="embudo-vacio">No hay negociaciones perdidas en el periodo. ¡Bien!</p>}
            {r.porMotivo.length > 0 && (
              <div className="embudo-dos embudo-dos--interno">
                <Barras titulo="Negociaciones perdidas por motivo"
                  datos={r.porMotivo.map((m) => ({ etiqueta: m.motivo, valor: m.n, detalle: `${m.n} · ${m.lineas} líneas · ${soles(m.cargo)}` }))} />
                <div className="tabla-scroll">
                  <table className="tabla">
                    <thead><tr><th>Motivo</th><th className="num">Negociaciones</th><th className="num">Líneas</th><th className="num">Cargo fijo</th></tr></thead>
                    <tbody>
                      {r.porMotivo.map((m) => (
                        <tr key={m.motivo}>
                          <td><b>{m.motivo}</b><span className="tenue" style={{ display: 'block' }}>{pct(m.n, c.perdidas)}% de las perdidas</span></td>
                          <td className="num">{m.n}</td><td className="num">{m.lineas}</td><td className="num">{soles(m.cargo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {r.otros.length > 0 && (
              <div className="embudo-otros">
                <b>Lo que escribieron en “Otro”</b>
                <ul>
                  {r.otros.map((o) => (
                    <li key={o.id}>“{o.motivo}” <span className="tenue">· {o.asesor} · <Link to={`/negociaciones/${o.id}`} className="numeros">{o.codigo}</Link></span></li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="panel-titulo"><h2 className="h2">Por asesor</h2><span>abiertas y cerradas en el periodo</span></div>
            {r.asesores.length === 0 ? <p className="embudo-vacio">Sin movimiento en el periodo.</p> : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr><th>Asesor</th><th className="num">Abiertas</th><th className="num">Ganadas</th><th className="num">Perdidas</th><th className="num">Tasa de cierre</th><th className="num">Ciclo</th><th className="num">Cargo ganado</th><th>Pierde más por</th></tr>
                  </thead>
                  <tbody>
                    {r.asesores.map((a) => {
                      const tasa = pct(a.ganadas, a.ganadas + a.perdidas);
                      return (
                        <tr key={a.id}>
                          <td><b>{a.asesor}</b>{esGerencia && a.equipo && <span className="tenue" style={{ display: 'block' }}>{a.equipo}</span>}</td>
                          <td className="num">{a.creadas}</td><td className="num">{a.ganadas}</td><td className="num">{a.perdidas}</td>
                          <td className="num"><span className={tasa !== null && tasa < 50 ? 'embudo-caida' : ''}>{tasa === null ? '—' : `${tasa}%`}</span></td>
                          <td className="num">{a.ganadas ? dias(a.ciclo) : '—'}</td>
                          <td className="num">{soles(a.cargoGanado)}</td>
                          <td>{a.motivoPrincipal ?? <span className="tenue">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="panel-titulo"><h2 className="h2">Negociaciones estancadas</h2><span>abiertas hoy, sin movimiento hace más de {r.diasEstancada} días</span></div>
            {r.estancadas.length === 0 ? <p className="embudo-vacio">Ninguna negociación está estancada.</p> : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead><tr><th>Empresa</th><th>Asesor</th><th>Etapa</th><th className="num">Cargo fijo</th><th className="num">Sin movimiento</th></tr></thead>
                  <tbody>
                    {r.estancadas.map((x) => (
                      <tr key={x.id}>
                        <td><Link to={`/negociaciones/${x.id}`} style={{ textDecoration: 'none' }}><b>{x.razonSocial}</b></Link><span className="tenue numeros" style={{ display: 'block' }}>{x.codigo}</span></td>
                        <td>{x.asesor}</td><td>{TEXTO_ETAPA[x.etapa]}</td><td className="num">{soles(x.cargo)}</td>
                        <td className="num"><span className="embudo-caida">{dias(x.dias)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}