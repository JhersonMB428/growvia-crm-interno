import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, token } from '../api/cliente';
import type { Usuario } from './tipos';

interface Sesion {
  usuario: Usuario | null;
  cargando: boolean;
  iniciar: (t: string, u: Usuario) => void;
  cerrar: () => void;
  puede: (permiso: string) => boolean;
}

const Contexto = createContext<Sesion | null>(null);

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  // Al recargar la página, recupera la sesión si el token sigue vigente
  useEffect(() => {
    if (!token.leer()) { setCargando(false); return; }
    api<Usuario>('/auth/yo')
      .then(setUsuario)
      .catch(() => token.borrar())
      .finally(() => setCargando(false));
  }, []);

  // Si la API corta la sesión (venció o se retiró el acceso del celular), se vuelve al login
  useEffect(() => {
    const terminar = () => setUsuario(null);
    window.addEventListener('gv-sesion-terminada', terminar);
    return () => window.removeEventListener('gv-sesion-terminada', terminar);
  }, []);
  const iniciar = useCallback((t: string, u: Usuario) => { token.guardar(t); setUsuario(u); }, []);
  const cerrar = useCallback(() => { token.borrar(); setUsuario(null); }, []);
  const puede = useCallback((p: string) => !!usuario?.permisos.includes(p), [usuario]);

  return <Contexto.Provider value={{ usuario, cargando, iniciar, cerrar, puede }}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const s = useContext(Contexto);
  if (!s) throw new Error('useSesion debe usarse dentro de <SesionProvider>');
  return s;
}
