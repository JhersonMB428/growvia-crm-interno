import { nombrePropio, textoSunat, type DatosSunat, type Representante } from '../api/sunat';

/** Resultado de "Traer de SUNAT": estado del contribuyente y sus representantes legales */
export function PanelSunat({ datos, onUsar, onCerrar }: { datos: DatosSunat; onUsar: (r: Representante) => void; onCerrar?: () => void }) {
  return (
    <div className="bloque panel-sunat">
      <div className="fila-acciones">
        <b>SUNAT · {textoSunat(datos.estado, datos.condicion) || 'sin estado'}</b>
        {onCerrar && <button type="button" className="boton-texto" onClick={onCerrar}>Cerrar</button>}
      </div>
      {datos.alerta && <div className="alerta" role="alert">{datos.alerta}</div>}
      {datos.direccion && <span className="tenue" style={{ fontSize: 14 }}>{datos.direccion}{datos.ubicacion ? ` · ${datos.ubicacion}` : ''}</span>}
      {datos.representantes.length === 0
        ? <span className="tenue" style={{ fontSize: 14 }}>SUNAT no tiene representantes legales registrados para este RUC.</span>
        : (
          <ul className="panel-sunat__lista">
            {datos.representantes.map((r, i) => (
              <li key={i}>
                <span>
                  <b>{nombrePropio(r.nombre)}</b>
                  <span className="tenue numeros">{[r.cargo && nombrePropio(r.cargo), r.documento && `${r.tipoDocumento ?? 'Doc.'} ${r.documento}`, r.desde && `desde ${r.desde.slice(0, 4)}`].filter(Boolean).join(' · ')}</span>
                </span>
                <button type="button" className="boton-secundario" onClick={() => onUsar(r)}>Usar como representante</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}
