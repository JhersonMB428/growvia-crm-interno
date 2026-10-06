import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi, type EmpresaResumen, type Pagina } from '../../api/empresas';
import { ListaEmpresas } from '../../componentes/ListaEmpresas';
import { useDebounce } from '../../hooks/useDebounce';

type Estado = '' | 'PROSPECTO' | 'VENTA';

export function MisEmpresas() {
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<Estado>('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<Pagina<EmpresaResumen> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const busqueda = useDebounce(q);

  useEffect(() => { setPagina(1); }, [busqueda, estado]);
  useEffect(() => {
    setCargando(true);
    empresasApi.mias({ q: busqueda, estado: estado || undefined, pagina })
      .then((d) => { setDatos(d); setError(''); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar tu cartera'))
      .finally(() => setCargando(false));
  }, [busqueda, estado, pagina]);

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Mis empresas</h1>
          <p>{datos ? `${datos.total} ${datos.total === 1 ? 'empresa' : 'empresas'} en tu cartera` : 
          'Tu cartera de prospectos y clientes'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <nav className="pestanas" aria-label="Secciones">
            <Link to="/empresas" className="pestana pestana--activa" aria-current="page">Mis empresas</Link>
            <Link to="/repositorio" className="pestana">Repositorio</Link>
          </nav>
          <Link to="/empresas/nueva" className="boton">+ Nuevo prospecto</Link>
        </div>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="fila-acciones">
          <div style={{ flex: '1 1 280px', maxWidth: 420 }}>
            <label htmlFor="q" className="oculto-visual">Buscar</label>
            <input id="q" className="entrada" type="search" placeholder="Buscar por RUC o razón social" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="pestanas" role="group" aria-label="Filtrar por estado">
            {([['', 'Todas'], ['PROSPECTO', 'Prospectos'], ['VENTA', 'Ventas']] as [Estado, string][]).map(([v, t]) => (
              <button key={v} type="button" className={`pestana${estado === v ? ' pestana--activa' : ''}`} aria-pressed={estado === v} onClick={() => setEstado(v)}>{t}</button>
            ))}
          </div>
        </div>
        {error && <div className="alerta" role="alert">{error}</div>}
        <ListaEmpresas datos={datos} cargando={cargando} onPagina={setPagina}
          vacio={busqueda || estado ? 'No hay empresas con ese filtro.' : 'Aún no tienes empresas. Crea un prospecto o toma una del repositorio.'} />
      </section>
    </>
  );
}