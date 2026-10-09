import { Outlet } from 'react-router-dom';
import { useTema } from '../tema/TemaContext';
import { Recorrido } from '../componentes/Recorrido';
import { SugerenciaLigero } from '../componentes/SugerenciaLigero';
import { Rail } from './Rail';
import { Topbar } from './Topbar';
import './layout.css';

/** Estructura de todas las pantallas internas: fondo, barra superior, menú lateral y contenido */
export function AppLayout() {
  const { tema, ligero } = useTema();
  return (
    <div className="app" data-tema={tema} data-ligero={ligero ? 'si' : undefined}>
      <div className="app__contenedor">
        <Topbar />
        <div className="app__cuerpo">
          <Rail />
          <main className="app__principal">
            <SugerenciaLigero />
            <Outlet />
          </main>
        </div>
      </div>
      <Recorrido />
    </div>
  );
}