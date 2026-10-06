import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import {
  CANALES, diaCorto, estadoProxima, fechaISO, gestionesApi, horaCorta, HORAS, unirFechaHora,
  type Canal, type Gestion,
} from '../../api/gestiones';
import { FormGestion } from '../../componentes/FormGestion';
import '../../componentes/gestiones.css';

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const VERBO: Record<Canal, string> = { LLAMADA: 'Llamar', WHATSAPP: 'Escribir por WhatsApp', CORREO: 'Enviar correo', VISITA: 'Visitar' };

/** Días del mes en una cuadrícula que empieza en lunes (null = celda vacía) */
function cuadricula(mes: Date) {
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const vacias = (primero.getDay() + 6) % 7;
  return [...Array(vacias).fill(null), ...Array.from({ length: dias }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))] as (Date | null)[];
}

export function Agenda() {
  const hoy = fechaISO(new Date());
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [elegido, setElegido] = useState(hoy);
  const [items, setItems] = useState<Gestion[]>([]);
  const [atrasadas, setAtrasadas] = useState<Gestion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(() => {
    const desde = fechaISO(mes);
    const hasta = fechaISO(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
    setCargando(true);
    gestionesApi.agenda(desde, hasta)
      .then((r) => { setItems(r.items); setAtrasadas(r.atrasadas); setError(''); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la agenda'))
      .finally(() => setCargando(false));
  }, [mes]);
  useEffect(cargar, [cargar]);

  // Días con gestiones pendientes (para los puntitos del calendario)
  const conGestiones = useMemo(() => new Set(items.filter((g) => !g.proximaHechaAt).map((g) => fechaISO(new Date(g.proximaAccion!)))), [items]);
  const delDia = items.filter((g) => fechaISO(new Date(g.proximaAccion!)) === elegido);
  const pendientesHoy = items.filter((g) => !g.proximaHechaAt && fechaISO(new Date(g.proximaAccion!)) === hoy).length;

  const tituloDia = elegido === hoy ? 'Hoy' : mayuscula(diaCorto(`${elegido}T12:00:00`));

  function alCambiar(mensaje: string) {
    setAviso(mensaje);
    cargar();
  }

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Agenda</h1>
          <p>Tus próximas gestiones. Si el cliente dice “llámame en diciembre”, reprográmalo y te aparecerá ese día.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="chip chip--lima">Hoy · {pendientesHoy}</span>
          <span className={`chip ${atrasadas.length ? 'chip--crema' : 'chip--gris'}`}>No realizadas · {atrasadas.length}</span>
        </div>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}

      <div className="agenda">
        <section className="panel vidrio calendario" style={{ flex: '1 1 300px', maxWidth: 380 }} aria-label="Calendario">
          <div className="calendario__mes">
            <button type="button" className="calendario__flecha" aria-label="Mes anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button>
            <b>{mayuscula(mes.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' }))}</b>
            <button type="button" className="calendario__flecha" aria-label="Mes siguiente" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="calendario__rejilla">
            {DIAS.map((d, i) => <span key={i} className="calendario__dia-semana">{d}</span>)}
            {cuadricula(mes).map((d, i) => {
              if (!d) return <span key={i} className="calendario__dia calendario__dia--fuera" />;
              const iso = fechaISO(d);
              return (
                <button key={i} type="button" onClick={() => setElegido(iso)} aria-pressed={iso === elegido}
                  aria-label={`${d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}${conGestiones.has(iso) ? ', con gestiones' : ''}`}
                  className={`calendario__dia${iso === hoy ? ' calendario__dia--hoy' : ''}${iso === elegido ? ' calendario__dia--elegido' : ''}`}>
                  {d.getDate()}
                  {conGestiones.has(iso) && <span className="calendario__punto" />}
                </button>
              );
            })}
          </div>
          <div className="calendario__leyenda">
            <span><span className="calendario__punto" style={{ position: 'static', display: 'inline-block', margin: '0 6px 1px 0' }} />Con gestiones</span>
            <button type="button" className="boton-texto" style={{ minHeight: 0, padding: 0 }}
              onClick={() => { const d = new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)); setElegido(hoy); }}>Ir a hoy</button>
          </div>
        </section>

        <div style={{ flex: '2 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {atrasadas.length > 0 && (
            <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="h2">No realizadas · {atrasadas.length}</h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--texto-suave)' }}>Su día ya pasó. Márcalas como hechas si las hiciste, o reprográmalas.</p>
              {atrasadas.map((g) => <ItemAgenda key={g.id} g={g} conDia onCambio={alCambiar} />)}
            </section>
          )}
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2">{tituloDia}</h2>
            {cargando && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>Cargando…</p>}
            {!cargando && delDia.length === 0 && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>No tienes gestiones este día.</p>}
            {delDia.map((g) => <ItemAgenda key={g.id} g={g} onCambio={alCambiar} />)}
          </section>
        </div>
      </div>
    </>
  );
}

