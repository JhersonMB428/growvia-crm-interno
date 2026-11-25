import { useEffect, useRef, useState } from 'react';
import { api, CLAVE_SALIDA } from '../api/cliente';
import { useSesion } from '../sesion/SesionContext';

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
const AVISO_SEGUNDOS = 60;

/**
 * Cierra la sesión tras X minutos sin usar el CRM (parámetro "minutos_inactividad_sesion", editable en Administración).
 * Un minuto antes avisa con una cuenta regresiva; cualquier movimiento del mouse o del teclado la cancela.
 */
export function Inactividad() {
  const { usuario, cerrar } = useSesion();
  const [minutos, setMinutos] = useState(0);
  const [quedan, setQuedan] = useState<number | null>(null);
  const ultima = useRef(0); // se pone en marcha al activar el control

  // El parámetro se vuelve a leer cada 10 minutos (si administración lo cambia, se aplica sin recargar)
  useEffect(() => {
    if (!usuario) return;
    const leer = () => api<{ minutos: number }>('/auth/inactividad').then((r) => setMinutos(r.minutos)).catch(() => undefined);
    leer();
    const reloj = window.setInterval(leer, 10 * 60_000);
    return () => window.clearInterval(reloj);
  }, [usuario]);

  useEffect(() => {
    if (!usuario || minutos <= 0) return;
    ultima.current = Date.now();
    let ultimoRegistro = 0;
    const actividad = () => {
      const ahora = Date.now();
      if (ahora - ultimoRegistro < 1000) return; // basta con registrar una vez por segundo
      ultimoRegistro = ahora;
      ultima.current = ahora;
      setQuedan(null);
    };
    EVENTOS.forEach((e) => window.addEventListener(e, actividad, { passive: true }));
    const reloj = window.setInterval(() => {
      const sinUso = (Date.now() - ultima.current) / 1000;
      const limite = minutos * 60;
      if (sinUso >= limite) {
        sessionStorage.setItem(CLAVE_SALIDA, `Cerramos tu sesión porque estuvo ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} sin uso. Vuelve a ingresar para continuar.`);
        cerrar();
      } else if (sinUso >= limite - AVISO_SEGUNDOS) {
        setQuedan(Math.ceil(limite - sinUso));
      }
    }, 1000);
    return () => {
      EVENTOS.forEach((e) => window.removeEventListener(e, actividad));
      window.clearInterval(reloj);
    };
  }, [usuario, minutos, cerrar]);

  if (quedan === null) return null;
  return (
    <div className="inactividad" role="alertdialog" aria-live="assertive" aria-label="Tu sesión está por cerrarse">
      <div className="inactividad__caja vidrio">
        <b>¿Sigues ahí?</b>
        <span>Por seguridad, tu sesión se cerrará en <b className="numeros">{quedan}</b> {quedan === 1 ? 'segundo' : 'segundos'}.</span>
        <button type="button" className="boton" onClick={() => { ultima.current = Date.now(); setQuedan(null); }}>Seguir conectado</button>
      </div>
    </div>
  );
}
