import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useSesion } from '../sesion/SesionContext';
import { Icono } from './Icono';
import { MENU_POR_ROL } from './menu';

const CLAVE_FIJO = 'gv-menu-fijado';

/** Menú lateral: se expande al pasar el mouse y se puede dejar fijo */
export function Rail() {
  const { usuario, cerrar } = useSesion();
  const [fijado, setFijado] = useState(() => localStorage.getItem(CLAVE_FIJO) === '1');
  const [abierto, setAbierto] = useState(false);
  if (!usuario) return null;

  const expandido = fijado || abierto;
  const fijar = () => {
    localStorage.setItem(CLAVE_FIJO, fijado ? '0' : '1');
    setFijado(!fijado);
    setAbierto(false);
  };

  return (
    <div className={`rail-espacio${fijado ? ' rail-espacio--fijo' : ''}`}>
      <nav
        aria-label="Menú principal"
        className={`rail vidrio${expandido ? ' rail--expandido' : ''}${abierto && !fijado ? ' rail--flotante' : ''}`}
        onMouseEnter={() => setAbierto(true)}
        onMouseLeave={() => setAbierto(false)}
        onFocus={() => setAbierto(true)}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setAbierto(false); }}
      >
        <button type="button" className="rail__item rail__fijar" onClick={fijar} aria-pressed={fijado}
          title={fijado ? 'Contraer menú' : 'Mantener menú abierto'}>
          <span style={{ display: 'flex', transform: expandido ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }}>
            <Icono nombre="fijar" />
          </span>
          <span className="rail__texto">{fijado ? 'Contraer menú' : 'Mantener abierto'}</span>
        </button>
        <div className="rail__linea" />

        {MENU_POR_ROL[usuario.rol.codigo].map((it) => (
          <NavLink key={it.ruta} to={it.ruta} title={it.etiqueta}
            className={({ isActive }) => `rail__item${isActive ? ' rail__item--activo' : ''}`}>
            <Icono nombre={it.icono} />
            <span className="rail__texto">{it.etiqueta}</span>
          </NavLink>
        ))}

        <div className="rail__linea" />
        <NavLink to="/ayuda" title="Ayuda"
          className={({ isActive }) => `rail__item${isActive ? ' rail__item--activo' : ''}`}>
          <Icono nombre="ayuda" />
          <span className="rail__texto">Ayuda</span>
        </NavLink>
        <NavLink to="/perfil" title="Perfil y ajustes"
          className={({ isActive }) => `rail__item${isActive ? ' rail__item--activo' : ''}`}>
          <Icono nombre="perfil" />
          <span className="rail__texto">Perfil y ajustes</span>
        </NavLink>
        <button type="button" className="rail__item rail__salir" onClick={cerrar} title="Cerrar sesión">
          <Icono nombre="salir" />
          <span className="rail__texto">Cerrar sesión</span>
        </button>
      </nav>
    </div>
  );
}