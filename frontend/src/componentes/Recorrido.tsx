import { useEffect, useState } from 'react';
import { perfilApi } from '../api/perfil';
import { Icono } from '../layout/Icono';
import { RECORRIDO_POR_ROL } from '../paginas/ayuda/contenido';
import { useSesion } from '../sesion/SesionContext';
import './recorrido.css';

/** Para abrir el recorrido desde cualquier pantalla (ej. el botón de Ayuda) */
export const abrirRecorrido = () => window.dispatchEvent(new Event('gv-abrir-recorrido'));

/**
 * Recorrido de bienvenida: se abre solo la primera vez que alguien entra (después de cambiar su
 * contraseña temporal) y se puede volver a ver desde Ayuda. Al cerrarlo queda marcado como visto.
 */
export function Recorrido() {
  const { usuario, actualizar } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [i, setI] = useState(0);

  // La primera vez: cuando ya no tiene contraseña temporal pendiente
  useEffect(() => {
    if (usuario && !usuario.guiaVista && !usuario.debeCambiarClave) { setI(0); setAbierto(true); }
  }, [usuario?.id, usuario?.guiaVista, usuario?.debeCambiarClave]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const abrir = () => { setI(0); setAbierto(true); };
    window.addEventListener('gv-abrir-recorrido', abrir);
    return () => window.removeEventListener('gv-abrir-recorrido', abrir);
  }, []);

  // Escape cierra; las flechas avanzan y retroceden
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, total - 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!usuario || !abierto) return null;
  const diapositivas = RECORRIDO_POR_ROL[usuario.rol.codigo];
  const total = diapositivas.length;
  const d = diapositivas[i];
  const ultima = i === total - 1;

  function cerrar() {
    setAbierto(false);
    if (!usuario?.guiaVista) {
      actualizar({ guiaVista: true });
      perfilApi.guiaVista().catch(() => undefined);
    }
  }

  return (
    <div className="recorrido" role="dialog" aria-modal="true" aria-labelledby="recorrido-titulo">
      <div className="recorrido__caja">
        <button type="button" className="recorrido__saltar" onClick={cerrar}>{ultima ? 'Cerrar' : 'Saltar'}</button>
        <span className="recorrido__icono"><Icono nombre={d.icono} tam={34} /></span>
        <span className="recorrido__paso numeros">{i + 1} de {total}</span>
        <h2 id="recorrido-titulo">{d.titulo}</h2>
        <p>{d.texto}</p>
        <div className="recorrido__puntos" aria-hidden="true">
          {diapositivas.map((_, j) => <span key={j} className={j === i ? 'activo' : ''} />)}
        </div>
        <div className="recorrido__acciones">
          {i > 0 ? <button type="button" className="boton-secundario" onClick={() => setI(i - 1)}>Anterior</button> : <span />}
          {ultima
            ? <button type="button" className="boton" onClick={cerrar} autoFocus>Empezar</button>
            : <button type="button" className="boton" onClick={() => setI(i + 1)} autoFocus>Siguiente</button>}
        </div>
      </div>
    </div>
  );
}