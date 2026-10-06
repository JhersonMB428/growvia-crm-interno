import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import {
  CANALES, diaCorto, fechaISO, gestionesApi, horaCorta, HORAS, RESULTADOS, unirFechaHora,
  type Canal, type Gestion, type ResultadoGestion,
} from '../api/gestiones';
import './gestiones.css';

const masDias = (n: number) => fechaISO(new Date(Date.now() + n * 86_400_000));
const ATAJOS: [string, number][] = [['Mañana', 1], ['En 3 días', 3], ['En 1 semana', 7], ['En 1 mes', 30]];
export const fechaHora = (iso: string) => `${diaCorto(iso)} · ${horaCorta(iso)}`;

interface Props {
  empresaId: string;
  /** Prefijo para los id de los campos (hay varios formularios en la agenda) */
  idBase?: string;
  canalInicial?: Canal;
  textoBoton?: string;
  onGuardada: (g: Gestion) => void;
  onCancelar?: () => void;
}

/** Formulario para registrar una gestión hecha (y opcionalmente agendar la siguiente) */
export function FormGestion({ empresaId, idBase = 'g', canalInicial = 'LLAMADA', textoBoton = 'Guardar gestión', onGuardada, onCancelar }: Props) {
  const [canal, setCanal] = useState<Canal>(canalInicial);
  const [resultado, setResultado] = useState<ResultadoGestion | ''>('');
  const [comentario, setComentario] = useState('');
  const [agendar, setAgendar] = useState(false);
  const [fecha, setFecha] = useState(masDias(1));
  const [hora, setHora] = useState('09:00');
  const [proximoCanal, setProximoCanal] = useState<Canal>('LLAMADA');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  function elegirResultado(r: ResultadoGestion) {
    setResultado(r);
    // "Volver a llamar" o "No contesta" casi siempre llevan una próxima acción
    if (r === 'VOLVER_A_LLAMAR' || r === 'NO_CONTESTA') setAgendar(true);
    if (r === 'RECHAZA') setAgendar(false);
  }

  const fechaValida = !agendar || (!!fecha && new Date(`${fecha}T${hora}:00`) > new Date());
  const listo = !!resultado && comentario.trim().length >= 3 && fechaValida;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!listo || !resultado) return;
    setGuardando(true); setError('');
    try {
      const g = await gestionesApi.crear({
        clienteId: empresaId, canal, resultado, comentario: comentario.trim(),
        ...(agendar ? { proximaAccion: unirFechaHora(fecha, hora), proximoCanal } : {}),
      });
      setResultado(''); setComentario(''); setAgendar(false); setFecha(masDias(1)); setHora('09:00');
      onGuardada(g);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la gestión');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="bloque" noValidate>
      <div className="gestion-form__fila">
        <span className="etiqueta">¿Cómo la hiciste?</span>
        <div className="pestanas" role="radiogroup" aria-label="Canal">
          {CANALES.map((c) => (
            <button key={c.valor} type="button" role="radio" aria-checked={canal === c.valor}
              className={`pestana${canal === c.valor ? ' pestana--activa' : ''}`} onClick={() => setCanal(c.valor)}>{c.texto}</button>
          ))}
        </div>
      </div>
      <div className="gestion-form__fila">
        <span className="etiqueta">Resultado</span>
        <div className="chips-opcion" role="radiogroup" aria-label="Resultado">
          {RESULTADOS.map((r) => (
            <button key={r.valor} type="button" role="radio" aria-checked={resultado === r.valor}
              className={`chip-opcion${resultado === r.valor ? ' chip-opcion--activa' : ''}`} onClick={() => elegirResultado(r.valor)}>{r.texto}</button>
          ))}
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`${idBase}-comentario`} className="etiqueta">Comentario</label>
        <textarea id={`${idBase}-comentario`} className="entrada area" rows={3} maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej. Pidió la propuesta por correo. Compara con su operador actual; decide esta semana." />
      </div>

      <label className="casilla">
        <input type="checkbox" checked={agendar} onChange={(e) => setAgendar(e.target.checked)} />
        Agendar próxima acción
      </label>
      {agendar && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="chips-opcion" aria-label="Atajos de fecha">
            {ATAJOS.map(([t, n]) => (
              <button key={t} type="button" className={`chip-opcion${fecha === masDias(n) ? ' chip-opcion--activa' : ''}`} onClick={() => setFecha(masDias(n))}>{t}</button>
            ))}
          </div>
          <div className="rejilla-3">
            <div className="campo">
              <label htmlFor={`${idBase}-fecha`} className="etiqueta">Día</label>
              <input id={`${idBase}-fecha`} type="date" className="entrada" min={fechaISO(new Date())} max={masDias(365)} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor={`${idBase}-hora`} className="etiqueta">Hora</label>
              <select id={`${idBase}-hora`} className="entrada" value={hora} onChange={(e) => setHora(e.target.value)}>
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor={`${idBase}-canal`} className="etiqueta">Cómo</label>
              <select id={`${idBase}-canal`} className="entrada" value={proximoCanal} onChange={(e) => setProximoCanal(e.target.value as Canal)}>
                {CANALES.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
              </select>
            </div>
          </div>
          {!fechaValida && <span style={{ fontSize: 13, color: 'var(--salir)' }}>Elige una fecha y hora futuras.</span>}
        </div>
      )}

      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        {onCancelar && <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>}
        <button type="submit" className="boton" disabled={!listo || guardando}>{guardando ? 'Guardando…' : textoBoton}</button>
      </div>
    </form>
  );
}