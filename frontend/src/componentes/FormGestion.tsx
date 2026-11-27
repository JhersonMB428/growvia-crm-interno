import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import {
  CANALES, diaCorto, fechaISO, gestionesApi, horaCorta, HORAS, RESULTADOS, RESULTADOS_RAPIDOS, unirFechaHora,
  type Canal, type GestionRegistrada, type ResultadoGestion,
} from '../api/gestiones';
import { problemaFechaHora } from '../utilidades/validacion';
import type { Contacto, Medio } from '../api/empresas';
import type { Objetivo } from '../utilidades/personas';
import { ConQuien } from './ConQuien';
import { AyudaCampo, Faltantes } from './Faltantes';
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
  /** Resultado elegido desde los botones rápidos de la ficha (n cambia en cada clic) */
  preseleccion?: { resultado: ResultadoGestion; n: number } | null;
  onGuardada: (g: GestionRegistrada) => void;
  onCancelar?: () => void;
  /** Personas y teléfonos de la empresa: para elegir con quién se habló y a qué número */
  personas?: Contacto[];
  medios?: Medio[];
  objetivo?: Objetivo;
  onObjetivo?: (o: Objetivo) => void;
}

/** Formulario para registrar una gestión hecha (y opcionalmente agendar la siguiente) */
export function FormGestion({ empresaId, idBase = 'g', canalInicial = 'LLAMADA', textoBoton = 'Guardar gestión', preseleccion, onGuardada, onCancelar, personas, medios, objetivo, onObjetivo }: Props) {
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
    // "Interesado", "Volver a llamar" o "No contestó" casi siempre llevan una próxima acción
    if (r === 'VOLVER_A_LLAMAR' || r === 'NO_CONTESTA' || r === 'INTERESADO') setAgendar(true);
    if (r === 'RECHAZA') setAgendar(false);
  }

  // Desde los botones rápidos: elige el resultado (al renderizar) y lleva el foco al comentario
  const [preseleccionVista, setPreseleccionVista] = useState(preseleccion?.n ?? 0);
  if (preseleccion && preseleccion.n !== preseleccionVista) {
    setPreseleccionVista(preseleccion.n);
    setCanal('LLAMADA');
    elegirResultado(preseleccion.resultado);
  }
  const comentarioRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (preseleccion) comentarioRef.current?.focus({ preventScroll: true });
  }, [preseleccion]);

  const comentarioOpcional = !!resultado && RESULTADOS_RAPIDOS.includes(resultado);
  const errFecha = agendar ? problemaFechaHora(fecha, hora) : '';
  const comentarioValido = comentario.trim().length >= 3 || (comentarioOpcional && comentario.trim().length === 0);
  const errComentario = comentarioValido ? '' : comentario.trim() ? 'El comentario es muy corto (mínimo 3 letras)' : 'Escribe un comentario: qué pasó en la gestión';
  const [intentado, setIntentado] = useState(false);
  const faltantes = [
    ...(!resultado ? ['Elige el resultado de la gestión'] : []),
    ...(errComentario ? [errComentario] : []),
    ...(errFecha ? [`Próxima acción: ${errFecha}`] : []),
  ];
  const listo = faltantes.length === 0;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setIntentado(true);
    if (!listo || !resultado) return;
    setGuardando(true); setError('');
    try {
      const g = await gestionesApi.crear({
        clienteId: empresaId, canal, resultado, ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
        ...(agendar ? { proximaAccion: unirFechaHora(fecha, hora), proximoCanal } : {}),
        ...(objetivo?.contactoId ? { contactoId: objetivo.contactoId } : {}),
        ...(objetivo?.medio ? { medio: objetivo.medio } : {}),
      });
      setResultado(''); setComentario(''); setAgendar(false); setFecha(masDias(1)); setHora('09:00'); setIntentado(false);
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
        <span className="leyenda-obligatorio">Campos obligatorios</span>
        <span className="etiqueta obligatorio">¿Cómo la hiciste?</span>
        <div className="pestanas" role="radiogroup" aria-label="Canal">
          {CANALES.map((c) => (
            <button key={c.valor} type="button" role="radio" aria-checked={canal === c.valor}
              className={`pestana${canal === c.valor ? ' pestana--activa' : ''}`} onClick={() => setCanal(c.valor)}>{c.texto}</button>
          ))}
        </div>
      </div>
      {personas && objetivo && onObjetivo && (personas.length > 0 || (medios?.length ?? 0) > 0) && (
        <ConQuien idBase={idBase} personas={personas} medios={medios ?? []} valor={objetivo} onChange={onObjetivo} />
      )}
      <div className="gestion-form__fila">
        <span className="etiqueta obligatorio">Resultado</span>
        <div className="chips-opcion" role="radiogroup" aria-label="Resultado">
          {RESULTADOS.map((r) => (
            <button key={r.valor} type="button" role="radio" aria-checked={resultado === r.valor}
              className={`chip-opcion${resultado === r.valor ? ' chip-opcion--activa' : ''}`} onClick={() => elegirResultado(r.valor)}>{r.texto}</button>
          ))}
        </div>
      </div>
      <div className="campo">
        <label htmlFor={`${idBase}-comentario`} className={`etiqueta${comentarioOpcional ? '' : ' obligatorio'}`}>Comentario{comentarioOpcional ? ' (opcional)' : ''}</label>
        <textarea ref={comentarioRef} id={`${idBase}-comentario`} className="entrada area" rows={3} maxLength={2000} value={comentario} onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej. Pidió la propuesta por correo. Compara con su operador actual; decide esta semana."
          aria-invalid={intentado && !!errComentario} />
        <AyudaCampo id={`${idBase}-comentario-a`} problema={intentado ? errComentario : ''} />
      </div>

      {resultado === 'RECHAZA' && (
        <div className="alerta" role="note">
          Al guardar, la empresa vuelve al repositorio y nadie podrá tomarla por un tiempo, para no volver a llamarla.
        </div>
      )}

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
              <label htmlFor={`${idBase}-fecha`} className="etiqueta obligatorio">Día</label>
              <input id={`${idBase}-fecha`} type="date" className="entrada" min={fechaISO(new Date())} max={masDias(365)} value={fecha} required
                onChange={(e) => setFecha(e.target.value)} aria-invalid={!!errFecha} />
            </div>
            <div className="campo">
              <label htmlFor={`${idBase}-hora`} className="etiqueta obligatorio">Hora</label>
              <select id={`${idBase}-hora`} className="entrada" value={hora} onChange={(e) => setHora(e.target.value)}>
                {HORAS.map((h) => <option key={h} value={h} disabled={fecha === fechaISO(new Date()) && new Date(`${fecha}T${h}:00`) <= new Date()}>{h}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor={`${idBase}-canal`} className="etiqueta obligatorio">Cómo</label>
              <select id={`${idBase}-canal`} className="entrada" value={proximoCanal} onChange={(e) => setProximoCanal(e.target.value as Canal)}>
                {CANALES.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
              </select>
            </div>
          </div>
          <AyudaCampo id={`${idBase}-fecha-a`} problema={errFecha} />
        </div>
      )}

      {intentado && <Faltantes items={faltantes} />}
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        {onCancelar && <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>}
        <button type="submit" className="boton" disabled={guardando}>{guardando ? 'Guardando…' : textoBoton}</button>
      </div>
    </form>
  );
}