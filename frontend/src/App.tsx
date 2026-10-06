import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Inicio } from './paginas/Inicio';
import { Login } from './paginas/Login';
import { Verificar } from './paginas/Verificar';
import { RutaPrivada } from './sesion/RutaPrivada';
import { SesionProvider } from './sesion/SesionContext';

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/verificar" element={<Verificar />} />
          <Route path="/inicio" element={<RutaPrivada><Inicio /></RutaPrivada>} />
          <Route path="*" element={<Navigate to="/inicio" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
