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
  const [enDiferencias, setEnDiferencias] = useState<'CRM' | 'BASE'>('CRM');
  const [verExistentes, setVerExistentes] = useState<'diferencias' | 'todas'>('diferencias');

  useEffect(() => {
    basesApi.detalle(id).then(setC).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar'));
  }, [id]);

  async function aprobar() {
    setOcupado(true); setError('');
    try {
      const r = await basesApi.aprobar(id, enDiferencias);
      setC(r.carga);
      setAviso(`Listo: ${r.creadas} empresas nuevas${r.actualizadas ? ` y ${r.actualizadas} que ya estaban en el CRM con sus datos completados` : ''}. No se creó ninguna empresa repetida.${r.completaSunat ? ' Los representantes legales que falten se completarán desde SUNAT en los próximos minutos.' : ''}`);
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
          <p>Subido por {c.subidoPor} · {fecha(c.fecha)} · {c.origen === 'COMPRADA' ? `Base comprada${c.proveedor ? ` a ${c.proveedor}` : ''}` : 'Base propia'} · nuevas {c.asignarA ? `para ${c.asignarA}` : 'al repositorio (libres)'}</p>
        </div>
        <span className={`chip ${c.estado === 'LISTO' ? 'chip--lima' : pendiente ? 'chip--crema' : 'chip--gris'}`}>{TEXTO_ESTADO_CARGA[c.estado]}</span>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}
      {c.estado === 'RECHAZADO' && <div className="alerta" role="alert"><b>Rechazada por {c.revisadoPor}:</b> “{c.motivoRechazo}”</div>}
      {c.estado === 'LISTO' && c.revisadoPor && <div className="aviso" role="status">Aprobada por {c.revisadoPor}{c.revisadoAt ? ` el ${fecha(c.revisadoAt)}` : ''} · las empresas ya están en el CRM{c.enDiferencias ? ` (en las diferencias se ${c.enDiferencias === 'BASE' ? 'usaron los datos de la base' : 'mantuvieron los datos del CRM'})` : ''}.</div>}

      <div className="kpis">
        <section className="kpi vidrio"><span className="kpi__titulo">Filas leídas</span><span className="kpi__valor numeros">{c.total}</span></section>
        <section className="kpi vidrio"><span className="kpi__titulo">{c.estado === 'LISTO' ? 'Empresas creadas' : 'Empresas nuevas'}</span><span className="kpi__valor numeros">{c.estado === 'LISTO' ? c.creadas : c.nuevas}</span></section>
        <section className="kpi vidrio"><span className="kpi__titulo">{c.estado === 'LISTO' ? 'Ya estaban: datos completados' : 'Ya están en el CRM (no se duplican)'}</span><span className="kpi__valor numeros">{c.estado === 'LISTO' ? c.actualizadas : c.actualizar}</span></section>
        <section className="kpi vidrio"><span className="kpi__titulo">Ya están, sin datos nuevos</span><span className="kpi__valor numeros">{c.iguales}</span></section>
        <section className="kpi vidrio"><span className="kpi__titulo">Con error (no se cargan)</span><span className="kpi__valor numeros">{c.conError}</span></section>
      </div>

      {pendiente && (
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {c.puedeRevisar ? (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                Al aprobar se crearán <b>{c.nuevas} {c.nuevas === 1 ? 'empresa nueva' : 'empresas nuevas'}</b> {c.asignarA ? <>a cargo de <b>{c.asignarA}</b></> : <>libres en el <b>repositorio</b></>}
                {c.actualizar > 0 && <> y se completarán los datos de <b>{c.actualizar} que ya están en el CRM</b> (sin cambiar a su asesor)</>}. No se crea ninguna empresa repetida. Las filas con error no se cargan.
              </p>
              {c.conDiferencias > 0 && (
                <div className="campo">
                  <span className="etiqueta obligatorio">{c.conDiferencias} {c.conDiferencias === 1 ? 'empresa tiene' : 'empresas tienen'} datos distintos al CRM. ¿Cuál se queda?</span>
                  <div className="pestanas" role="radiogroup" aria-label="Qué dato se queda cuando hay diferencias">
                    <button type="button" role="radio" aria-checked={enDiferencias === 'CRM'} className={`pestana${enDiferencias === 'CRM' ? ' pestana--activa' : ''}`} onClick={() => setEnDiferencias('CRM')}>Mantener los del CRM</button>
                    <button type="button" role="radio" aria-checked={enDiferencias === 'BASE'} className={`pestana${enDiferencias === 'BASE' ? ' pestana--activa' : ''}`} onClick={() => setEnDiferencias('BASE')}>Usar los de la base</button>
                  </div>
                  <span className="campo-ayuda">
                    {enDiferencias === 'CRM'
                      ? 'Recomendado: los datos que ya registraron las ejecutivas no se tocan; solo se agrega lo que falta.'
                      : 'Los datos de la base reemplazan a los del CRM en las diferencias de la tabla de abajo. Úsalo si la base es más reciente o confiable.'}
                  </span>
                </div>
              )}
              {!rechazando ? (
                <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="boton-secundario" onClick={() => setRechazando(true)}>Rechazar</button>
                  <button type="button" className="boton" disabled={ocupado || c.validas === 0} onClick={aprobar}>{ocupado ? 'Cargando empresas…' : `Aprobar: ${c.nuevas} nuevas${c.actualizar ? ` y ${c.actualizar} a completar` : ''}`}</button>
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

      {pendiente && c.existentes.length > 0 && (
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="panel-titulo">
            <h2 className="h2">Ya están en el CRM · {c.actualizar}</h2>
            <div className="pestanas" role="group" aria-label="Qué empresas ver">
              <button type="button" className={`pestana${verExistentes === 'diferencias' ? ' pestana--activa' : ''}`} onClick={() => setVerExistentes('diferencias')}>Con diferencias · {c.conDiferencias}</button>
              <button type="button" className={`pestana${verExistentes === 'todas' ? ' pestana--activa' : ''}`} onClick={() => setVerExistentes('todas')}>Todas</button>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--texto-suave)' }}>
            No se duplican: en <b>verde</b> lo que la base agrega porque el CRM no lo tiene; en <b>rojo</b> lo que es distinto en ambas bases.
          </p>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th>Empresa</th><th>Asesor</th><th>Se agrega</th><th>Diferencias (CRM → base)</th></tr></thead>
              <tbody>
                {c.existentes.filter((x) => verExistentes === 'todas' || x.diferencias.length).map((x) => (
                  <tr key={x.fila}>
                    <td><b>{x.razonSocial}</b><span className="tenue numeros" style={{ display: 'block', fontSize: 13 }}>RUC {x.ruc} · fila {x.fila}</span></td>
                    <td>{x.asesor ?? <span className="tenue">Libre</span>}</td>
                    <td>{x.completa.length ? <ul className="cambios cambios--agrega">{x.completa.map((t) => <li key={t}>{t}</li>)}</ul> : <span className="tenue">—</span>}</td>
                    <td>{x.diferencias.length ? (
                      <ul className="cambios cambios--difiere">
                        {x.diferencias.map((d) => <li key={d.campo}><b>{d.campo}:</b> {d.crm} → <b>{d.base}</b></li>)}
                      </ul>
                    ) : <span className="tenue">Coinciden</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.actualizar > c.existentes.length && <span className="tenue" style={{ fontSize: 13 }}>Se muestran {c.existentes.length} de {c.actualizar}.</span>}
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
          <h2 className="h2">Empresas nuevas · primeras {c.muestra.length} de {c.nuevas}</h2>
          {c.incompletas > 0 && (
            <div className="alerta" role="note">
              {c.incompletas} de {c.nuevas} empresas nuevas llegan con datos incompletos (falta representante con DNI y correo, ubicación, cantidad de líneas u operador).
              Se pueden cargar igual, pero las ejecutivas tendrán que completarlos.
            </div>
          )}
          <div className="tabla-scroll">
            <table className="tabla">
              <thead><tr><th className="num">Fila</th><th>RUC</th><th>Razón social</th><th>Representante legal</th><th>Ubicación</th><th className="num">Líneas</th><th>Operador</th></tr></thead>
              <tbody>
                {c.muestra.map((m) => (
                  <tr key={m.fila}>
                    <td className="num">{m.fila}</td>
                    <td className="numeros">{m.ruc}</td>
                    <td>{m.razonSocial}</td>
                    <td>{m.representante ?? <span className="tenue">Sin representante</span>}</td>
                    <td>{m.distrito ? `${m.distrito} · ${m.provincia}` : <span className="tenue">Sin ubicación</span>}</td>
                    <td className="num">{m.lineas ?? '—'}</td>
                    <td>{m.operador ?? <span className="tenue">—</span>}</td>
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