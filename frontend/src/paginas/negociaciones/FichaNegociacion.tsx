import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import {
  ETAPAS, negociacionesApi, resumenLineas, soles, TEXTO_ESTADO_VENTA, TEXTO_ETAPA, TEXTO_SERVICIO, TEXTO_TIPO,
  type Etapa, type NegociacionDetalle,
} from '../../api/negociaciones';
import './negociaciones.css';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const ORDEN: Etapa[] = ['PROSPECCION', 'CONTACTO', 'NEGOCIACION', 'CIERRE'];

export function FichaNegociacion() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const [aviso, setAviso] = useState((useLocation().state as { aviso?: string } | null)?.aviso ?? '');
  const [n, setN] = useState<NegociacionDetalle | null>(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [cierre, setCierre] = useState<'' | 'GANADA' | 'PERDIDA'>('');
  const [motivo, setMotivo] = useState('');
  const [otro, setOtro] = useState('');

  useEffect(() => {
    negociacionesApi.detalle(id).then(setN).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la negociación'));
    negociacionesApi.catalogos().then((c) => setMotivos(c.motivosPerdida)).catch(() => undefined);
  }, [id]);

  async function ejecutar(accion: () => Promise<NegociacionDetalle>, mensaje: string) {
    setOcupado(true); setError(''); setAviso('');
    try { setN(await accion()); setAviso(mensaje); setCierre(''); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción'); }
    finally { setOcupado(false); }
  }

  if (error && !n) return <div className="alerta" role="alert">{error}</div>;
  if (!n) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  const motivoFinal = motivo === 'Otro' ? otro.trim() : motivo;
  const indice = ORDEN.indexOf(n.etapa);

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <button type="button" className="boton-texto" style={{ alignSelf: 'flex-start', minHeight: 0 }} onClick={() => navegar(-1)}>← Volver</button>
          <h1>{n.razonSocial}</h1>
          <p className="numeros">{n.codigo} · {TEXTO_TIPO[n.tipo]}{n.servicio ? ` · ${TEXTO_SERVICIO[n.servicio]}` : ''} · RUC {n.ruc}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {n.resultado === 'EN_CURSO' && <span className="chip chip--gris">En curso · {TEXTO_ETAPA[n.etapa]}</span>}
          {n.resultado === 'GANADA' && n.estadoVenta && <span className="chip chip--lima">Ganada · {TEXTO_ESTADO_VENTA[n.estadoVenta]}</span>}
          {n.resultado === 'PERDIDA' && <span className="chip chip--crema">Perdida</span>}
          <Link to={`/empresas/${n.clienteId}`} className="boton-secundario">Ver empresa</Link>
          {n.puedeEditar && <Link to={`/negociaciones/${n.id}/editar`} className="boton-secundario">Editar planes</Link>}
        </div>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Etapas */}
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="fila-acciones">
              <h2 className="h2">Etapa</h2>
              {n.puedeEditar && <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>Toca una etapa para mover la negociación</span>}
            </div>
            <div className="etapas">
              {ETAPAS.map((e, i) => {
                const clase = `etapa${n.etapa === e.valor ? ' etapa--actual' : i < indice ? ' etapa--hecha' : ''}`;
                return n.puedeEditar ? (
                  <button key={e.valor} type="button" className={clase} disabled={ocupado || n.etapa === e.valor} aria-pressed={n.etapa === e.valor}
                    onClick={() => ejecutar(() => negociacionesApi.cambiarEtapa(n.id, e.valor), `Pasó a ${e.texto}.`)}>{e.texto}</button>
                ) : <span key={e.valor} className={clase}>{e.texto}</span>;
              })}
              <span className={`etapa${n.etapa === 'CIERRE' ? ' etapa--actual' : ''}`}>
                {n.resultado === 'GANADA' ? 'Cierre · ganada' : n.resultado === 'PERDIDA' ? 'Cierre · perdida' : 'Cierre'}
              </span>
            </div>

            {n.resultado === 'PERDIDA' && <p style={{ margin: 0, color: 'var(--texto-suave)' }}><b>Motivo:</b> {n.motivoPerdida}</p>}
            {n.resultado === 'GANADA' && (
              <p style={{ margin: 0, color: 'var(--texto-suave)', lineHeight: 1.5 }}>
                Se envió a validación: supervisor → gerencia → back office. Cuenta para la meta cuando el servicio queda activo.
              </p>
            )}

            {n.puedeEditar && !cierre && (
              <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="boton-secundario" onClick={() => { setCierre('PERDIDA'); setMotivo(''); setOtro(''); }}>Marcar como perdida</button>
                <button type="button" className="boton" onClick={() => setCierre('GANADA')}>Marcar como ganada</button>
              </div>
            )}

            {cierre === 'GANADA' && (
              <div className="bloque" role="group" aria-label="Confirmar venta ganada">
                <b>¿Confirmas que el cliente aceptó?</b>
                <span style={{ color: 'var(--texto-suave)', lineHeight: 1.5 }}>
                  {resumenLineas(n)} · {soles(n.total)} mensual. Ya no podrás editar los planes; pasará a la aprobación de tu supervisor.
                </span>
                <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="boton-secundario" onClick={() => setCierre('')}>Cancelar</button>
                  <button type="button" className="boton" disabled={ocupado}
                    onClick={() => ejecutar(() => negociacionesApi.cerrar(n.id, 'GANADA'), '¡Venta ganada! Se envió a la aprobación de tu supervisor.')}>
                    {ocupado ? 'Enviando…' : 'Sí, enviar a aprobación'}
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
                    onClick={() => ejecutar(() => negociacionesApi.cerrar(n.id, 'PERDIDA', motivoFinal), 'La negociación se cerró como perdida.')}>
                    Cerrar como perdida
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Planes */}
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 className="h2">Planes negociados</h2>
            <div className="planes planes--lectura">
              <div className="planes__cabecera" aria-hidden="true">
                <span>Plan</span><span>Modalidad</span><span>Viene de</span><span>Cantidad</span><span>Cargo fijo c/u</span><span style={{ textAlign: 'right' }}>Subtotal</span>
              </div>
              {n.items.map((it) => (
                <div key={it.id} className="planes__fila">
                  <span><b>{it.plan}</b> <span style={{ color: 'var(--texto-tenue)', fontSize: 12 }}>{it.tipoPlan === 'MOVIL' ? 'Móvil' : 'Fija'}</span></span>
                  <span>{it.modalidad === 'PORTABILIDAD' ? 'Portabilidad' : 'Línea nueva'}</span>
                  <span>{it.operadorOrigen ?? '—'}</span>
                  <span className="numeros">{it.cantidad}</span>
                  <span className="numeros">{soles(it.cargoFijoUnit)}</span>
                  <span className="planes__subtotal numeros">{soles(it.subtotal ?? 0)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="dato">
              <span>Cargo fijo total</span>
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
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {n.historial.map((h, i) => (
                <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 14, borderLeft: '2px solid var(--linea)' }}>
                  <b style={{ fontSize: 14 }}>{h.detalle ?? `${h.etapaAnterior ? TEXTO_ETAPA[h.etapaAnterior] : 'Inicio'} → ${TEXTO_ETAPA[h.etapaNueva]}`}</b>
                  <span style={{ fontSize: 13, color: 'var(--texto-suave)' }}>{h.usuario} · {fecha(h.fecha)}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}