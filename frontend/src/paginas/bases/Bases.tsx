import { useEffect, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { basesApi, TEXTO_ESTADO_CARGA, type CargaResumen } from '../../api/bases';
import { ErrorApi } from '../../api/cliente';
import { useSesion } from '../../sesion/SesionContext';
import '../tableros/tableros.css';
import './bases.css';
import { Faltantes } from '../../componentes/Faltantes';

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
  const [origen, setOrigen] = useState<'INTERNA' | 'COMPRADA'>('INTERNA');
  const [proveedor, setProveedor] = useState('');
  const [intentado, setIntentado] = useState(false);
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

  const faltantes = [
    ...(!archivo ? ['Elige el archivo Excel o CSV'] : []),
    ...(origen === 'COMPRADA' && proveedor.trim().length < 2 ? ['Escribe a quién se compró la base'] : []),
  ];

  async function subir() {
    setIntentado(true);
    if (!archivo || faltantes.length) return;
    setSubiendo(true); setError('');
    try {
      const c = await basesApi.subir(archivo, { asignarA: esAsesor ? undefined : asignarA, origen, proveedor: origen === 'COMPRADA' ? proveedor.trim() : undefined });
      const partes = [`${c.nuevas} nuevas`, c.actualizar ? `${c.actualizar} ya están en el CRM y completan datos` : '', c.iguales ? `${c.iguales} sin datos nuevos` : '', `${c.conError} con error`].filter(Boolean);
      navegar(`/bases/${c.id}`, { state: { aviso: `Revisamos ${c.total} filas: ${partes.join(', ')}.` } });
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
              <><b>Arrastra tu Excel aquí o toca para elegirlo</b><span>.xlsx o .csv · máximo 5 MB y 5000 filas</span>
                <span>Columnas: RUC, razón social, representante legal SUNAT, DNI, teléfono, correo, departamento, provincia, distrito, cantidad de líneas y operador</span></>
            )}
          </label>

          <div className="campo">
            <span className="etiqueta obligatorio">¿De dónde viene la base?</span>
            <div className="pestanas" role="radiogroup" aria-label="Origen de la base">
              {([['INTERNA', 'Propia (Growvia)'], ['COMPRADA', 'Comprada a un proveedor']] as const).map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={origen === v} className={`pestana${origen === v ? ' pestana--activa' : ''}`} onClick={() => setOrigen(v)}>{t}</button>
              ))}
            </div>
          </div>
          {origen === 'COMPRADA' && (
            <div className="campo">
              <label htmlFor="proveedor" className="etiqueta obligatorio">Proveedor</label>
              <input id="proveedor" className="entrada" maxLength={100} placeholder="Ej. nombre de la empresa que vendió la base" value={proveedor}
                onChange={(e) => setProveedor(e.target.value)} aria-invalid={intentado && proveedor.trim().length < 2} />
              <span className="campo-ayuda">Queda registrado para saber de dónde salió cada dato.</span>
            </div>
          )}

          {!esAsesor && (
            <div className="campo">
              <label htmlFor="destino" className="etiqueta">¿A quién se asignan las empresas nuevas?</label>
              <select id="destino" className="entrada" value={asignarA} onChange={(e) => setAsignarA(e.target.value)}>
                <option value="repositorio">Repositorio (quedan libres para que las tomen)</option>
                {destinos.map((d) => <option key={d.id} value={d.id}>{d.nombre}{d.equipo ? ` · ${d.equipo}` : ''}</option>)}
              </select>
            </div>
          )}

          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: 'var(--texto-suave)', lineHeight: 1.6 }}>
            <li>Columnas obligatorias: <b>RUC</b> y <b>Razón social</b>. Opcionales: departamento, provincia, distrito y hasta 2 contactos.</li>
            <li><b>No se crean empresas repetidas.</b> Si un RUC ya está en el CRM, la base solo completa los datos que le faltan (operador, líneas, representante, teléfono…). Si un dato es distinto, al aprobar se elige cuál se queda.</li>
            <li>Los RUC repetidos dentro del mismo archivo se cargan una sola vez.</li>
          </ul>

          {intentado && <Faltantes items={faltantes} titulo="Para subir, revisa esto:" />}
          {error && <div className="alerta" role="alert">{error}</div>}
          <button type="button" className="boton" disabled={subiendo} onClick={subir}>{subiendo ? 'Revisando el archivo…' : 'Subir y revisar'}</button>
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
                  {c.estado === 'LISTO'
                    ? `${c.creadas} nuevas · ${c.actualizadas} completadas`
                    : `${c.validas - c.actualizar} nuevas${c.actualizar ? ` · ${c.actualizar} completan datos` : ''}`} · {c.conError} con error · {c.origen === 'COMPRADA' ? `Comprada${c.proveedor ? ` (${c.proveedor})` : ''}` : 'Propia'} · {c.subidoPor} · {fecha(c.fecha)}
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