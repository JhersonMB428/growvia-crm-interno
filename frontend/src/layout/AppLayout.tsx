import { Outlet } from 'react-router-dom';
import { useTema } from '../tema/TemaContext';
import { Rail } from './Rail';
import { Topbar } from './Topbar';
import './layout.css';

/** Estructura de todas las pantallas internas: fondo, barra superior, menú lateral y contenido */
export function AppLayout() {
  const { tema } = useTema();
  return (
    <div className="app" data-tema={tema}>
      <div className="app__contenedor">
        <Topbar />
        <div className="app__cuerpo">
          <Rail />
          <main className="app__principal">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}