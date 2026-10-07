import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { basesApi, TEXTO_ESTADO_CARGA, TEXTO_MOTIVO, type CargaDetalle, type MotivoError } from '../../api/bases';
import { ErrorApi } from '../../api/cliente';
import { avisarCampana } from '../../api/gestiones';
import '../tableros/tableros.css';
import './bases.css';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Resultado de la revisión de un archivo: errores, vista previa y aprobación */
export function DetalleBase() {
  const { id = '' } = useParams();
  const [aviso, setAviso] = useState((useLocation().state as { aviso?: string } | null)?.aviso ?? '');
  const [c, setC] = useState<CargaDetalle | null>(null);
  const [error, setError] = useState('');
  const [filtro, setFiltro] = useState<MotivoError | ''>('');
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    basesApi.detalle(id).then(setC).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar'));
  }, [id]);

  async function aprobar() {
    setOcupado(true); setError('');
    try {
      const r = await basesApi.aprobar(id);
      setC(r.carga);
      setAviso(`Listo: se crearon ${r.creadas} empresas${r.yaExistian ? ` (${r.yaExistian} se registraron mientras tanto y no se duplicaron)` : ''}.`);
      avisarCampana();
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo aprobar'); }
    finally { setOcupado(false); }
  }

  async function rechazar() {
    setOcupado(true); setError('');
    try { setC(await basesApi.rechazar(id, motivo)); setRechazando(false); setAviso('La carga fue rechazada.'); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo rechazar'); }
    finally { setOcupado(false); }
  }

  if (error && !c) return <div className="alerta" role="alert">{error}</div>;
  if (!c) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  const motivos = [...new Set(c.errores.map((e) => e.motivo))];
  const errores = filtro ? c.errores.filter((e) => e.motivo === filtro) : c.errores;
  const pendiente = c.estado === 'PENDIENTE_APROBACION';

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <nav aria-label="Ruta" style={{ fontSize: 14 }}><Link to="/bases" style={{ textDecoration: 'none' }}>Cargar base</Link> <span style={{ color: 'var(--texto-tenue)' }}>/ Detalle</span></nav>
          <h1 className="recortar" style={{ maxWidth: '70vw' }}>{c.archivo}</h1>
          <p>Subido por {c.subidoPor} · {fecha(c.fecha)} · {c.asignarA ? `para ${c.asignarA}` : 'al repositorio (libres)'}</p>
        </div>
        <span className={`chip ${c.estado === 'LISTO' ? 'chip--lima' : pendiente ? 'chip--crema' : 'chip--gris'}`}>{TEXTO_ESTADO_CARGA[c.estado]}</span>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}
      {c.estado === 'RECHAZADO' && <div className="alerta" role="alert"><b>Rechazada por {c.revisadoPor}:</b> “{c.motivoRechazo}”</div>}
      {c.estado === 'LISTO' && c.revisadoPor && <div className="aviso" role="status">Aprobada por {c.revisadoPor}{c.revisadoAt ? ` el ${fecha(c.revisadoAt)}` : ''}. Las empresas ya están en el CRM.</div>}

      <div className="kpis">
        <section className="kpi vidrio"><span className="kpi__titulo">Filas leídas</span><span className="kpi__valor numeros">{c.total}</span></section>
        <section className="kpi vidrio"><span className="kpi__titulo">{c.estado === 'LISTO' ? 'Empresas creadas' : 'Listas para cargar'}</span><span className="kpi__valor numeros">{c.validas}</span></section>
        <section className="kpi vidrio"><span className="kpi__titulo">Con error (no se cargan)</span><span className="kpi__valor numeros">{c.conError}</span></section>
      </div>

      {pendiente && (
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {c.puedeRevisar ? (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                Al aprobar se crearán <b>{c.validas} empresas</b> {c.asignarA ? <>a cargo de <b>{c.asignarA}</b></> : <>libres en el <b>repositorio</b></>}. Las filas con error no se cargan.
              </p>
              {!rechazando ? (
                <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="boton-secundario" onClick={() => setRechazando(true)}>Rechazar</button>
                  <button type="button" className="boton" disabled={ocupado || c.validas === 0} onClick={aprobar}>{ocupado ? 'Cargando empresas…' : `Aprobar y cargar ${c.validas}`}</button>
                </div>
              ) : (
                <div className="bloque">
                  <label htmlFor="motivo" className="etiqueta">Motivo del rechazo</label>
                  <input id="motivo" className="entrada" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. La base es de otra zona" />
                  <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="boton-secundario" onClick={() => setRechazando(false)}>Cancelar</button>
                    <button type="button" className="boton" disabled={ocupado || motivo.trim().length < 3} onClick={rechazar}>Rechazar carga</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Esperando la aprobación de tu supervisor. Te avisaremos en la campanita.</p>
          )}
        </section>
      )}

      {c.errores.length > 0 && (
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel-titulo">
            <h2 className="h2">Filas con error · {c.errores.length}</h2>
            <div className="pestanas" role="group" aria-label="Filtrar errores">
              <button type="button" className={`pestana${filtro === '' ? ' pestana--activa' : ''}`} onClick={() => setFiltro('')}>Todos</button>
              {motivos.map((m) => (
                <button key={m} type="button" className={`pestana${filtro === m ? ' pestana--activa' : ''}`} onClick={() => setFiltro(m)}>{TEXTO_MOTIVO[m]}</button>
              ))}
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--texto-suave)' }}>Corrige estas filas en tu Excel y súbelas en un archivo nuevo.</p>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th className="num">Fila</th><th>RUC</th><th>Razón social</th><th>Problema</th><th>Detalle</th></tr></thead>
              <tbody>
                {errores.map((e) => (
                  <tr key={e.fila}>
                    <td className="num">{e.fila}</td>
                    <td className="numeros">{e.ruc ?? '—'}</td>
                    <td>{e.datos?.razon || '—'}</td>
                    <td><span className="chip chip--crema">{TEXTO_MOTIVO[e.motivo]}</span></td>
                    <td className="tenue">{e.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pendiente && c.muestra.length > 0 && (
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Vista previa · primeras {c.muestra.length} de {c.validas}</h2>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th className="num">Fila</th><th>RUC</th><th>Razón social</th><th>Ubicación</th><th className="num">Contactos</th></tr></thead>
              <tbody>
                {c.muestra.map((m) => (
                  <tr key={m.fila}>
                    <td className="num">{m.fila}</td>
                    <td className="numeros">{m.ruc}</td>
                    <td>{m.razonSocial}</td>
                    <td>{m.distrito ? `${m.distrito} · ${m.provincia}` : <span className="tenue">Sin ubicación</span>}</td>
                    <td className="num">{m.contactos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}