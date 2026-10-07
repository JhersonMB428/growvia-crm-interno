import { useEffect, useState } from 'react';
import { ubigeoApi, type Lugar } from '../api/empresas';

/** Departamento → provincia → distrito en cascada. Devuelve el código del distrito (6 dígitos). */
export function SelectorUbigeo({ onCambio, inicial }: { onCambio: (distritoId: string) => void; inicial?: string | null }) {
  const [deps, setDeps] = useState<Lugar[]>([]);
  const [provs, setProvs] = useState<Lugar[]>([]);
  const [dists, setDists] = useState<Lugar[]>([]);
  // Si ya tiene distrito (al corregir una empresa) arranca en él; si no, en Lima / Lima
  const [dep, setDep] = useState(inicial ? inicial.slice(0, 2) : '15');
  const [prov, setProv] = useState(inicial ? inicial.slice(0, 4) : '1501');
  const [dist, setDist] = useState(inicial ?? '');

  useEffect(() => { ubigeoApi.departamentos().then(setDeps); }, []);
  useEffect(() => {
    setProvs([]); setDists([]);
    if (dep) ubigeoApi.provincias(dep).then(setProvs);
  }, [dep]);
  useEffect(() => {
    setDists([]);
    if (prov) ubigeoApi.distritos(prov).then(setDists);
  }, [prov]);
  useEffect(() => { onCambio(dist); }, [dist, onCambio]);

  return (
    <div className="rejilla-3">
      <div className="campo">
        <label htmlFor="dep" className="etiqueta">Departamento</label>
        <select id="dep" className="entrada" value={dep} onChange={(e) => { setDep(e.target.value); setProv(''); setDist(''); }}>
          <option value="">Elige…</option>
          {deps.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="prov" className="etiqueta">Provincia</label>
        <select id="prov" className="entrada" value={prov} disabled={!dep} onChange={(e) => { setProv(e.target.value); setDist(''); }}>
          <option value="">Elige…</option>
          {provs.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="dist" className="etiqueta">Distrito</label>
        <select id="dist" className="entrada" value={dist} disabled={!prov} onChange={(e) => setDist(e.target.value)}>
          <option value="">Elige…</option>
          {dists.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
      </div>
    </div>
  );
}