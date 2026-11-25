import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import {
  duracion, estadoProxima, gestionesApi, TEXTO_CANAL, TEXTO_RESULTADO, type Gestion, type GestionRegistrada, type ResultadoGestion,
} from '../api/gestiones';
import { fechaHora, FormGestion } from './FormGestion';
import './gestiones.css';

const ESTADO: Record<string, string> = { hecha: '✓ Hecha', no_realizada: '✗ No realizada', pendiente: 'Pendiente' };

interface Props {
  empresaId: string;
  /** Resultado elegido con los botones rápidos de la ficha */
  preseleccion?: { resultado: ResultadoGestion; n: number } | null;
  /** Cambia cuando se registró una gestión desde fuera (botón "No contestó") */
  recarga?: number;
  /** Avisa a la ficha para que actualice el plazo o salga si la empresa se liberó */
  onRegistrada?: (g: GestionRegistrada) => void;
}

/** Bloque "Gestiones" de la ficha de empresa: registrar y ver la línea de tiempo */
export function GestionesEmpresa({ empresaId, preseleccion, recarga = 0, onRegistrada }: Props) {
  const [filas, setFilas] = useState<Gestion[] | null>(null);
  const [puedeRegistrar, setPuedeRegistrar] = useState(false);
  const [segundosMinimos, setSegundosMinimos] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    gestionesApi.deEmpresa(empresaId)
      .then((r) => {
        setFilas(r.filas); setPuedeRegistrar(r.puedeRegistrar); setSegundosMinimos(r.segundosMinimos);
        // Si se llegó desde la agenda (…#gestiones), baja hasta este bloque
        if (recarga === 0 && window.location.hash === '#gestiones') setTimeout(() => document.getElementById('gestiones')?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .catch((e) => { setFilas([]); setError(e instanceof ErrorApi ? `No se pudieron cargar las gestiones: ${e.message}` : 'No se pudieron cargar las gestiones'); });
  }, [empresaId, recarga]);

  function alGuardar(g: GestionRegistrada) {
    onRegistrada?.(g);
    if (g.liberada) return;
    // La próxima acción que estaba pendiente queda como hecha
    setFilas((fs) => [g, ...(fs ?? []).map((x) => (x.proximaAccion && !x.proximaHechaAt ? { ...x, proximaHechaAt: g.fecha } : x))]);
    setAviso(g.proximaAccion ? `Gestión registrada. La siguiente quedó agendada para el ${fechaHora(g.proximaAccion)}.` : 'Gestión registrada.');
  }

  return (
    <section id="gestiones" className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="fila-acciones">
        <h2 className="h2">Gestiones</h2>
        {puedeRegistrar && <Link to="/agenda" className="boton-texto" style={{ textDecoration: 'none' }}>Ver mi agenda →</Link>}
      </div>

      {puedeRegistrar && <FormGestion empresaId={empresaId} idBase="ficha" textoBoton="Registrar gestión" preseleccion={preseleccion} onGuardada={alGuardar} />}
      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}

      {!filas && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>Cargando…</p>}
      {filas?.length === 0 && !error && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>Todavía no hay gestiones registradas.</p>}
      <ol className="linea-tiempo">
        {filas?.map((g) => {
          const estado = estadoProxima(g);
          return (
            <li key={g.id}>
              <div className="linea-tiempo__cabecera">
                <b>{TEXTO_CANAL[g.canal]}</b>
                <span className={`chip ${g.resultado === 'INTERESADO' ? 'chip--lima' : g.resultado === 'RECHAZA' ? 'chip--crema' : 'chip--gris'}`}>{TEXTO_RESULTADO[g.resultado]}</span>
                {g.codigoNegociacion && <span className="tenue numeros">{g.codigoNegociacion}</span>}
              </div>
              <p>{g.comentario}</p>
              {g.proximaAccion && g.proximoCanal && estado && (
                <span className={`proxima proxima--${estado}`}>
                  Siguiente: {TEXTO_CANAL[g.proximoCanal]} · {fechaHora(g.proximaAccion)} · {ESTADO[estado]}
                  {g.reprogramaciones > 0 && ` · reprogramada ${g.reprogramaciones}×`}
                </span>
              )}
              <span className="tenue">
                Registrada por {g.usuario} · {fechaHora(g.fecha)}
                {g.segundosFicha !== null && (
                  <> · <span className={segundosMinimos !== null && g.canal === 'LLAMADA' && g.segundosFicha < segundosMinimos ? 'tiempo-rapido' : ''}
                    title="Tiempo que el asesor tuvo abierta la ficha antes de registrar la gestión">
                    {duracion(g.segundosFicha)} en la ficha
                    {segundosMinimos !== null && g.canal === 'LLAMADA' && g.segundosFicha < segundosMinimos && ' · llamada rápida'}
                  </span></>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}