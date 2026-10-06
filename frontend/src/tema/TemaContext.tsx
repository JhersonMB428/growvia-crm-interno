import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Tema = 'oscuro' | 'claro';
const CLAVE = 'gv-tema';

const Contexto = createContext<{ tema: Tema; alternar: () => void }>({ tema: 'oscuro', alternar: () => {} });

/** Guarda la preferencia de modo claro u oscuro de cada usuario en su navegador */
export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => (localStorage.getItem(CLAVE) === 'claro' ? 'claro' : 'oscuro'));
  useEffect(() => { localStorage.setItem(CLAVE, tema); }, [tema]);
  return (
    <Contexto.Provider value={{ tema, alternar: () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro')) }}>
      {children}
    </Contexto.Provider>
  );
}

export const useTema = () => useContext(Contexto);