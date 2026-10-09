import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { abrirRecorrido } from '../../componentes/Recorrido';
import { useSesion } from '../../sesion/SesionContext';
import { GUIA_COMUN, GUIA_POR_ROL, type Tema } from './contenido';
import './ayuda.css';

/** Quita tildes y mayúsculas para buscar "renovacion" y encontrar "Renovación" */
const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Guía de uso: cómo hacer cada cosa según el rol, más lo que vale para todos */
export function Ayuda() {
  const { usuario } = useSesion();
  const [q, setQ] = useState('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const grupos = useMemo(() => {
    if (!usuario) return [];
    const filtrar = (temas: Tema[]) => {
      const n = normalizar(q.trim());
      if (!n) return temas;
      return temas.filter((t) => normalizar([t.titulo, t.resumen, ...t.pasos, t.consejo ?? ''].join(' ')).includes(n));
    };
    return [
      { titulo: `Tu trabajo como ${usuario.rol.nombre.toLowerCase()}`, temas: filtrar(GUIA_POR_ROL[usuario.rol.codigo]) },
      { titulo: 'Para todos', temas: filtrar(GUIA_COMUN) },
    ].filter((g) => g.temas.length);
  }, [usuario, q]);

  const buscando = q.trim().length > 0;
  const alternar = (id: string) => setAbiertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Ayuda</h1>
          <p>Cómo hacer cada cosa en el CRM, paso a paso.</p>
        </div>
        <button type="button" className="boton-secundario" onClick={abrirRecorrido}>Ver el recorrido de bienvenida</button>
      </div>

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <input className="entrada ayuda-buscar" type="search" placeholder="¿Qué necesitas hacer? Ej.: renovar, contraseña, celular"
          aria-label="Buscar en la ayuda" value={q} onChange={(e) => setQ(e.target.value)} />

        {grupos.length === 0 && <p className="ayuda-nota">No encontramos nada con “{q.trim()}”. Prueba con otra palabra o pregúntale a tu supervisor.</p>}

        {grupos.map((g) => (
          <div key={g.titulo} className="ayuda-grupo">
            <h2 className="h2">{g.titulo}</h2>
            <div className="ayuda-temas">
              {g.temas.map((t) => {
                const abierto = buscando || abiertos.has(t.id);
                return (
                  <article key={t.id} className={`ayuda-tema${abierto ? ' ayuda-tema--abierto' : ''}`}>
                    <button type="button" className="ayuda-tema__cabecera" aria-expanded={abierto} onClick={() => alternar(t.id)}>
                      <span><b>{t.titulo}</b><span>{t.resumen}</span></span>
                      <span className="ayuda-tema__flecha" aria-hidden="true">›</span>
                    </button>
                    {abierto && (
                      <div className="ayuda-tema__cuerpo">
                        <ol>{t.pasos.map((paso, i) => <li key={i}>{paso}</li>)}</ol>
                        {t.consejo && <p className="ayuda-consejo"><b>Importante:</b> {t.consejo}</p>}
                        {t.enlace && <Link to={t.enlace.ruta} className="boton-secundario" style={{ alignSelf: 'flex-start' }}>{t.enlace.texto}</Link>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}