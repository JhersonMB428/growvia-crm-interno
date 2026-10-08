import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { avisarCampana } from '../../api/gestiones';
import { resumenLineas, soles, TEXTO_TIPO } from '../../api/negociaciones';
import { ExpedienteVenta } from '../../componentes/ExpedienteVenta';
import { TEXTO_EVENTO, validacionApi, type Bandeja, type EventoPosventa, type PuntoChecklist, type VentaEnBandeja } from '../../api/validacion';
import './validacion.css';

type Modo = 'aprobar' | 'revisar' | 'validar';

const TEXTOS: Record<Modo, { titulo: string; descripcion: string; vacio: string }> = {
  aprobar: {
    titulo: 'Aprobaciones de mi equipo',
    descripcion: 'Paso 1: aprueba las ventas de tus asesores u obsérvalas para que las corrijan.',
    vacio: 'No tienes ventas por aprobar.',
  },
  revisar: {
    titulo: 'Revisión de ventas',
    descripcion: 'Paso 2: revisa en paralelo sin frenar la venta. Puedes dar visto bueno, observarla o detenerla.',
    vacio: 'No hay ventas en validación.',
  },
  validar: {
    titulo: 'Validación y posventa',
    descripcion: 'Paso 3: valida las ventas aprobadas y registra la entrega de chips, la portabilidad y la activación.',
    vacio: 'No hay ventas por validar.',
  },
};

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });

