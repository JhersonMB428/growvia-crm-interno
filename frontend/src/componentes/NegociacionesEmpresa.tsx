import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { estadoDe, negociacionesApi, resumenLineas, soles, type NegociacionResumen } from '../api/negociaciones';
import '../paginas/negociaciones/negociaciones.css';

const mes = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });

/** Bloque "Negociaciones" de la ficha de empresa */
export function NegociacionesEmpresa({ empresaId, puedeAbrir }: { empresaId: string; puedeAbrir: boolean }) {
  const [lista, setLista] = useState<NegociacionResumen[] | null>(null);

  useEffect(() => {
    negociacionesApi.deEmpresa(empresaId).then((d) => setLista(d.filas)).catch(() => setLista([]));
  }, [empresaId]);

  const abierta = lista?.find((n) => n.resultado === 'EN_CURSO');

  return (
    <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="fila-acciones">
        <h2 className="h2">Negociaciones</h2>
        {puedeAbrir && lista && !abierta && <Link to={`/negociaciones/nueva?empresa=${empresaId}`} className="boton">+ Nueva negociación</Link>}
      </div>
      {!lista && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>Cargando…</p>}
      {lista?.length === 0 && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>Todavía no hay negociaciones con esta empresa.</p>}
      {lista?.map((n) => (
        <div key={n.id} className="fila-op">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Link to={`/negociaciones/${n.id}`} className="numeros">{n.codigo}</Link>
            <span className="tenue recortar">{resumenLineas(n)} · abierta el {mes(n.creadoAt)}</span>
          </div>
          <b className="numeros">{soles(n.total)}</b>
          <span className={`chip ${n.resultado === 'GANADA' ? 'chip--lima' : n.resultado === 'PERDIDA' ? 'chip--crema' : 'chip--gris'}`}>{estadoDe(n)}</span>
        </div>
      ))}
    </section>
  );
}