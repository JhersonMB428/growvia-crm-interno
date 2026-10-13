import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { TEXTO_CANAL } from '../../api/gestiones';
import {
  estadoDe, negociacionesApi, resumenLineas, soles, TEXTO_ETAPA, TEXTO_SERVICIO, type NegociacionDetalle,
} from '../../api/negociaciones';
import { FormGestion } from '../../componentes/FormGestion';
import './negociaciones.css';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function FichaNegociacion() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [aviso, setAviso] = useState((useLocation().state as { aviso?: string } | null)?.aviso ?? '');
  const [n, setN] = useState<NegociacionDetalle | null>(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cierre, setCierre] = useState<'' | 'GANADA' | 'PERDIDA'>('');
  const [enviado, setEnviado] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');
  const [comentando, setComentando] = useState(false);

  const cargar = () => negociacionesApi.detalle(id).then(setN);

  useEffect(() => {
    negociacionesApi.detalle(id).then(setN).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la negociación'));
    negociacionesApi.catalogos().then((c) => setMotivos(c.motivosPerdida)).catch(() => undefined);
  }, [id]);

  async function ejecutar(accion: () => Promise<NegociacionDetalle>, mensaje: string) {
    setOcupado(true); setError(''); setAviso('');
    try { setN(await accion()); setAviso(mensaje); setCierre(''); setEnviado(false); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción'); }
    finally { setOcupado(false); }
  }

  if (error && !n) return <div className="alerta" role="alert">{error}</div>;
  if (!n) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  const motivoFinal = motivo === 'Otro' ? otro.trim() : motivo;
  const enCurso = n.resultado === 'EN_CURSO';
  const chip = n.resultado === 'GANADA' ? 'chip--lima' : n.resultado === 'PERDIDA' ? 'chip--crema' : 'chip--gris';

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <button type="button" className="boton-texto" style={{ alignSelf: 'flex-start', minHeight: 0 }} onClick={() => navegar(-1)}>← Volver</button>
          <h1>{n.razonSocial}</h1>
          <p className="numeros">{n.codigo}{n.servicio ? ` · ${TEXTO_SERVICIO[n.servicio]}` : ''} · RUC {n.ruc}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`chip ${chip}`}>{enCurso ? `En curso · ${estadoDe(n)}` : estadoDe(n)}</span>
          <Link to={`/empresas/${n.clienteId}`} className="boton-secundario">Ver empresa</Link>
          {n.puedeEditar && <Link to={`/negociaciones/${n.id}/editar`} className="boton-secundario">Editar servicios</Link>}
        </div>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Etapa */}
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="fila-acciones">
              <h2 className="h2">Etapa</h2>
              {n.puedeEditar && <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>Toca una etapa para mover la negociación</span>}
            </div>
            <div className="etapas">
              {(['NEGOCIACION', 'CIERRE'] as const).map((e) => {
                const clase = `etapa${n.etapa === e ? ' etapa--actual' : e === 'NEGOCIACION' && n.etapa === 'CIERRE' ? ' etapa--hecha' : ''}`;
                return n.puedeEditar ? (
                  <button key={e} type="button" className={clase} disabled={ocupado || n.etapa === e} aria-pressed={n.etapa === e}
                    onClick={() => ejecutar(() => negociacionesApi.cambiarEtapa(n.id, e), `Pasó a ${TEXTO_ETAPA[e]}.`)}>{TEXTO_ETAPA[e]}</button>
                ) : <span key={e} className={clase}>{TEXTO_ETAPA[e]}</span>;
              })}
            </div>

            {enCurso && n.etapa === 'NEGOCIACION' && (
              <p style={{ margin: 0, color: 'var(--texto-suave)', lineHeight: 1.5, fontSize: 14 }}>
                Cuando el cliente acepte la oferta, pásala a <b>Cierre</b>. Desde ahí se marca como ganada, una vez enviado el expediente a back office por correo.
              </p>
            )}
            {enCurso && n.etapa === 'CIERRE' && (
              <p style={{ margin: 0, color: 'var(--texto-suave)', lineHeight: 1.5, fontSize: 14 }}>
                El cliente aceptó. Envía el expediente a back office <b>por correo</b> y, cuando esté enviado, márcala como ganada{n.puedeEditar ? ' (tu supervisor también puede hacerlo)' : ''}.
              </p>
            )}
            {n.resultado === 'PERDIDA' && <p style={{ margin: 0, color: 'var(--texto-suave)' }}><b>Motivo:</b> {n.motivoPerdida}</p>}
            {n.resultado === 'GANADA' && <div className="aviso" role="status">Venta ganada el {fecha(n.fechaCierre!)}. Ya suma a la meta.</div>}

            {(n.puedeEditar || n.puedeGanar) && !cierre && (
              <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                {n.puedeEditar && <button type="button" className="boton-secundario" onClick={() => { setCierre('PERDIDA'); setMotivo(''); setOtro(''); }}>Marcar como perdida</button>}
                {n.puedeGanar && <button type="button" className="boton" onClick={() => { setCierre('GANADA'); setEnviado(false); }}>Marcar como ganada</button>}
              </div>
            )}

            {cierre === 'GANADA' && (
              <div className="bloque" role="group" aria-label="Confirmar venta ganada">
                <b>¿Marcar la venta como ganada?</b>
                <span style={{ color: 'var(--texto-suave)', lineHeight: 1.5 }}>
                  {resumenLineas(n)} · {soles(n.total)} mensual sin IGV. Ya no se podrán editar los servicios y sumará a la meta.
                </span>
                <label className="casilla">
                  <input type="checkbox" checked={enviado} onChange={(e) => setEnviado(e.target.checked)} />
                  <span>Ya se envió el expediente a back office por correo</span>
                </label>
                <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="boton-secundario" onClick={() => setCierre('')}>Cancelar</button>
                  <button type="button" className="boton" disabled={ocupado || !enviado}
                    onClick={() => ejecutar(() => negociacionesApi.ganar(n.id), '¡Venta ganada! Ya suma a la meta.')}>
                    {ocupado ? 'Guardando…' : 'Sí, marcar como ganada'}
                  </button>
                </div>
              </div>
            )}

            {cierre === 'PERDIDA' && (
              <div className="bloque" role="group" aria-label="Marcar como perdida">
                <label htmlFor="motivo" className="etiqueta">¿Por qué se perdió?</label>
                <select id="motivo" className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  <option value="">Elige el motivo</option>
                  {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {motivo === 'Otro' && (
                  <input className="entrada" aria-label="Describe el motivo" placeholder="Describe el motivo" maxLength={200} value={otro} onChange={(e) => setOtro(e.target.value)} />
                )}
                <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="boton-secundario" onClick={() => setCierre('')}>Cancelar</button>
                  <button type="button" className="boton" disabled={ocupado || motivoFinal.length < 3}
                    onClick={() => ejecutar(() => negociacionesApi.perder(n.id, motivoFinal), 'La negociación se cerró como perdida.')}>
                    Cerrar como perdida
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Servicios */}
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 className="h2">Servicios negociados</h2>
            <div className="planes planes--lectura">
              <div className="planes__cabecera" aria-hidden="true">
                <span>Servicio</span><span>Modalidad</span><span>Viene de</span><span>Equipo</span><span>Cantidad</span><span>Cargo sin IGV c/u</span><span style={{ textAlign: 'right' }}>Subtotal</span>
              </div>
              {n.items.map((it) => (
                <div key={it.id} className="planes__fila">
                  <span><b>{it.plan}</b> <span style={{ color: 'var(--texto-tenue)', fontSize: 12 }}>{it.tipoPlan === 'MOVIL' ? 'Móvil' : 'Fija'}</span></span>
                  <span>{it.modalidad === 'PORTABILIDAD' ? 'Portabilidad' : 'Línea nueva'}</span>
                  <span>{it.operadorOrigen ?? '—'}</span>
                  <span>{it.conEquipo ? 'Con equipo' : 'Sin equipo'}</span>
                  <span className="numeros">{it.cantidad}</span>
                  <span className="numeros">{soles(it.cargoFijoUnit)}</span>
                  <span className="planes__subtotal numeros">{soles(it.subtotal ?? 0)}</span>
                </div>
              ))}
            </div>
            <div className="planes__total"><span>Subtotal sin IGV</span><b className="numeros">{soles(n.total)}</b></div>
          </section>

          {/* Comentarios: se guardan como gestiones de la empresa */}
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="fila-acciones">
              <h2 className="h2">Comentarios de la negociación</h2>
              {n.puedeComentar && !comentando && <button type="button" className="boton-secundario" onClick={() => setComentando(true)}>+ Registrar gestión</button>}
            </div>
            {comentando && (
              <FormGestion empresaId={n.clienteId} idBase="neg" textoBoton="Guardar comentario"
                onCancelar={() => setComentando(false)}
                onGuardada={() => { setComentando(false); setAviso('Comentario guardado en las gestiones de la empresa.'); cargar().catch(() => undefined); }} />
            )}
            {n.gestiones.length === 0 && !comentando && (
              <p style={{ margin: 0, color: 'var(--texto-suave)' }}>
                Aún no hay comentarios. Cada gestión que registres mientras la negociación está abierta aparece aquí.
              </p>
            )}
            <ol className="comentarios">
              {n.gestiones.map((g) => (
                <li key={g.id}>
                  <span style={{ fontSize: 14 }}>“{g.comentario}”</span>
                  <span className="comentarios__meta">{TEXTO_CANAL[g.canal]} · {g.usuario} · {fecha(g.fecha)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="dato">
              <span>Subtotal sin IGV</span>
              <span className="total-grande numeros">{soles(n.total)}</span>
              <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>mensual · {resumenLineas(n)}</span>
            </div>
            <div className="rejilla-2">
              <div className="dato"><span>Asesor</span><b>{n.asesor}</b></div>
              <div className="dato"><span>Equipo</span><b>{n.equipo ?? '—'}</b></div>
              <div className="dato"><span>Abierta</span><b>{fecha(n.creadoAt)}</b></div>
              <div className="dato"><span>Cierre</span><b>{n.fechaCierre ? fecha(n.fechaCierre) : '—'}</b></div>
            </div>
          </section>

          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2 className="h2">Historial</h2>
            <ol className="comentarios">
              {n.historial.map((h, i) => (
                <li key={i}>
                  <b style={{ fontSize: 14 }}>{h.detalle ?? `${h.etapaAnterior ? TEXTO_ETAPA[h.etapaAnterior] : 'Inicio'} → ${TEXTO_ETAPA[h.etapaNueva]}`}</b>
                  <span className="comentarios__meta">{h.usuario} · {fecha(h.fecha)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}