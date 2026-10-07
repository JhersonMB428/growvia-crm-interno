import { useCallback, useEffect, useState } from 'react';
import {
  accesosMovilApi, diaLargo, diaMas, diasRestantes, DURACIONES, TEXTO_ESTADO_ACCESO, ultimoDia, type AccesoMovil, type VistaAccesos,
} from '../../api/accesosMovil';
import { ErrorApi } from '../../api/cliente';
import { avisarCampana } from '../../api/gestiones';
import './accesos.css';

const cuando = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const CHIP: Record<string, string> = { PENDIENTE: 'chip--crema', APROBADA: 'chip--lima', RECHAZADA: 'chip--gris', VENCIDA: 'chip--gris', REVOCADA: 'chip--gris' };

/** Gerencia: quién puede usar el CRM desde el celular y hasta cuándo */
export function AccesosCelular() {
  const [vista, setVista] = useState<VistaAccesos>('pendientes');
  const [datos, setDatos] = useState<{ filas: AccesoMovil[]; contadores: { pendientes: number; vigentes: number } } | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [dando, setDando] = useState(false);

  const cargar = useCallback(() => {
    accesosMovilApi.listar(vista).then((d) => { setDatos(d); setError(''); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar'));
  }, [vista]);
  useEffect(() => { setDatos(null); cargar(); }, [cargar]);

  function hecho(mensaje: string) { setAviso(mensaje); setDando(false); cargar(); avisarCampana(); }

  const c = datos?.contadores;
  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Acceso desde celular</h1>
          <p>El CRM está bloqueado en celulares. Aquí decides quién puede usarlo y hasta cuándo (máximo 30 días).</p>
        </div>
        {!dando && <button type="button" className="boton" onClick={() => { setDando(true); setAviso(''); }}>Dar acceso</button>}
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {dando && <DarAcceso onCancelar={() => setDando(false)} onHecho={hecho} />}

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="pestanas" role="group" aria-label="Vista" style={{ alignSelf: 'flex-start' }}>
          {([['pendientes', `Pendientes${c?.pendientes ? ` · ${c.pendientes}` : ''}`], ['vigentes', `Vigentes${c?.vigentes ? ` · ${c.vigentes}` : ''}`], ['historial', 'Historial']] as [VistaAccesos, string][]).map(([v, t]) => (
            <button key={v} type="button" className={`pestana${vista === v ? ' pestana--activa' : ''}`} aria-pressed={vista === v} onClick={() => setVista(v)}>{t}</button>
          ))}
        </div>
        {error && <div className="alerta" role="alert">{error}</div>}
        {!datos && !error && <p className="cel-acceso-vacio" style={{ margin: 0 }}>Cargando…</p>}
        {datos?.filas.length === 0 && (
          <p className="cel-acceso-vacio" style={{ margin: 0 }}>
            {vista === 'pendientes' ? 'No hay solicitudes por revisar.' : vista === 'vigentes' ? 'Nadie tiene acceso desde el celular en este momento.' : 'Todavía no hay historial.'}
          </p>
        )}
        {datos?.filas.map((a) => (vista === 'pendientes'
          ? <Solicitud key={a.id} a={a} onHecho={hecho} />
          : vista === 'vigentes' ? <Vigente key={a.id} a={a} onHecho={hecho} /> : <Historial key={a.id} a={a} />))}
      </section>
    </>
  );
}

/** Duración rápida (1, 3, 7, 15, 30 días) o un día exacto */
function ElegirFin({ hasta, onCambio, id }: { hasta: string; onCambio: (f: string) => void; id: string }) {
  return (
    <div className="cel-acceso__fin">
      <div className="pestanas" role="group" aria-label="Duración" style={{ flexWrap: 'wrap' }}>
        {DURACIONES.map((d) => {
          const f = diaMas(d);
          return <button key={d} type="button" className={`pestana${hasta === f ? ' pestana--activa' : ''}`} aria-pressed={hasta === f} onClick={() => onCambio(f)}>{d} {d === 1 ? 'día' : 'días'}</button>;
        })}
      </div>
      <div className="campo" style={{ minWidth: 170 }}>
        <label htmlFor={id} className="etiqueta">O hasta el día</label>
        <input id={id} type="date" className="entrada" min={diaMas(0)} max={diaMas(30)} value={hasta} onChange={(e) => e.target.value && onCambio(e.target.value)} />
      </div>
    </div>
  );
}

function Solicitud({ a, onHecho }: { a: AccesoMovil; onHecho: (m: string) => void }) {
  const [hasta, setHasta] = useState(diaMas(Math.min(a.diasSolicitados ?? 7, 30)));
  const [nota, setNota] = useState('');
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function ejecutar(accion: () => Promise<unknown>, mensaje: string) {
    setOcupado(true); setError('');
    try { await accion(); onHecho(mensaje); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo completar'); }
    finally { setOcupado(false); }
  }

  return (
    <article className="cel-acceso">
      <div className="cel-acceso__cabecera">
        <div className="cel-acceso__quien">
          <b>{a.usuario}</b>
          <span className="tenue">{a.rol}{a.equipo ? ` · ${a.equipo}` : ''} · pidió {a.diasSolicitados} {a.diasSolicitados === 1 ? 'día' : 'días'} · {cuando(a.solicitadoAt)}</span>
        </div>
        <span className="chip chip--crema">Pendiente</span>
      </div>
      <p className="cel-acceso__motivo">“{a.motivo}”</p>

      {!rechazando ? (
        <>
          <ElegirFin id={`fin-${a.id}`} hasta={hasta} onCambio={setHasta} />
          <div className="campo">
            <label htmlFor={`nota-${a.id}`} className="etiqueta">Nota para {a.usuario.split(' ')[0]} (opcional)</label>
            <input id={`nota-${a.id}`} className="entrada" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Solo para las visitas de esta semana" />
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => setRechazando(true)}>Rechazar</button>
            <button type="button" className="boton" disabled={ocupado}
              onClick={() => ejecutar(() => accesosMovilApi.aprobar(a.id, hasta, nota), `${a.usuario} ya puede entrar desde el celular hasta el ${diaLargo(hasta)}.`)}>
              Aprobar hasta el {diaLargo(hasta)}
            </button>
          </div>
        </>
      ) : (
        <div className="bloque">
          <label htmlFor={`rech-${a.id}`} className="etiqueta">¿Por qué no?</label>
          <input id={`rech-${a.id}`} className="entrada" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Las visitas se cubren con laptop" />
          {error && <div className="alerta" role="alert">{error}</div>}
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => setRechazando(false)}>Cancelar</button>
            <button type="button" className="boton" disabled={ocupado || motivo.trim().length < 3}
              onClick={() => ejecutar(() => accesosMovilApi.rechazar(a.id, motivo), `Se rechazó la solicitud de ${a.usuario}.`)}>Rechazar solicitud</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Vigente({ a, onHecho }: { a: AccesoMovil; onHecho: (m: string) => void }) {
  const [revocando, setRevocando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const quedan = diasRestantes(a.hasta!);

  async function revocar() {
    setOcupado(true); setError('');
    try { await accesosMovilApi.revocar(a.id, motivo); onHecho(`Se retiró el acceso de ${a.usuario}. Su celular quedó fuera del CRM.`); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo retirar'); }
    finally { setOcupado(false); }
  }

  return (
    <article className="cel-acceso">
      <div className="cel-acceso__cabecera">
        <div className="cel-acceso__quien">
          <b>{a.usuario}</b>
          <span className="tenue">{a.rol}{a.equipo ? ` · ${a.equipo}` : ''}{a.aprobadoPor ? ` · aprobó ${a.aprobadoPor}` : ''}</span>
        </div>
        <span className={`chip ${quedan <= 2 ? 'chip--crema' : 'chip--lima'}`}>{quedan <= 1 ? 'Vence hoy' : `Quedan ${quedan} días`}</span>
      </div>
      <p className="cel-acceso__motivo">Hasta el <b>{ultimoDia(a.hasta!)}</b> · “{a.motivo}”</p>
      {!revocando ? (
        <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="boton-secundario boton-peligro" onClick={() => setRevocando(true)}>Retirar acceso</button>
        </div>
      ) : (
        <div className="bloque">
          <label htmlFor={`rev-${a.id}`} className="etiqueta">Motivo (opcional)</label>
          <input id={`rev-${a.id}`} className="entrada" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Terminaron las visitas" />
          <span className="tenue" style={{ fontSize: 13 }}>Su celular sale del CRM en su siguiente acción.</span>
          {error && <div className="alerta" role="alert">{error}</div>}
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => setRevocando(false)}>Cancelar</button>
            <button type="button" className="boton" disabled={ocupado} onClick={revocar}>Retirar ahora</button>
          </div>
        </div>
      )}
    </article>
  );
}

function Historial({ a }: { a: AccesoMovil }) {
  const detalle = a.estado === 'APROBADA' || a.estado === 'VENCIDA'
    ? `Hasta el ${a.hasta ? ultimoDia(a.hasta) : '—'}${a.aprobadoPor ? ` · aprobó ${a.aprobadoPor}` : ''}`
    : a.estado === 'REVOCADA' ? `Retirado ${a.revocadoAt ? cuando(a.revocadoAt) : ''}${a.revocadoPor ? ` por ${a.revocadoPor}` : ''}`
    : a.estado === 'RECHAZADA' ? `Rechazó ${a.aprobadoPor ?? ''}` : '';
  return (
    <article className="cel-acceso cel-acceso--compacto">
      <div className="cel-acceso__cabecera">
        <div className="cel-acceso__quien">
          <b>{a.usuario}</b>
          <span className="tenue">Pidió {cuando(a.solicitadoAt)} · {detalle}</span>
        </div>
        <span className={`chip ${CHIP[a.estado]}`}>{TEXTO_ESTADO_ACCESO[a.estado]}</span>
      </div>
      <p className="cel-acceso__motivo">“{a.motivo}”{a.respuesta ? <> · <span className="tenue">Respuesta: {a.respuesta}</span></> : null}</p>
    </article>
  );
}

function DarAcceso({ onCancelar, onHecho }: { onCancelar: () => void; onHecho: (m: string) => void }) {
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string; rol: string; equipo: string | null }[]>([]);
  const [usuarioId, setUsuarioId] = useState('');
  const [hasta, setHasta] = useState(diaMas(7));
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { accesosMovilApi.usuarios().then(setUsuarios).catch(() => undefined); }, []);
  const nombre = usuarios.find((u) => u.id === usuarioId)?.nombre ?? '';

  async function dar() {
    setOcupado(true); setError('');
    try { await accesosMovilApi.otorgar(usuarioId, hasta, motivo); onHecho(`${nombre} ya puede entrar desde el celular hasta el ${diaLargo(hasta)}.`); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo dar el acceso'); }
    finally { setOcupado(false); }
  }

  return (
    <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="h2">Dar acceso desde celular</h2>
      <div className="campo">
        <label htmlFor="dar-usuario" className="etiqueta">¿A quién?</label>
        <select id="dar-usuario" className="entrada" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
          <option value="">Elige…</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}{u.equipo ? ` · ${u.equipo}` : ''}</option>)}
        </select>
      </div>
      <ElegirFin id="dar-fin" hasta={hasta} onCambio={setHasta} />
      <div className="campo">
        <label htmlFor="dar-motivo" className="etiqueta">Motivo</label>
        <input id="dar-motivo" className="entrada" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Supervisión en campo" />
      </div>
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado || !usuarioId || motivo.trim().length < 3} onClick={dar}>Dar acceso hasta el {diaLargo(hasta)}</button>
      </div>
    </section>
  );
}