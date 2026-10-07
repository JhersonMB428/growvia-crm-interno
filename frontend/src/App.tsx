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
import { BandejaVentas } from './paginas/validacion/BandejaVentas';
import { InicioAsesor } from './paginas/tableros/InicioAsesor';
import { Metas } from './paginas/tableros/Metas';
import { MiEquipo } from './paginas/tableros/MiEquipo';
import { ResumenGerencia } from './paginas/tableros/ResumenGerencia';
import { AccesosCelular } from './paginas/accesos/AccesosCelular';
import { Bitacora } from './paginas/auditoria/Bitacora';
import { Exportar } from './paginas/auditoria/Exportar';
import { ResumenBackoffice } from './paginas/tableros/ResumenBackoffice';
import { Bases } from './paginas/bases/Bases';
import { DetalleBase } from './paginas/bases/DetalleBase';

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

              <Route path="/inicio" element={<RutaPrivada roles={['ASESOR']}><InicioAsesor /></RutaPrivada>} />
              <Route path="/empresas" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR']}><MisEmpresas /></RutaPrivada>} />
              <Route path="/empresas/nueva" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR']}><NuevoProspecto /></RutaPrivada>} />
              <Route path="/empresas/:id" element={<FichaEmpresa />} />
              <Route path="/agenda" element={<RutaPrivada roles={['ASESOR']}><Agenda /></RutaPrivada>} />

              <Route path="/negociaciones" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR', 'GERENTE']}><Negociaciones /></RutaPrivada>} />
              <Route path="/negociaciones/nueva" element={<RutaPrivada roles={['ASESOR']}><FormNegociacion /></RutaPrivada>} />
              <Route path="/negociaciones/:id/editar" element={<RutaPrivada roles={['ASESOR']}><FormNegociacion /></RutaPrivada>} />
              <Route path="/negociaciones/:id" element={<FichaNegociacion />} />              <Route path="/repositorio" element={<Repositorio />} />

              <Route path="/metas" element={<RutaPrivada roles={['SUPERVISOR', 'GERENTE']}><Metas /></RutaPrivada>} />
              <Route path="/bases" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR', 'GERENTE']}><Bases /></RutaPrivada>} />
              <Route path="/bases/:id" element={<RutaPrivada roles={['ASESOR', 'SUPERVISOR', 'GERENTE']}><DetalleBase /></RutaPrivada>} />
              <Route path="/equipo" element={<RutaPrivada roles={['SUPERVISOR']}><MiEquipo /></RutaPrivada>} />
              <Route path="/aprobaciones" element={<RutaPrivada roles={['SUPERVISOR']}><BandejaVentas modo="aprobar" /></RutaPrivada>} />

              <Route path="/reportes" element={<RutaPrivada roles={['GERENTE']}><ResumenGerencia /></RutaPrivada>} />
              <Route path="/revision" element={<RutaPrivada roles={['GERENTE']}><BandejaVentas modo="revisar" /></RutaPrivada>} />
              <Route path="/exportar" element={<RutaPrivada roles={['GERENTE']}><Exportar /></RutaPrivada>} />
              <Route path="/bitacora" element={<RutaPrivada roles={['GERENTE', 'ADMIN']}><Bitacora /></RutaPrivada>} />
              <Route path="/accesos-celular" element={<RutaPrivada roles={['GERENTE']}><AccesosCelular /></RutaPrivada>} />
              
              <Route path="/resumen" element={<RutaPrivada roles={['BACKOFFICE']}><ResumenBackoffice /></RutaPrivada>} />
              <Route path="/validacion" element={<RutaPrivada roles={['BACKOFFICE']}><BandejaVentas modo="validar" /></RutaPrivada>} />
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