import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { horaCorta, TEXTO_CANAL } from '../../api/gestiones';
import { soles, TEXTO_ESTADO_VENTA, TEXTO_ETAPA } from '../../api/negociaciones';
import { mesLargo, pct, tablerosApi, variacion, type TableroAsesor } from '../../api/tableros';
import { Barras, BarraMeta } from '../../componentes/graficos';
import { useSesion } from '../../sesion/SesionContext';
import '../negociaciones/negociaciones.css';
import './tableros.css';

/** Inicio del asesor: meta del mes, lo que falta activar, agenda de hoy y negociaciones */
export function InicioAsesor() {
  const { usuario } = useSesion();
  const [t, setT] = useState<TableroAsesor | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    tablerosApi.asesor().then(setT).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar tu inicio'));
  }, []);

  if (error) return <div className="alerta" role="alert">{error}</div>;
  if (!t) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  const avance = pct(t.activas.lineas, t.metaLineas);
  const faltan = t.metaLineas ? Math.max(0, t.metaLineas - t.activas.lineas) : null;
  const vari = variacion(t.activas.lineas, t.lineasMesAnterior);
  const etapas = (['PROSPECCION', 'CONTACTO', 'NEGOCIACION'] as const).map((e) => {
    const f = t.embudo.find((x) => x.etapa === e);
    return { etiqueta: TEXTO_ETAPA[e], valor: f?.cantidad ?? 0, detalle: f ? soles(f.cargo) : undefined };
  });

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <span className="encabezado__antetitulo">{mesLargo(t.mes)}</span>
          <h1>Hola, {usuario?.nombres.split(' ')[0]}</h1>
          <p className="saludo">
            {t.metaLineas === null ? 'Tu supervisor todavía no definió tu meta de este mes.'
              : faltan === 0 ? <>¡Cumpliste tu meta de <b>{t.metaLineas} líneas</b>!</>
              : <>Te faltan <b>{faltan} líneas activas</b> para tu meta de {t.metaLineas}. Tienes <b>{t.porActivar.lineas}</b> más en validación.</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/empresas/nueva" className="boton">+ Nuevo prospecto</Link>
          <Link to="/agenda" className="boton-secundario">Mi agenda</Link>
        </div>
      </div>

      <div className="kpis">
        <section className="kpi vidrio">
          <span className="kpi__titulo">Líneas activas del mes</span>
          <span className="kpi__valor numeros">{t.activas.lineas}{t.metaLineas !== null && <small> / {t.metaLineas}</small>}</span>
          <BarraMeta logrado={t.activas.lineas} meta={t.metaLineas} proyeccion={t.proyeccion} etiqueta="Avance de tu meta" />
          <span className="kpi__detalle">{avance !== null ? `${avance}% · proyección al cierre: ${t.proyeccion}` : `Proyección al cierre: ${t.proyeccion}`}</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Ventas activas</span>
          <span className="kpi__valor numeros">{t.activas.ventas}</span>
          <span className="kpi__detalle">{soles(t.activas.cargo)} en cargo fijo mensual</span>
          {vari && <span className="kpi__detalle"><span className={`kpi__variacion${vari.startsWith('−') ? ' kpi__variacion--baja' : ''}`}>{vari}</span> líneas vs. mes anterior</span>}
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Por activar</span>
          <span className="kpi__valor numeros">{t.porActivar.lineas} <small>líneas</small></span>
          <span className="kpi__detalle">{t.porActivar.ventas} {t.porActivar.ventas === 1 ? 'venta' : 'ventas'} en validación o posventa</span>
          {t.porActivar.observadas > 0 && <span className="kpi__detalle" style={{ color: 'var(--salir)', fontWeight: 700 }}>{t.porActivar.observadas} observada(s): corrígelas</span>}
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Posición en tu equipo</span>
          <span className="kpi__valor numeros">{t.posicion ? `${t.posicion}.º` : '—'}{t.tamanoEquipo > 0 && <small> de {t.tamanoEquipo}</small>}</span>
          <span className="kpi__detalle">{t.prospectos} prospectos en tu cartera</span>
        </section>
      </div>

      <div className="rejilla-tablero">
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel-titulo">
            <h2 className="h2">Agenda de hoy</h2>
            <Link to="/agenda" className="boton-texto" style={{ textDecoration: 'none' }}>Ver agenda →</Link>
          </div>
          {t.noRealizadas > 0 && (
            <div className="alerta" role="alert">Tienes {t.noRealizadas} {t.noRealizadas === 1 ? 'gestión no realizada' : 'gestiones no realizadas'} de días anteriores. <Link to="/agenda">Revisar</Link></div>
          )}
          {t.agendaHoy.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>No tienes gestiones agendadas para hoy.</p>}
          {t.agendaHoy.map((g) => (
            <div key={g.id} className="fila-op">
              <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', minWidth: 0 }}>
                <b className="numeros" style={{ fontFamily: 'var(--fuente-titulos)', fontSize: 17 }}>{horaCorta(g.proximaAccion)}</b>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <Link to={`/empresas/${g.clienteId}#gestiones`} className="recortar">{g.razonSocial}</Link>
                  <span className="tenue recortar">{g.comentario}</span>
                </div>
              </div>
              <span className="chip chip--gris">{TEXTO_CANAL[g.proximoCanal]}</span>
              <span />
            </div>
          ))}
        </section>

        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel-titulo">
            <h2 className="h2">Negociaciones abiertas</h2>
            <Link to="/negociaciones" className="boton-texto" style={{ textDecoration: 'none' }}>Embudo →</Link>
          </div>
          <Barras datos={etapas} titulo="Negociaciones abiertas por etapa" />
        </section>
      </div>

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="h2">Últimas negociaciones</h2>
        {t.ultimas.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Aún no tienes negociaciones.</p>}
        {t.ultimas.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Código</th><th>Empresa</th><th className="num">Líneas</th><th className="num">Cargo fijo</th><th>Estado</th></tr></thead>
              <tbody>
                {t.ultimas.map((n) => (
                  <tr key={n.id}>
                    <td className="numeros"><Link to={`/negociaciones/${n.id}`} style={{ textDecoration: 'none' }}>{n.codigo}</Link></td>
                    <td>{n.razonSocial}</td>
                    <td className="num">{n.lineas}</td>
                    <td className="num">{soles(n.total)}</td>
                    <td>{n.resultado === 'EN_CURSO' ? TEXTO_ETAPA[n.etapa] : n.resultado === 'PERDIDA' ? 'Perdida' : n.estadoVenta ? TEXTO_ESTADO_VENTA[n.estadoVenta] : 'Ganada'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}