/** Una sola pantalla para las tres bandejas: /aprobaciones (supervisor), /revision (gerencia), /validacion (back office) */
export function BandejaVentas({ modo }: { modo: Modo }) {
  const [pestana, setPestana] = useState<Bandeja>(modo);
  const [filas, setFilas] = useState<VentaEnBandeja[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [checklist, setChecklist] = useState<PuntoChecklist[]>([]);
  const t = TEXTOS[modo];

  useEffect(() => {
    if (modo === 'validar') validacionApi.checklist().then(setChecklist).catch(() => undefined);
  }, [modo]);

  const cargar = useCallback(() => {
    validacionApi.bandeja(pestana)
      .then((r) => { setFilas(r.filas); setError(''); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la bandeja'));
  }, [pestana]);
  useEffect(() => { setFilas(null); cargar(); }, [cargar]);

  function hecho(mensaje: string) {
    setAviso(mensaje);
    cargar();
    avisarCampana();
  }

  return (
    <>
      <div className="encabezado">
        <h1>{t.titulo}</h1>
        <p>{t.descripcion}</p>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {modo === 'validar' && (
          <div className="pestanas" role="group" aria-label="Bandeja" style={{ alignSelf: 'flex-start' }}>
            {([['validar', 'Por validar'], ['posventa', 'Posventa']] as [Bandeja, string][]).map(([v, txt]) => (
              <button key={v} type="button" className={`pestana${pestana === v ? ' pestana--activa' : ''}`} aria-pressed={pestana === v} onClick={() => setPestana(v)}>{txt}</button>
            ))}
          </div>
        )}
        {error && <div className="alerta" role="alert">{error}</div>}
        {!filas && !error && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>Cargando…</p>}
        {filas?.length === 0 && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>{pestana === 'posventa' ? 'No hay ventas en posventa.' : t.vacio}</p>}
        {filas?.map((v) => <TarjetaVenta key={v.id} v={v} bandeja={pestana} checklist={checklist} onHecho={hecho} />)}
      </section>
    </>
  );
}

function TarjetaVenta({ v, bandeja, checklist, onHecho }: { v: VentaEnBandeja; bandeja: Bandeja; checklist: PuntoChecklist[]; onHecho: (m: string) => void }) {
  const [panel, setPanel] = useState<'' | 'observar' | 'detener' | 'validar'>('');
  const [motivo, setMotivo] = useState('');
  const [marcados, setMarcados] = useState<number[]>([]);
  const [orden, setOrden] = useState(v.ordenOperador ?? '');
  const [docs, setDocs] = useState(v.documentos);
  const [verExpediente, setVerExpediente] = useState(false);  // Puntos que aplican a esta venta (la carta de portabilidad solo si hay portabilidades)
  const puntos = checklist.filter((p) => !p.soloPortabilidad || v.portabilidades > 0);
  const faltan = puntos.filter((p) => !marcados.includes(p.id));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function ejecutar(accion: () => Promise<{ anulada?: boolean }>, mensaje: string) {
    setOcupado(true); setError('');
    try {
      const r = await accion();
      onHecho(r.anulada ? `${v.codigo} se anuló: superó el máximo de correcciones.` : mensaje);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo completar la acción');
    } finally {
      setOcupado(false);
    }
  }

  const hecho = (e: EventoPosventa) => v.eventos.includes(e);
  const listoActivar = hecho('CHIPS_ENTREGADOS') && (v.portabilidades === 0 || hecho('PORTABILIDAD_EJECUTADA'));

  return (
    <article className={`venta${v.correcciones > 0 ? ' venta--observada' : ''}`}>
      <div className="venta__cabecera">
        <div className="venta__titulo">
          <Link to={`/negociaciones/${v.id}`}>{v.razonSocial}</Link>
          <span className="tenue numeros">{v.codigo} · {TEXTO_TIPO[v.tipo]} · RUC {v.ruc}</span>
          <span className="tenue">{v.asesor}{v.equipo ? ` · ${v.equipo}` : ''} · ganada el {fecha(v.fechaCierre)}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {bandeja === 'revisar' && v.pasoActual && <span className="chip chip--gris">En: {v.pasoActual}</span>}
          {bandeja === 'revisar' && v.revisada && <span className="chip chip--lima">✓ Revisada</span>}
          {v.correcciones > 0 && <span className="chip chip--crema">Corrección {v.correcciones}</span>}
          <span className={`chip ${docs ? 'chip--gris' : 'chip--crema'}`}>{docs ? `${docs} ${docs === 1 ? 'documento' : 'documentos'}` : 'Sin documentos'}</span>        </div>
      </div>

      <div className="venta__datos">
        <span><b className="numeros">{soles(v.total)}</b> <span className="tenue">mensual</span></span>
        <span><b className="numeros">{v.lineas}</b> <span className="tenue">{v.lineas === 1 ? 'línea' : 'líneas'} · {resumenLineas(v)}</span></span>
      </div>

      {v.ultimaObservacion && <div className="venta__observacion"><b>Última observación:</b> {v.ultimaObservacion}</div>}

      {(panel === 'observar' || panel === 'detener') && (
        <div className="bloque">
          <label className="etiqueta" htmlFor={`m-${v.id}`}>{panel === 'observar' ? '¿Qué debe corregir el asesor?' : '¿Por qué se detiene la venta?'}</label>
          <textarea id={`m-${v.id}`} className="entrada" rows={3} style={{ height: 'auto', padding: '12px 16px', font: 'inherit' }}
            value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000}
            placeholder={panel === 'observar' ? 'Ej. Falta la carta de portabilidad firmada.' : 'Ej. El cliente tiene deuda pendiente.'} />
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => { setPanel(''); setMotivo(''); }}>Cancelar</button>
            <button type="button" className="boton" disabled={ocupado || motivo.trim().length < 3}
              onClick={() => ejecutar(
                () => (panel === 'observar' ? validacionApi.observar(v.id, motivo) : validacionApi.detener(v.id, motivo)),
                panel === 'observar' ? `${v.codigo} volvió a ${v.asesor} para corregir.` : `${v.codigo} se detuvo y quedó anulada.`,
              )}>
              {panel === 'observar' ? 'Enviar observación' : 'Detener venta'}
            </button>
          </div>
        </div>
      )}

      {panel === 'validar' && (
        <div className="bloque" role="group" aria-label="Checklist de validación">
          {/* Back office revisa los documentos antes de marcar el checklist */}
          <ExpedienteVenta negociacionId={v.id} compacto onCambio={setDocs} />
          <b>Checklist de back office</b>
          {puntos.map((p) => (
            <label key={p.id} className="casilla">
              <input type="checkbox" checked={marcados.includes(p.id)}
                onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))} />
              {p.texto}
            </label>
          ))}
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => setPanel('')}>Cancelar</button>
            {faltan.length > 0 && marcados.length > 0 && (
              <button type="button" className="boton-secundario"
                onClick={() => { setMotivo(`Falta: ${faltan.map((f) => f.texto.toLowerCase()).join('; ')}.`); setPanel('observar'); }}>
                Observar lo que falta
              </button>
            )}
            <button type="button" className="boton" disabled={ocupado || faltan.length > 0}
              onClick={() => ejecutar(() => validacionApi.validar(v.id, marcados), `${v.codigo} validada. Pasa a posventa.`)}>
              {faltan.length ? `Marca los ${faltan.length} puntos que faltan` : 'Validar'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="alerta" role="alert">{error}</div>}

      {!panel && bandeja !== 'posventa' && (
        <div className="venta__acciones">
          {bandeja === 'revisar' && <button type="button" className="boton-secundario boton-peligro" onClick={() => setPanel('detener')}>Detener</button>}
          <button type="button" className="boton-secundario" onClick={() => setPanel('observar')}>Observar</button>
          {bandeja === 'aprobar' && (
            <button type="button" className="boton" disabled={ocupado}
              onClick={() => ejecutar(() => validacionApi.aprobar(v.id), `${v.codigo} aprobada. Pasó a back office.`)}>Aprobar</button>
          )}
          {bandeja === 'revisar' && !v.revisada && (
            <button type="button" className="boton" disabled={ocupado}
              onClick={() => ejecutar(() => validacionApi.revisar(v.id), `Diste visto bueno a ${v.codigo}.`)}>Visto bueno</button>
          )}
          {bandeja === 'validar' && (
            <button type="button" className="boton" onClick={() => { setMarcados([]); setPanel('validar'); }}>Revisar y validar</button>
          )}
        </div>
      )}

      {bandeja === 'posventa' && (
        <div className="campo" style={{ maxWidth: 360 }}>
          <label htmlFor={`orden-${v.id}`} className="etiqueta">N° de orden del operador</label>
          <input id={`orden-${v.id}`} className="entrada" maxLength={40} placeholder="Ej. MOV-2026-884512" value={orden} onChange={(e) => setOrden(e.target.value)} />
        </div>
      )}
      {bandeja === 'posventa' && (
        <div className="pasos-posventa" aria-label="Pasos de posventa">
          {(['CHIPS_ENTREGADOS', ...(v.portabilidades > 0 ? ['PORTABILIDAD_EJECUTADA'] : []), 'SERVICIO_ACTIVO'] as EventoPosventa[]).map((e) => (
            <button key={e} type="button" className={`paso-posventa${hecho(e) ? ' paso-posventa--hecho' : ''}`}
              disabled={ocupado || hecho(e) || (e === 'SERVICIO_ACTIVO' && (!listoActivar || !orden.trim()))}
              title={e === 'SERVICIO_ACTIVO' && !orden.trim() ? 'Registra primero el N° de orden del operador' : undefined}
              onClick={() => ejecutar(() => validacionApi.posventa(v.id, e, orden.trim() || undefined),
                e === 'SERVICIO_ACTIVO' ? `${v.codigo} ya está activa y suma a la meta.` : `${v.codigo}: ${TEXTO_EVENTO[e].toLowerCase()}.`)}>
              {hecho(e) ? '✓ ' : ''}{TEXTO_EVENTO[e]}
            </button>
          ))}
        </div>
      )}
      {bandeja === 'posventa' && (
        <button type="button" className="boton-texto" style={{ alignSelf: 'flex-start', minHeight: 0, padding: 0 }}
          aria-expanded={verExpediente} onClick={() => setVerExpediente(!verExpediente)}>
          {verExpediente ? 'Ocultar expediente' : 'Ver expediente'}
        </button>
      )}
      {bandeja === 'posventa' && verExpediente && <ExpedienteVenta negociacionId={v.id} compacto onCambio={setDocs} />}
    </article>
  );
}