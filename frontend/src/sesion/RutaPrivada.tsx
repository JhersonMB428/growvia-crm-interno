import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSesion } from './SesionContext';
import type { Usuario } from './tipos';

interface Props {
  children: ReactNode;
  /** Si se indica, solo esos roles pueden entrar; los demás vuelven a su inicio */
  roles?: Usuario['rol']['codigo'][];
}

/** Solo deja pasar con sesión iniciada (y con el rol correcto, si se pide) */
export function RutaPrivada({ children, roles }: Props) {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  // Con contraseña temporal, primero debe elegir una propia en su perfil
  if (usuario.debeCambiarClave && ubicacion.pathname !== '/perfil') return <Navigate to="/perfil" replace />;
  if (roles && !roles.includes(usuario.rol.codigo)) return <Navigate to="/" replace />;
  return <>{children}</>;
}