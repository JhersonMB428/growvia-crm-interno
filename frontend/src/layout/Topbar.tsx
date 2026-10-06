import { Link } from 'react-router-dom';
import { useSesion } from '../sesion/SesionContext';
import { useTema } from '../tema/TemaContext';
import { Icono } from './Icono';
import { INICIO_POR_ROL } from './menu';

export function Topbar() {
  const { usuario } = useSesion();
  const { tema, alternar } = useTema();
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
        <Link to="/notificaciones" className="topbar__circulo" aria-label="Notificaciones">
          <Icono nombre="campana" tam={20} />
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