import { useState } from 'react';
import { marcarSugerido, useTema, yaEligioLigero } from '../tema/TemaContext';

/** Equipos con pocos núcleos o poca memoria: se sugiere una sola vez activar el modo ligero */
function equipoModesto() {
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4;
}

export function SugerenciaLigero() {
  const { ligero, cambiarLigero } = useTema();
  const [visible, setVisible] = useState(() => !ligero && !yaEligioLigero() && equipoModesto());
  if (!visible) return null;
  const cerrar = (activar: boolean) => { marcarSugerido(); if (activar) cambiarLigero(true); setVisible(false); };
  return (
    <div className="aviso sugerencia-ligero" role="status">
      <span><b>¿El CRM va lento en esta computadora?</b> Activa el modo ligero: quita los efectos visuales y consulta menos al servidor. Lo puedes cambiar cuando quieras en tu perfil.</span>
      <span className="sugerencia-ligero__botones">
        <button type="button" className="boton-secundario" onClick={() => cerrar(false)}>No, gracias</button>
        <button type="button" className="boton" onClick={() => cerrar(true)}>Activar modo ligero</button>
      </span>
    </div>
  );
}