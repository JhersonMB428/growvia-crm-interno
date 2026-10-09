import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Tema = 'oscuro' | 'claro';
const CLAVE = 'gv-tema';
const CLAVE_LIGERO = 'gv-ligero';

interface Apariencia {
  tema: Tema;
  alternar: () => void;
  cambiarTema: (t: Tema) => void;
  /** Modo ligero: sin efecto vidrio, sin animaciones y con menos consultas al servidor (para computadoras lentas) */
  ligero: boolean;
  cambiarLigero: (v: boolean) => void;
}

const leer = (clave: string) => { try { return localStorage.getItem(clave); } catch { return null; } };
const guardar = (clave: string, valor: string) => { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } };

const Contexto = createContext<Apariencia>({ tema: 'oscuro', alternar: () => {}, cambiarTema: () => {}, ligero: false, cambiarLigero: () => {} });

/** Guarda en el navegador de cada equipo el modo claro u oscuro y el modo ligero */
export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => (leer(CLAVE) === 'claro' ? 'claro' : 'oscuro'));
  const [ligero, setLigero] = useState(() => leer(CLAVE_LIGERO) === '1');
  useEffect(() => { guardar(CLAVE, tema); }, [tema]);
  return (
    <Contexto.Provider value={{
      tema, ligero, cambiarTema: setTema,
      // Se guarda solo cuando la persona lo elige (así sabemos si ya decidió)
      cambiarLigero: (v: boolean) => { guardar(CLAVE_LIGERO, v ? '1' : '0'); setLigero(v); },
      alternar: () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro')),
    }}>
      {children}
    </Contexto.Provider>
  );
}

export const useTema = () => useContext(Contexto);

/** ¿Ya eligió algo sobre el modo ligero? (para sugerirlo una sola vez) */
export const yaEligioLigero = () => leer(CLAVE_LIGERO) !== null || leer('gv-ligero-sugerido') === '1';
export const marcarSugerido = () => guardar('gv-ligero-sugerido', '1');