import { Link } from 'react-router-dom';
import { ubicacion, type EmpresaResumen, type Pagina } from '../api/empresas';

interface Props {
  datos: Pagina<EmpresaResumen> | null;
  cargando: boolean;
  vacio: string;
  /** Qué mostrar en la última columna (por defecto, el estado) */
  accion?: (e: EmpresaResumen) => React.ReactNode;
  /** Título de la última columna */
  tituloAccion?: string;
  onPagina: (p: number) => void;
}

export function ListaEmpresas({ datos, cargando, vacio, accion, tituloAccion = 'Estado', onPagina }: Props) {
  return (
    <div className="lista">
      <div className="lista__cabecera">
        <span>RUC</span><span>Razón social</span><span>Ubicación</span><span>Asesor</span><span>{tituloAccion}</span>
      </div>
      {cargando && !datos && <div className="lista__vacia">Cargando…</div>}
      {datos && datos.filas.length === 0 && <div className="lista__vacia">{vacio}</div>}
      {datos?.filas.map((e) => (
        <div key={e.id} className="lista__fila">
          <span className="tenue numeros">{e.ruc}</span>
          <span className="lista__empresa">
            <Link to={`/empresas/${e.id}`} className="lista__enlace recortar">{e.razonSocial}</Link>
            <span className="lista__detalle">
              {e.lineasActuales !== null ? `${e.lineasActuales} ${e.lineasActuales === 1 ? 'línea' : 'líneas'}` : 'Líneas sin registrar'}
              {e.operadorActual && ` · ${e.operadorActual}`}
              {!e.datosCompletos && (
                <span className="lista__incompleta" title={`Completa en la ficha: ${(e.datosFaltantes ?? []).join(', ')}`}>
                  Falta: {e.datosFaltantes?.length ? e.datosFaltantes.join(', ') : 'datos'}
                </span>
              )}
            </span>
          </span>
          <span className="tenue recortar">{ubicacion(e)}</span>
          <span className="recortar">{e.asesor ?? <span className="chip chip--crema">Libre</span>}</span>
          <span className="lista__accion">
            {accion ? accion(e) : <span className={`chip ${e.estado === 'VENTA' ? 'chip--lima' : 'chip--gris'}`}>{e.estado === 'VENTA' ? 'Venta' : 'Prospecto'}</span>}
          </span>
        </div>
      ))}
      {datos && datos.paginas > 1 && (
        <div className="paginacion">
          <span>{datos.total} empresas · página {datos.pagina} de {datos.paginas}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="boton-secundario" disabled={datos.pagina <= 1} onClick={() => onPagina(datos.pagina - 1)}>Anterior</button>
            <button type="button" className="boton-secundario" disabled={datos.pagina >= datos.paginas} onClick={() => onPagina(datos.pagina + 1)}>Siguiente</button>
          </div>
        </div>
      )}
    </div>
  );
}