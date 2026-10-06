import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { notificacionesApi } from '../api/gestiones';
import '../componentes/gestiones.css';
import { useSesion } from '../sesion/SesionContext';
import { useTema } from '../tema/TemaContext';
import { Icono } from './Icono';
import { INICIO_POR_ROL } from './menu';

export function Topbar() {
  const { usuario } = useSesion();
  const { tema, alternar } = useTema();
  const { pathname } = useLocation();
  const [sinLeer, setSinLeer] = useState(0);

  // Número de avisos sin leer: al cambiar de pantalla, cada minuto y cuando otra pantalla avisa
  useEffect(() => {
    if (!usuario) return;
    const actualizar = () => notificacionesApi.contador().then((r) => setSinLeer(r.sinLeer)).catch(() => undefined);
    actualizar();
    const reloj = window.setInterval(actualizar, 60_000);
    window.addEventListener('gv-notificaciones', actualizar);
    return () => { window.clearInterval(reloj); window.removeEventListener('gv-notificaciones', actualizar); };
  }, [usuario, pathname]);

  if (!usuario) return null;

  const iniciales = (usuario.nombres[0] + usuario.apellidos[0]).toUpperCase();
  const detalle = usuario.rol.nombre + (usuario.equipo ? ` · ${usuario.equipo.nombre}` : '');

  return (
    <header className="topbar vidrio">
      <Link to={INICIO_POR_ROL[usuario.rol.codigo]} aria-label="Ir al inicio" className="topbar__logo">
        <img src="/img/logo-growvia.webp" alt="Growvia" />
      </Link>

      <div className="topbar__buscar">
        <label htmlFor="buscar" className="oculto-visual">Buscar empresa</label>
        <span className="topbar__lupa"><Icono nombre="buscar" tam={18} /></span>
        <input id="buscar" type="search" placeholder="Buscar por RUC o razón social" />
      </div>

      <div className="topbar__acciones">
        <button type="button" className="topbar__circulo" onClick={alternar}
          aria-label={tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          title={tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}>
          <Icono nombre={tema === 'oscuro' ? 'sol' : 'luna'} tam={20} />
        </button>
        <Link to="/notificaciones" className="topbar__circulo" aria-label={sinLeer ? `Notificaciones, ${sinLeer} sin leer` : 'Notificaciones'}>
          <Icono nombre="campana" tam={20} />
          {sinLeer > 0 && <span className="campana__contador" aria-hidden="true">{sinLeer > 99 ? '99+' : sinLeer}</span>}
        </Link>
        <div className="topbar__usuario">
          <span className="topbar__avatar">{iniciales}</span>
          <span className="topbar__nombre">
            <b>{usuario.nombres} {usuario.apellidos}</b>
            <span>{detalle}</span>
          </span>
        </div>
      </div>
    </header>
  );
}