import { useEffect, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { basesApi, TEXTO_ESTADO_CARGA, type CargaResumen } from '../../api/bases';
import { ErrorApi } from '../../api/cliente';
import { useSesion } from '../../sesion/SesionContext';
import '../tableros/tableros.css';
import './bases.css';

const fecha = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const claseEstado = (e: string) => (e === 'LISTO' ? 'chip--lima' : e === 'PENDIENTE_APROBACION' ? 'chip--crema' : 'chip--gris');

/** Subir una base de empresas (Excel o CSV) y ver las cargas anteriores */
export function Bases() {
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const esAsesor = usuario?.rol.codigo === 'ASESOR';
  const [cargas, setCargas] = useState<CargaResumen[] | null>(null);
  const [destinos, setDestinos] = useState<{ id: string; nombre: string; equipo: string | null }[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [asignarA, setAsignarA] = useState('repositorio');
  const [encima, setEncima] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    basesApi.listar().then((r) => setCargas(r.filas)).catch(() => setCargas([]));
    if (!esAsesor) basesApi.destinos().then((r) => setDestinos(r.asesores)).catch(() => undefined);
  }, [esAsesor]);

  function elegir(f: File | undefined) {
    setError('');
    if (!f) return;
    if (!/\.(xlsx|csv)$/i.test(f.name)) { setError('El archivo debe ser Excel (.xlsx) o CSV.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('El archivo pesa más de 5 MB.'); return; }
    setArchivo(f);
  }

  function soltar(e: DragEvent) {
    e.preventDefault(); setEncima(false);
    elegir(e.dataTransfer.files[0]);
  }

  async function subir() {
    if (!archivo) return;
    setSubiendo(true); setError('');
    try {
      const c = await basesApi.subir(archivo, esAsesor ? undefined : asignarA);
      navegar(`/bases/${c.id}`, { state: { aviso: `Revisamos ${c.total} filas: ${c.validas} listas para cargar y ${c.conError} con error.` } });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo subir el archivo');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <>
      <div className="encabezado">
        <h1>Cargar base</h1>
        <p>{esAsesor
          ? 'Sube tu propia base de empresas. Tu supervisor la revisa y, al aprobarla, las empresas quedan a tu cargo.'
          : 'Sube una base de empresas: quedan libres en el repositorio o asignadas a un asesor. Se crean al aprobar la carga.'}</p>
      </div>

      <div className="rejilla-tablero">
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="panel-titulo">
            <h2 className="h2">Nuevo archivo</h2>
            <button type="button" className="boton-texto" style={{ minHeight: 0, padding: 0 }}
              onClick={() => basesApi.plantilla().catch((e) => setError(e.message))}>Descargar plantilla</button>
          </div>

          <label className={`zona-archivo${encima ? ' zona-archivo--encima' : ''}${archivo ? ' zona-archivo--lista' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setEncima(true); }} onDragLeave={() => setEncima(false)} onDrop={soltar}>
            <input type="file" accept=".xlsx,.csv" aria-label="Elegir archivo Excel o CSV" onChange={(e) => elegir(e.target.files?.[0])} />
            {archivo ? (
              <><b>{archivo.name}</b><span>{(archivo.size / 1024).toFixed(0)} KB · toca para cambiarlo</span></>
            ) : (
              <><b>Arrastra tu Excel aquí o toca para elegirlo</b><span>.xlsx o .csv · máximo 5 MB y 5000 filas</span></>
            )}
          </label>

          {!esAsesor && (
            <div className="campo">
              <label htmlFor="destino" className="etiqueta">¿A quién se asignan las empresas?</label>
              <select id="destino" className="entrada" value={asignarA} onChange={(e) => setAsignarA(e.target.value)}>
                <option value="repositorio">Repositorio (quedan libres para que las tomen)</option>
                {destinos.map((d) => <option key={d.id} value={d.id}>{d.nombre}{d.equipo ? ` · ${d.equipo}` : ''}</option>)}
              </select>
            </div>
          )}

          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--texto-suave)', lineHeight: 1.6 }}>
            <li>Columnas obligatorias: <b>RUC</b> y <b>Razón social</b>. Opcionales: departamento, provincia, distrito y hasta 2 contactos.</li>
            <li>Los RUC que ya están en el CRM o repetidos en el archivo no se cargan; te mostramos la lista.</li>
          </ul>

          {error && <div className="alerta" role="alert">{error}</div>}
          <button type="button" className="boton" disabled={!archivo || subiendo} onClick={subir}>{subiendo ? 'Revisando el archivo…' : 'Subir y revisar'}</button>
        </section>

        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="h2">Cargas</h2>
          {!cargas && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Cargando…</p>}
          {cargas?.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Todavía no hay cargas.</p>}
          {cargas?.map((c) => (
            <div key={c.id} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, padding: '12px 14px', borderRadius: 16, background: 'var(--campo-fondo)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <Link to={`/bases/${c.id}`} className="recortar" style={{ fontWeight: 700, color: 'var(--texto)', textDecoration: 'none' }}>{c.archivo}</Link>
                <span style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
                  {c.validas} válidas · {c.conError} con error · {c.subidoPor} · {fecha(c.fecha)}
                </span>
              </div>
              <span className={`chip ${claseEstado(c.estado)}`}>{TEXTO_ESTADO_CARGA[c.estado]}</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}