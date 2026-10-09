import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi, type EmpresaResumen, type Pagina } from '../../api/empresas';
import { ListaEmpresas } from '../../componentes/ListaEmpresas';
import { useDebounce } from '../../hooks/useDebounce';
import { useSesion } from '../../sesion/SesionContext';

type Filtro = 'todas' | 'libres' | 'asignadas';

export function Repositorio() {
  const { usuario, puede } = useSesion();
  const navegar = useNavigate();
  // Desde el buscador de arriba llega ?q=… y se busca en todas las empresas
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [filtro, setFiltro] = useState<Filtro>(params.get('q') ? 'todas' : 'libres');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<Pagina<EmpresaResumen> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [tomando, setTomando] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const nueva = params.get('q');
    if (nueva) { setQ(nueva); setFiltro('todas'); setPagina(1); }
  }, [params]);
  const busqueda = useDebounce(q);
  const puedeTomar = puede('EMPRESA_TOMAR');

  const cargar = () => {
    setCargando(true);
    empresasApi.repositorio({ q: busqueda, filtro, pagina })
      .then((d) => { setDatos(d); setError(''); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el repositorio'))
      .finally(() => setCargando(false));
  };
  useEffect(() => { setPagina(1); }, [busqueda, filtro]);
  useEffect(cargar, [busqueda, filtro, pagina]);

  async function tomar(e: EmpresaResumen) {
    setTomando(e.id); setError('');
    try {
      await empresasApi.tomar(e.id);
      navegar(`/empresas/${e.id}`, { state: { aviso: `${e.razonSocial} ahora está en tu cartera.` } });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo tomar la empresa');
      cargar();
    } finally {
      setTomando(null);
    }
  }

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Repositorio de empresas</h1>
          <p>Todas las empresas del CRM. Las libres las puede tomar cualquier asesor al instante.</p>
        </div>
        {usuario?.rol.codigo === 'ASESOR' && (
          <nav className="pestanas" aria-label="Secciones">
            <Link to="/empresas" className="pestana">Mis empresas</Link>
            <Link to="/repositorio" className="pestana pestana--activa" aria-current="page">Repositorio</Link>
          </nav>
        )}
      </div>

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="fila-acciones">
          <div style={{ flex: '1 1 280px', maxWidth: 420 }}>
            <label htmlFor="q" className="oculto-visual">Buscar</label>
            <input id="q" className="entrada" type="search" placeholder="Buscar por RUC o razón social" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="pestanas" role="group" aria-label="Filtrar">
            {([['libres', 'Libres'], ['asignadas', 'Asignadas'], ['todas', 'Todas']] as [Filtro, string][]).map(([v, t]) => (
              <button key={v} type="button" className={`pestana${filtro === v ? ' pestana--activa' : ''}`} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{t}</button>
            ))}
          </div>
        </div>
        {error && <div className="alerta" role="alert">{error}</div>}
        <ListaEmpresas datos={datos} cargando={cargando} onPagina={setPagina} vacio="No hay empresas con ese filtro."
          accion={(e) => (e.asesorId || !puedeTomar)
            ? <span className={`chip ${e.estado === 'VENTA' ? 'chip--lima' : 'chip--gris'}`}>{e.estado === 'VENTA' ? 'Venta' : 'Prospecto'}</span>
            : <button type="button" className="boton" style={{ height: 38, fontSize: 14, padding: '0 16px' }} disabled={tomando === e.id} onClick={() => tomar(e)}>
                {tomando === e.id ? 'Tomando…' : 'Tomar'}
              </button>} />
      </section>
    </>
  );
}