import { useEffect, useState } from 'react';
import { ErrorApi } from '../../api/cliente';
import { mesActual, mesLargo, moverMes, pct, tablerosApi, type MetasMes } from '../../api/tableros';
import { BarraMeta } from '../../componentes/graficos';
import './tableros.css';

/** Estado del asesor según la proyección al cierre */
function estado(lineas: number, proyeccion: number, meta: number | null) {
  if (!meta) return { texto: 'Sin meta', clase: 'chip--gris' };
  if (lineas >= meta) return { texto: 'Cumplió', clase: 'chip--lima' };
  if (proyeccion >= meta) return { texto: 'En camino', clase: 'chip--lima' };
  if (proyeccion >= meta * 0.7) return { texto: 'Ajustado', clase: 'chip--crema' };
  return { texto: 'En riesgo', clase: 'chip--crema' };
}

/** Metas del mes en líneas: el supervisor define las de su equipo; gerencia, todas (y la de cada equipo) */
export function Metas() {
  const [mes, setMes] = useState(mesActual());
  const [datos, setDatos] = useState<MetasMes | null>(null);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState('');

  useEffect(() => {
    setDatos(null); setBorrador({}); setAviso('');
    tablerosApi.metas(mes).then(setDatos).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las metas'));
  }, [mes]);

  async function guardar(alcance: 'ASESOR' | 'EQUIPO', id: string, nombre: string) {
    const valor = Number(borrador[id]);
    if (!Number.isInteger(valor) || valor < 0) return;
    setGuardando(id); setError('');
    try {
      setDatos(await tablerosApi.guardarMeta(mes, alcance, id, valor));
      setBorrador((b) => { const n = { ...b }; delete n[id]; return n; });
      setAviso(`Meta de ${nombre}: ${valor} líneas.`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar la meta');
    } finally {
      setGuardando('');
    }
  }

  function campo(alcance: 'ASESOR' | 'EQUIPO', id: string, nombre: string, actual: number | null) {
    const valor = borrador[id] ?? (actual === null ? '' : String(actual));
    const cambiado = borrador[id] !== undefined && borrador[id] !== String(actual ?? '');
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
        <input className="entrada entrada-meta numeros" inputMode="numeric" aria-label={`Meta de líneas de ${nombre}`} placeholder="—"
          value={valor} onChange={(e) => setBorrador((b) => ({ ...b, [id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
          onKeyDown={(e) => { if (e.key === 'Enter' && cambiado) guardar(alcance, id, nombre); }} />
        <button type="button" className="boton" style={{ height: 42, padding: '0 16px', fontSize: 14, visibility: cambiado ? 'visible' : 'hidden' }}
          disabled={guardando === id || valor === ''} onClick={() => guardar(alcance, id, nombre)}>{guardando === id ? '…' : 'Guardar'}</button>
      </div>
    );
  }

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Metas</h1>
          <p>Meta mensual en líneas activas. Barra sólida = logrado · barra tenue = proyección al cierre · raya = meta.</p>
        </div>
        <div className="selector-mes" aria-label="Mes">
          <button type="button" className="calendario__flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>‹</button>
          <b>{mesLargo(mes)}</b>
          <button type="button" className="calendario__flecha" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))}>›</button>
        </div>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}
      {!datos && !error && <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>}
      {datos && !datos.editable && mes < mesActual() && <div className="aviso" role="status">Es un mes pasado: las metas se muestran solo como consulta.</div>}

      {datos && (
        <>
          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2">Equipos</h2>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Equipo</th><th style={{ minWidth: 200 }}>Avance</th><th className="num">Logrado</th><th className="num">Suma metas asesores</th><th className="num">Meta del equipo</th></tr></thead>
                <tbody>
                  {datos.equipos.map((e) => (
                    <tr key={e.id}>
                      <td><b>{e.nombre}</b><div className="tenue">{e.supervisor ? `Sup. ${e.supervisor}` : 'Sin supervisor'}</div></td>
                      <td><BarraMeta logrado={e.lineas} meta={e.metaLineas ?? (e.sumaMetasAsesores || null)} proyeccion={e.proyeccion} etiqueta={`Avance de ${e.nombre}`} /></td>
                      <td className="num">{e.lineas}</td>
                      <td className="num">{e.sumaMetasAsesores || '—'}</td>
                      <td className="num">{datos.editable && datos.puedeMetaEquipo ? campo('EQUIPO', e.id, e.nombre, e.metaLineas) : (e.metaLineas ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2">Asesores · {datos.asesores.length}</h2>
            {datos.asesores.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>No hay asesores activos.</p>}
            {datos.asesores.length > 0 && (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead><tr><th>Asesor</th><th style={{ minWidth: 200 }}>Avance</th><th className="num">Logrado</th><th className="num">Proyección</th><th>Estado</th><th className="num">Meta (líneas)</th></tr></thead>
                  <tbody>
                    {datos.asesores.map((a) => {
                      const st = estado(a.lineas, a.proyeccion, a.metaLineas);
                      return (
                        <tr key={a.id}>
                          <td><b>{a.nombre}</b><div className="tenue">{a.equipo ?? 'Sin equipo'}</div></td>
                          <td><BarraMeta logrado={a.lineas} meta={a.metaLineas} proyeccion={a.proyeccion} etiqueta={`Avance de ${a.nombre}`} /></td>
                          <td className="num">{a.lineas}{a.metaLineas ? <span className="tenue"> · {pct(a.lineas, a.metaLineas)}%</span> : null}</td>
                          <td className="num">{a.proyeccion}</td>
                          <td><span className={`chip ${st.clase}`}>{st.texto}</span></td>
                          <td className="num">{datos.editable ? campo('ASESOR', a.id, a.nombre, a.metaLineas) : (a.metaLineas ?? '—')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}