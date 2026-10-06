import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { EnConstruccion } from './paginas/EnConstruccion';
import { FichaEmpresa } from './paginas/empresas/FichaEmpresa';
import { Agenda } from './paginas/agenda/Agenda';
import { MisEmpresas } from './paginas/empresas/MisEmpresas';
import { NuevoProspecto } from './paginas/empresas/NuevoProspecto';
import { Repositorio } from './paginas/empresas/Repositorio';
import { InicioPorRol } from './paginas/InicioPorRol';
import { Login } from './paginas/Login';
import { Notificaciones } from './paginas/Notificaciones';
import { Verificar } from './paginas/Verificar';
import { RutaPrivada } from './sesion/RutaPrivada';
import { SesionProvider } from './sesion/SesionContext';
import type { Usuario } from './sesion/tipos';
import { TemaProvider } from './tema/TemaContext';
import { FichaNegociacion } from './paginas/negociaciones/FichaNegociacion';
import { FormNegociacion } from './paginas/negociaciones/FormNegociacion';
import { Negociaciones } from './paginas/negociaciones/Negociaciones';

type Rol = Usuario['rol']['codigo'];

/** Atajo: ruta protegida por rol que por ahora muestra "En construcción" */
const pagina = (titulo: string, descripcion: string, roles?: Rol[]): ReactNode => (
  <RutaPrivada roles={roles}><EnConstruccion titulo={titulo} descripcion={descripcion} /></RutaPrivada>
);

export default function App() {
  return (
    <TemaProvider>
      <SesionProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/verificar" element={<Verificar />} />

            <Route element={<RutaPrivada><AppLayout /></RutaPrivada>}>
              <Route path="/" element={<InicioPorRol />} />

              <Route path="/inicio" element={pagina('Inicio', 'Tus gestiones del día, tu avance y tus negociaciones.', ['ASESOR'])} />
              <Route path="/empresas" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR']}><MisEmpresas /></RutaPrivada>} />
              <Route path="/empresas/nueva" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR']}><NuevoProspecto /></RutaPrivada>} />
              <Route path="/empresas/:id" element={<FichaEmpresa />} />
              <Route path="/agenda" element={<RutaPrivada roles={['ASESOR']}><Agenda /></RutaPrivada>} />

              <Route path="/negociaciones" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR', 'GERENTE']}><Negociaciones /></RutaPrivada>} />
              <Route path="/negociaciones/nueva" element={<RutaPrivada roles={['ASESOR']}><FormNegociacion /></RutaPrivada>} />
              <Route path="/negociaciones/:id/editar" element={<RutaPrivada roles={['ASESOR']}><FormNegociacion /></RutaPrivada>} />
              <Route path="/negociaciones/:id" element={<FichaNegociacion />} />              <Route path="/repositorio" element={<Repositorio />} />

              <Route path="/metas" element={pagina('Metas', 'Avance de metas por asesor y por equipo.', ['SUPERVISOR', 'GERENTE'])} />
              <Route path="/bases" element={pagina('Cargar base', 'Carga de empresas desde Excel.', ['SUPERVISOR', 'GERENTE'])} />
              <Route path="/equipo" element={pagina('Mi equipo', 'Avance de tus asesores.', ['SUPERVISOR'])} />
              <Route path="/aprobaciones" element={pagina('Aprobaciones de mi equipo', 'Paso 1 de la validación de ventas.', ['SUPERVISOR'])} />

              <Route path="/reportes" element={pagina('Resumen general', 'Indicadores de toda la empresa.', ['GERENTE'])} />
              <Route path="/revision" element={pagina('Revisión de ventas', 'Paso 2: observa o detén ventas sin frenarlas.', ['GERENTE'])} />
              <Route path="/accesos-celular" element={pagina('Acceso desde celular', 'Solicitudes para usar el CRM en el celular.', ['GERENTE'])} />

              <Route path="/validacion" element={pagina('Validación y posventa', 'Paso 3: valida ventas y registra la posventa.', ['BACKOFFICE'])} />
              <Route path="/usuarios" element={pagina('Usuarios y equipos', 'Cuentas, equipos, roles y permisos.', ['BACKOFFICE', 'ADMIN'])} />
              {/* Todos */}
              <Route path="/perfil" element={pagina('Perfil y ajustes', 'Tus datos, contraseña, avisos y equipos de confianza.')} />
              <Route path="/notificaciones" element={<Notificaciones />} />
              <Route path="*" element={<InicioPorRol />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SesionProvider>
    </TemaProvider>
  );
}