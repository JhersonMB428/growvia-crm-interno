import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { empresasApi, ubicacion, type EmpresaResumen } from '../api/empresas';
import { useDebounce } from '../hooks/useDebounce';
import { Icono } from '../layout/Icono';
import './buscador.css';

/** Buscador de la barra superior: cualquier empresa por RUC o razón social (solo datos generales) */
export function BuscadorEmpresas() {
  const navegar = useNavigate();
  const caja = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<EmpresaResumen[] | null>(null);
  const [total, setTotal] = useState(0);
  const [marcado, setMarcado] = useState(0);
  const busqueda = useDebounce(q.trim(), 300);

  useEffect(() => {
    if (busqueda.length < 3) { setFilas(null); return; }
    let vigente = true;
    empresasApi.repositorio({ q: busqueda, filtro: 'todas', pagina: 1 })
      .then((r) => { if (vigente) { setFilas(r.filas.slice(0, 7)); setTotal(r.total); setMarcado(0); } })
      .catch(() => { if (vigente) setFilas([]); });
    return () => { vigente = false; };
  }, [busqueda]);

  // Se cierra al hacer clic fuera
  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  function ir(ruta: string) { setAbierto(false); setQ(''); navegar(ruta); }
  const verTodas = () => ir(`/repositorio?q=${encodeURIComponent(q.trim())}`);

  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setAbierto(false); return; }
    if (!filas?.length) { if (e.key === 'Enter' && q.trim().length >= 3) verTodas(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((m) => Math.min(m + 1, filas.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((m) => Math.max(m - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); ir(`/empresas/${filas[marcado].id}`); }
  }

  const mostrar = abierto && q.trim().length > 0;

  return (
    <div className="topbar__buscar" ref={caja}>
      <label htmlFor="buscar" className="oculto-visual">Buscar empresa por RUC o razón social</label>
      <span className="topbar__lupa"><Icono nombre="buscar" tam={18} /></span>
      <input id="buscar" type="search" placeholder="Buscar por RUC o razón social" autoComplete="off"
        role="combobox" aria-expanded={mostrar} aria-controls="buscar-resultados" aria-autocomplete="list"
        aria-activedescendant={mostrar && filas?.length ? `buscar-${filas[marcado]?.id}` : undefined}
        value={q} onChange={(e) => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} onKeyDown={tecla} />
      {mostrar && (
        <div className="buscador__panel" id="buscar-resultados" role="listbox" aria-label="Empresas encontradas">
          {q.trim().length < 3 && <p className="buscador__nota">Escribe al menos 3 letras o números.</p>}
          {q.trim().length >= 3 && filas === null && <p className="buscador__nota">Buscando…</p>}
          {filas?.length === 0 && <p className="buscador__nota">No encontramos empresas con “{q.trim()}”.</p>}
          {filas?.map((f, j) => (
            <button key={f.id} id={`buscar-${f.id}`} type="button" role="option" aria-selected={j === marcado}
              className={`buscador__fila${j === marcado ? ' buscador__fila--marcada' : ''}`}
              onMouseEnter={() => setMarcado(j)} onClick={() => ir(`/empresas/${f.id}`)}>
              <span className="buscador__texto">
                <b className="recortar">{f.razonSocial}</b>
                <span className="numeros">RUC {f.ruc} · {ubicacion(f)}</span>
              </span>
              <span className={`chip ${f.asesorId ? 'chip--gris' : 'chip--crema'}`}>{f.asesor ?? 'Libre'}</span>
            </button>
          ))}
          {!!filas?.length && total > filas.length && (
            <button type="button" className="buscador__todas" onClick={verTodas}>Ver las {total} empresas en el repositorio</button>
          )}
        </div>
      )}
    </div>
  );
}