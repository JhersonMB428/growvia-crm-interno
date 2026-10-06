import { useEffect, useState } from 'react';

/** Devuelve el valor recién cuando el usuario deja de escribir (para no consultar en cada tecla) */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return v;
}