const TEXTO_ESTADO = { pendiente: 'Pendiente', hecha: '✓ Hecha', no_realizada: '✗ No realizada' } as const;

function ItemAgenda({ g, conDia, onCambio }: { g: Gestion; conDia?: boolean; onCambio: (mensaje: string) => void }) {
  const estado = estadoProxima(g) ?? 'pendiente';
  const [panel, setPanel] = useState<'' | 'hecha' | 'reprogramar'>('');
  const [fecha, setFecha] = useState(fechaISO(new Date(Date.now() + 86_400_000)));
  const [hora, setHora] = useState(() => { const h = horaCorta(g.proximaAccion!); return HORAS.includes(h) ? h : '09:00'; });
  const [canal, setCanal] = useState<Canal>(g.proximoCanal ?? 'LLAMADA');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function reprogramar() {
    setOcupado(true); setError('');
    try {
      const r = await gestionesApi.reprogramar(g.id, unirFechaHora(fecha, hora), canal);
      setPanel('');
      onCambio(`${g.razonSocial}: reprogramada para el ${diaCorto(r.proximaAccion!)} a las ${horaCorta(r.proximaAccion!)}.`);
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo reprogramar'); }
    finally { setOcupado(false); }
  }

  return (
    <article className={`item-agenda item-agenda--${estado}`}>
      <div>
        <div className="item-agenda__hora numeros">{horaCorta(g.proximaAccion!)}</div>
        {conDia && <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>{diaCorto(g.proximaAccion!)}</span>}
      </div>
      <div className="item-agenda__cuerpo">
        <Link to={`/empresas/${g.clienteId}#gestiones`}>{g.razonSocial}</Link>
        <span>{VERBO[g.proximoCanal ?? 'LLAMADA']} · <span className={`item-agenda__estado item-agenda__estado--${estado}`}>{TEXTO_ESTADO[estado]}</span></span>
        <span className="tenue">Nota: {g.comentario}</span>
        {g.reprogramaciones > 0 && <span className="tenue">Reprogramada {g.reprogramaciones}×</span>}
      </div>
      {estado !== 'hecha' && !panel && (
        <div className="item-agenda__acciones">
          <button type="button" className="boton-secundario" onClick={() => setPanel('reprogramar')}>Reprogramar</button>
          <button type="button" className="boton" style={{ height: 38, fontSize: 14 }} onClick={() => setPanel('hecha')}>Marcar como hecha</button>
        </div>
      )}

      {panel === 'hecha' && (
        <div style={{ gridColumn: '1 / -1' }}>
          <FormGestion empresaId={g.clienteId} idBase={`a-${g.id}`} canalInicial={g.proximoCanal ?? 'LLAMADA'} textoBoton="Guardar como hecha"
            onCancelar={() => setPanel('')}
            onGuardada={(n) => { setPanel(''); onCambio(n.proximaAccion ? `${g.razonSocial}: hecha. La siguiente quedó para el ${diaCorto(n.proximaAccion)} a las ${horaCorta(n.proximaAccion)}.` : `${g.razonSocial}: gestión hecha.`); }} />
        </div>
      )}

      {panel === 'reprogramar' && (
        <div className="bloque" style={{ gridColumn: '1 / -1' }}>
          <b>Reprogramar</b>
          <div className="rejilla-3">
            <div className="campo">
              <label className="etiqueta" htmlFor={`f-${g.id}`}>Día</label>
              <input id={`f-${g.id}`} type="date" className="entrada" min={fechaISO(new Date())} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor={`h-${g.id}`}>Hora</label>
              <select id={`h-${g.id}`} className="entrada" value={hora} onChange={(e) => setHora(e.target.value)}>
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="etiqueta" htmlFor={`c-${g.id}`}>Cómo</label>
              <select id={`c-${g.id}`} className="entrada" value={canal} onChange={(e) => setCanal(e.target.value as Canal)}>
                {CANALES.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
              </select>
            </div>
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => setPanel('')}>Cancelar</button>
            <button type="button" className="boton" disabled={ocupado || !fecha} onClick={reprogramar}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </article>
  );
}