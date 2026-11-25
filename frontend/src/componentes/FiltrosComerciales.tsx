import { useEffect, useState } from 'react';
import { negociacionesApi, type Operador } from '../api/negociaciones';

const LINEAS = [5, 10, 20, 50, 100];

interface Props {
  operadorId: number | '';
  lineasMin: number | '';
  onCambio: (f: { operadorId: number | ''; lineasMin: number | '' }) => void;
}

/** Filtra por operador actual y cantidad mínima de líneas: para ir primero a las empresas que valen la pena */
export function FiltrosComerciales({ operadorId, lineasMin, onCambio }: Props) {
  const [operadores, setOperadores] = useState<Operador[]>([]);
  useEffect(() => { negociacionesApi.catalogos().then((k) => setOperadores(k.operadores)).catch(() => undefined); }, []);

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ width: 165 }}>
        <label htmlFor="f-operador" className="oculto-visual">Operador actual</label>
        <select id="f-operador" className="entrada" value={operadorId}
          onChange={(e) => onCambio({ operadorId: e.target.value === '' ? '' : Number(e.target.value), lineasMin })}>
          <option value="">Todo operador</option>
          {operadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      </div>
      <div style={{ width: 165 }}>
        <label htmlFor="f-lineas" className="oculto-visual">Cantidad de líneas</label>
        <select id="f-lineas" className="entrada" value={lineasMin}
          onChange={(e) => onCambio({ operadorId, lineasMin: e.target.value === '' ? '' : Number(e.target.value) })}>
          <option value="">Líneas: todas</option>
          {LINEAS.map((n) => <option key={n} value={n}>{n}+ líneas</option>)}
        </select>
      </div>
    </div>
  );
}
