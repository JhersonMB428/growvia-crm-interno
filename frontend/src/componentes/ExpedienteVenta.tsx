import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorApi } from '../api/cliente';
import { expedienteApi, pesoLegible, TEXTO_DOCUMENTO, type Documento, type Expediente, type TipoDocumento } from '../api/expediente';
import './expediente.css';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const ACEPTA = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

/**
 * Expediente digital de una venta: contrato, DNI, ficha RUC, carta de portabilidad...
 * `compacto` se usa dentro de la bandeja de back office (sin el panel de vidrio alrededor).
 */
export function ExpedienteVenta({ negociacionId, compacto = false, onCambio }: { negociacionId: string; compacto?: boolean; onCambio?: (total: number) => void }) {
  const [exp, setExp] = useState<Expediente | null>(null);
  const [tipo, setTipo] = useState<TipoDocumento>('CONTRATO');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [visor, setVisor] = useState<{ url: string; doc: Documento } | null>(null);

  const actualizar = useCallback((e: Expediente) => { setExp(e); onCambio?.(e.documentos.length); }, [onCambio]);

  useEffect(() => {
    expedienteApi.listar(negociacionId).then(actualizar).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el expediente'));
  }, [negociacionId, actualizar]);

  // Libera el archivo de memoria al cerrar el visor; Escape lo cierra
  useEffect(() => {
    if (!visor) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setVisor(null); };
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('keydown', tecla); URL.revokeObjectURL(visor.url); };
  }, [visor]);

  function elegir(f: File | undefined) {
    setError('');
    if (!f) return;
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(f.name)) { setError('Solo PDF o fotos (JPG, PNG o WEBP).'); return; }
    if (exp && f.size > exp.maxMb * 1024 * 1024) { setError(`El archivo pesa más de ${exp.maxMb} MB.`); return; }
    setArchivo(f);
  }

  async function subir() {
    if (!archivo) return;
    setOcupado(true); setError('');
    try { actualizar(await expedienteApi.subir(negociacionId, tipo, archivo, exp?.maxMb)); setArchivo(null); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo subir el archivo'); }
    finally { setOcupado(false); }
  }

  async function ver(doc: Documento) {
    setError('');
    try { setVisor({ url: await expedienteApi.ver(doc.id), doc }); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo abrir el documento'); }
  }

  async function eliminar(doc: Documento) {
    if (!window.confirm(`¿Eliminar "${doc.nombre}" del expediente?`)) return;
    setOcupado(true); setError('');
    try { actualizar(await expedienteApi.eliminar(doc.id)); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo eliminar'); }
    finally { setOcupado(false); }
  }

  if (!exp) return error ? <div className="alerta" role="alert">{error}</div> : null;
  // Nadie puede subir y está vacío (p. ej. una negociación perdida): no se muestra
  if (!exp.puedeSubir && exp.documentos.length === 0 && !compacto) return null;

  const lleno = exp.documentos.length >= exp.maximo;
  const contenido = (
    <>
      <div className="fila-acciones">
        {compacto ? <b>Expediente</b> : <h2 className="h2">Expediente</h2>}
        <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>{exp.documentos.length} de {exp.maximo} documentos</span>
      </div>

      {exp.documentos.length === 0 && (
        <p style={{ margin: 0, color: 'var(--texto-suave)', fontSize: 14 }}>
          {compacto ? 'El asesor no subió documentos.' : 'Sube el contrato firmado, el DNI del representante y, si hay portabilidad, la carta firmada.'}
        </p>
      )}

      {exp.documentos.length > 0 && (
        <ul className="expediente__lista">
          {exp.documentos.map((d) => (
            <li key={d.id} className="expediente__doc">
              <span className="expediente__icono" aria-hidden="true">{d.mime === 'application/pdf' ? 'PDF' : 'IMG'}</span>
              <span className="expediente__info">
                <b>{TEXTO_DOCUMENTO[d.tipo]}</b>
                <span className="recortar">{d.nombre} · {pesoLegible(d.tamano)} · {d.subidoPor} · {fecha(d.fecha)}</span>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="boton-secundario expediente__accion" onClick={() => ver(d)}>Ver</button>
                {d.puedeEliminar && (
                  <button type="button" className="boton-secundario boton-peligro expediente__accion" disabled={ocupado} onClick={() => eliminar(d)} aria-label={`Eliminar ${d.nombre}`}>Eliminar</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {exp.puedeSubir && !lleno && (
        <div className="expediente__subir">
          <div className="campo" style={{ flex: '1 1 200px' }}>
            <label htmlFor={`tipo-${negociacionId}`} className="etiqueta">Documento</label>
            <select id={`tipo-${negociacionId}`} className="entrada" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDocumento)}>
              {(Object.keys(TEXTO_DOCUMENTO) as TipoDocumento[]).map((t) => <option key={t} value={t}>{TEXTO_DOCUMENTO[t]}</option>)}
            </select>
          </div>
          <label className={`expediente__archivo${archivo ? ' expediente__archivo--listo' : ''}`}>
            <input type="file" accept={ACEPTA} aria-label="Elegir PDF o foto" onChange={(e) => { elegir(e.target.files?.[0]); e.target.value = ''; }} />
            <b className="recortar">{archivo ? archivo.name : 'Elegir PDF o foto'}</b>
            <span>{archivo ? pesoLegible(archivo.size) : `máximo ${exp.maxMb} MB`}</span>
          </label>
          <button type="button" className="boton" disabled={!archivo || ocupado} onClick={subir}>{ocupado ? 'Subiendo…' : 'Subir'}</button>
        </div>
      )}
      {exp.puedeSubir && lleno && <p style={{ margin: 0, fontSize: 13, color: 'var(--texto-tenue)' }}>Llegaste al máximo de documentos.</p>}

      {error && <div className="alerta" role="alert">{error}</div>}

      {/* Fuera de los paneles de vidrio (que encierran los elementos fijos), pero dentro de .app para heredar el tema */}
      {visor && createPortal(
        <div className="visor" role="dialog" aria-modal="true" aria-label={visor.doc.nombre} onClick={() => setVisor(null)}>
          <div className="visor__caja" onClick={(e) => e.stopPropagation()}>
            <div className="visor__barra">
              <b className="recortar">{TEXTO_DOCUMENTO[visor.doc.tipo]} · {visor.doc.nombre}</b>
              <button type="button" className="boton-secundario" onClick={() => setVisor(null)} autoFocus>Cerrar</button>
            </div>
            {visor.doc.mime === 'application/pdf'
              ? <iframe className="visor__contenido" src={visor.url} title={visor.doc.nombre} />
              : <div className="visor__contenido visor__imagen"><img src={visor.url} alt={visor.doc.nombre} /></div>}
          </div>
        </div>,
        document.querySelector('.app') ?? document.body,
      )}
    </>
  );

  if (compacto) return <div className="bloque" style={{ gap: 12 }}>{contenido}</div>;
  return <section id="expediente" className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{contenido}</section>;
}