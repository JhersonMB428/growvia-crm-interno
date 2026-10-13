import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { soles } from '../../api/negociaciones';
import { mesLargo, pct, tablerosApi, type TableroEquipo } from '../../api/tableros';
import { BarraMeta } from '../../componentes/graficos';
import { useSesion } from '../../sesion/SesionContext';
import './tableros.css';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });

/** Tablero del supervisor: avance del equipo, ranking de asesores, alertas y cambios de asesor */
export function MiEquipo() {
  const { usuario } = useSesion();
  const [t, setT] = useState<TableroEquipo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    tablerosApi.equipo().then(setT).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar tu equipo'));
  }, []);

  if (error) return <div className="alerta" role="alert">{error}</div>;
  if (!t) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;
  if (!t.equipo) return <div className="aviso" role="status">Todavía no tienes un equipo asignado. Pide a gerencia o al administrador que te asigne uno.</div>;

  const e = t.equipo;
  const avance = pct(e.lineas, e.metaLineas);
  const enRiesgo = t.asesores.filter((a) => a.metaLineas && a.lineas + a.porActivar < a.metaLineas * 0.5).length;
  const cargo = t.asesores.reduce((x, a) => x + a.cargo, 0);
  const enNegociacion = t.asesores.reduce((x, a) => x + a.porActivar, 0);
  const al = t.alertas!;

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <span className="encabezado__antetitulo">{e.nombre} · {t.asesores.length} {t.asesores.length === 1 ? 'asesor' : 'asesores'} · {mesLargo(t.mes)}</span>
          <h1>Hola, {usuario?.nombres.split(' ')[0]}</h1>
          <p className="saludo">
            {avance !== null ? <>Tu equipo va en <b>{avance}% de la meta</b>.</> : 'Aún no hay meta para tu equipo este mes.'}
            {enRiesgo > 0 && <> {enRiesgo} {enRiesgo === 1 ? 'asesor necesita' : 'asesores necesitan'} apoyo.</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/negociaciones" className="boton">Negociaciones{al.enCierre ? ` · ${al.enCierre} en cierre` : ''}</Link>
          <Link to="/metas" className="boton-secundario">Metas</Link>
        </div>
      </div>

      <div className="kpis">
        <section className="kpi vidrio">
          <span className="kpi__titulo">Líneas activas del equipo</span>
          <span className="kpi__valor numeros">{e.lineas}{e.metaLineas !== null && <small> / {e.metaLineas}</small>}</span>
          <BarraMeta logrado={e.lineas} meta={e.metaLineas} proyeccion={e.proyeccion} etiqueta="Avance del equipo" />
          <span className="kpi__detalle">Proyección al cierre: {e.proyeccion}</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Cargo fijo activo</span>
          <span className="kpi__valor numeros">{soles(cargo)}</span>
          <span className="kpi__detalle">mensual sin IGV, de las ventas del mes</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Cantidad de líneas</span>
          <span className="kpi__valor numeros">{enNegociacion} <small>líneas</small></span>
          <span className="kpi__detalle">en negociaciones abiertas del equipo</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Gestiones hoy</span>
          <span className="kpi__valor numeros">{t.asesores.reduce((x, a) => x + a.gestionesHoy, 0)}</span>
          <span className="kpi__detalle">registradas por el equipo</span>
        </section>
      </div>

      {/* El ranking va a todo el ancho porque tiene muchas columnas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Ranking del equipo</h2>
          {t.asesores.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Tu equipo todavía no tiene asesores.</p>}
          {t.asesores.length > 0 && (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>#</th><th>Asesor</th><th style={{ minWidth: 160 }}>Líneas / meta</th><th className="num" title="Líneas en negociaciones abiertas">Cantidad de líneas</th><th className="num">Cargo fijo</th><th className="num" title="Ganadas / cerradas en el mes">Conversión</th><th className="num">Abiertas</th><th className="num">Gestiones hoy</th></tr></thead>
                <tbody>
                  {t.asesores.map((a, i) => (
                    <tr key={a.id}>
                      <td className="numeros">{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <b>{a.nombre}</b>
                          {a.noRealizadas > 0 && <span className="tenue" style={{ color: 'var(--salir)' }}>{a.noRealizadas} no realizada(s)</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span className="numeros">{a.lineas}{a.metaLineas !== null ? ` / ${a.metaLineas}` : ''}</span>
                          <BarraMeta logrado={a.lineas} meta={a.metaLineas} etiqueta={`Avance de ${a.nombre}`} />
                        </div>
                      </td>
                      <td className="num">{a.porActivar}</td>
                      <td className="num">{soles(a.cargo)}</td>
                      <td className="num">{a.ganadas + a.perdidas ? `${pct(a.ganadas, a.ganadas + a.perdidas)}%` : '—'}</td>
                      <td className="num">{a.abiertas}</td>
                      <td className="num">{a.gestionesHoy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <section className="panel vidrio" style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="h2">Requieren atención</h2>
            <div className="alertas-lista">
              {[
                [al.enCierre, 'negociaciones en cierre: márcalas ganadas cuando se envíe el expediente', '/negociaciones'],
                [al.sinGestionesHoy, 'asesores sin gestiones registradas hoy', null],
                [al.prospectosSinContacto, 'prospectos sin gestión hace más de 7 días', null],
                [al.negociacionesAntiguas, 'negociaciones abiertas hace más de 15 días', '/negociaciones'],
              ].map(([n, texto, ruta]) => (
                <div key={texto as string} className={`alerta-item${(n as number) > 0 ? ' alerta-item--activa' : ''}`}>
                  <b className="numeros">{n as number}</b>
                  <span style={{ flex: 1 }}>{texto as string}</span>
                  {ruta && (n as number) > 0 && <Link to={ruta as string} style={{ textDecoration: 'none', fontWeight: 700 }}>Ver →</Link>}
                </div>
              ))}
            </div>
          </section>

          <section className="panel vidrio" style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="h2">Cambios de asesor</h2>
            {t.cambios.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Sin cambios de asesor en las empresas de tu equipo.</p>}
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {t.cambios.map((c, i) => (
                <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 14, borderLeft: '2px solid var(--linea)' }}>
                  <Link to={`/empresas/${c.clienteId}`} style={{ fontWeight: 700, textDecoration: 'none' }}>{c.razonSocial}</Link>
                  <span style={{ fontSize: 14 }}>
                    {c.motivo === 'REASIGNACION' ? <>De <b>{c.asesorAnterior ?? 'repositorio'}</b> a <b>{c.asesorNuevo ?? 'repositorio'}</b></>
                      : c.motivo === 'LIBERACION' ? <><b>{c.asesorAnterior ?? '—'}</b> la perdió por inactividad</>
                      : <>Ahora con <b>{c.asesorNuevo ?? '—'}</b></>}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--texto-suave)' }}>{c.motivo === 'LIBERACION' ? 'Sistema' : c.hechoPor} · {fecha(c.fecha)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}