import { Navigate } from 'react-router-dom';
import { INICIO_POR_ROL } from '../layout/menu';
import { useSesion } from '../sesion/SesionContext';

/** Después del login, lleva a cada rol a su pantalla principal */
export function InicioPorRol() {
  const { usuario } = useSesion();
  if (!usuario) return <Navigate to="/login" replace />;
  return <Navigate to={INICIO_POR_ROL[usuario.rol.codigo]} replace />;
}