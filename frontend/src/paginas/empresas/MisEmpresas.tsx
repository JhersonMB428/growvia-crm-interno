import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi, plazo, type EmpresaResumen, type Pagina } from '../../api/empresas';
import '../../componentes/llamada.css';
import { ListaEmpresas } from '../../componentes/ListaEmpresas';
import { FiltrosComerciales } from '../../componentes/FiltrosComerciales';
import { useDebounce } from '../../hooks/useDebounce';
import { recortarRuc } from '../../utilidades/validacion';

type Estado = '' | 'PROSPECTO' | 'VENTA' | 'por_vencer';

/** Venta, o cuánto falta para que el prospecto vuelva al repositorio */
function columnaPlazo(e: EmpresaResumen) {
  if (e.estado === 'VENTA') return <span className="chip chip--lima">Venta</span>;
  const p = plazo(e.retencionHasta);
  if (!p) return <span className="chip chip--gris">Prospecto</span>;
  return <span className={`chip-plazo chip-plazo--${p.nivel}`}>{p.texto}</span>;
}

export function MisEmpresas() {
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso;
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<Estado>('');
  const [pagina, setPagina] = useState(1);
  const [comercial, setComercial] = useState<{ operadorId: number | ''; lineasMin: number | '' }>({ operadorId: '', lineasMin: '' });
  const [datos, setDatos] = useState<(Pagina<EmpresaResumen> & { porVencer: number }) | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const busqueda = useDebounce(q);

  useEffect(() => { setPagina(1); }, [busqueda, estado, comercial]);
  useEffect(() => {
    setCargando(true);
    empresasApi.mias({
      q: busqueda, pagina,
      operadorId: comercial.operadorId || undefined, lineasMin: comercial.lineasMin || undefined,
      ...(estado === 'por_vencer' ? { filtro: 'por_vencer' as const } : { estado: estado || undefined }),
    })
      .then((d) => { setDatos(d); setError(''); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar tu cartera'))
      .finally(() => setCargando(false));
  }, [busqueda, estado, pagina, comercial]);

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
      {!!datos?.porVencer && estado !== 'por_vencer' && (
        <div className="alerta" role="alert" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            <b>{datos.porVencer} {datos.porVencer === 1 ? 'empresa se libera' : 'empresas se liberan'} en las próximas horas.</b>{' '}
            Registra una gestión o pulsa “Mantener 24 h más” en su ficha.
          </span>
          <button type="button" className="boton-secundario" onClick={() => setEstado('por_vencer')}>Ver cuáles</button>
        </div>
      )}

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="fila-acciones">
          <div style={{ flex: '1 1 280px', maxWidth: 420 }}>
            <label htmlFor="q" className="oculto-visual">Buscar</label>
            <input id="q" className="entrada" type="search" placeholder="Buscar por RUC o razón social" value={q} maxLength={100} onChange={(e) => setQ(recortarRuc(e.target.value))} />
          </div>
          <FiltrosComerciales {...comercial} onCambio={setComercial} />
          <div className="pestanas" role="group" aria-label="Filtrar por estado">
            {([['', 'Todas'], ['por_vencer', 'Por vencer'], ['PROSPECTO', 'Prospectos'], ['VENTA', 'Ventas']] as [Estado, string][]).map(([v, t]) => (
              <button key={v} type="button" className={`pestana${estado === v ? ' pestana--activa' : ''}`} aria-pressed={estado === v} onClick={() => setEstado(v)}>{t}</button>
            ))}
          </div>
        </div>
        {error && <div className="alerta" role="alert">{error}</div>}
        <ListaEmpresas datos={datos} cargando={cargando} onPagina={setPagina} accion={columnaPlazo} tituloAccion="Plazo"
          vacio={estado === 'por_vencer' && !busqueda ? 'Ninguna empresa se libera en las próximas 24 horas.' : busqueda || estado ? 'No hay empresas con ese filtro.' : 'Aún no tienes empresas. Crea un prospecto o toma una del repositorio.'} />
      </section>
    </>
  );
}