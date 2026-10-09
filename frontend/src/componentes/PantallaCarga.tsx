/**
 * Pantalla de carga: la W de Growvia que se dibuja trazo a trazo (diseño de la maqueta).
 * Es idéntica a la que está en index.html y usa sus mismos estilos, así que
 * cuando React toma el control no se nota ningún salto: se ve una sola animación.
 */
import { useState, type CSSProperties } from 'react';

/** Ciclo de la animación (3,2 s): sirve para continuarla donde iba */
const CICLO_MS = 3200;

export function PantallaCarga() {
  // Se calcula una sola vez: cuánto lleva la animación desde que abrió la página
  const [estilo] = useState(() => ({ '--gv-desfase': `-${Math.round(performance.now() % CICLO_MS)}ms` }) as CSSProperties);
  return (
    <div className="gv-carga" style={estilo}>
      <div className="gv-carga__tarjeta" role="status" aria-live="polite">
        <svg className="gv-carga__w" viewBox="0 0 220 160" width="220" height="160" aria-hidden="true">
          <path className="gw-seg gw-lima gw-s1" pathLength={1} d="M20 22 L62 132" />
          <path className="gw-seg gw-crema gw-s2" pathLength={1} d="M62 132 L104 58" />
          <path className="gw-seg gw-lima gw-s3" pathLength={1} d="M104 58 L146 132" />
          <path className="gw-seg gw-crema gw-s4" pathLength={1} d="M146 132 L190 35" />
          <polygon className="gw-head" points="204,4 206,43 173,27" />
        </svg>
        <div className="gv-carga__textos">
          <span className="gv-carga__titulo">
            Preparando tu día<span className="gw-dot">.</span><span className="gw-dot">.</span><span className="gw-dot">.</span>
          </span>
          <span className="gv-carga__sub">Cargando prospectos, gestiones y metas</span>
          <div className="gv-carga__pista"><div className="gw-bar" /></div>
        </div>
      </div>
    </div>
  );
}