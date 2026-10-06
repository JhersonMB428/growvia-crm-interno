import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi, ubicacion, type Contacto, type EmpresaDetalle } from '../../api/empresas';
import { contactosCompletos, EditorContactos, limpiarContactos } from '../../componentes/EditorContactos';
import { useSesion } from '../../sesion/SesionContext';

const MOTIVO: Record<string, string> = {
  CREACION: 'Registró la empresa', TOMA: 'Tomó la empresa del repositorio', REASIGNACION: 'Reasignó la empresa',
  LIBERACION: 'Volvió al repositorio por inactividad', CARGA: 'Llegó en una base cargada',
};
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function FichaEmpresa() {
  const { id = '' } = useParams();
  const { puede } = useSesion();
  const navegar = useNavigate();
  const [aviso, setAviso] = useState((useLocation().state as { aviso?: string } | null)?.aviso ?? '');
  const [e, setE] = useState<EmpresaDetalle | null>(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState<Contacto[] | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    empresasApi.detalle(id).then(setE).catch((err) => setError(err instanceof ErrorApi ? err.message : 'No se pudo cargar la empresa'));
  }, [id]);

  async function tomar() {
    setOcupado(true); setError('');
    try { setE(await empresasApi.tomar(id)); setAviso('La empresa ahora está en tu cartera.'); }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo tomar la empresa'); }
    finally { setOcupado(false); }
  }

  async function guardarContactos() {
    if (!editando) return;
    setOcupado(true); setError('');
    try { setE(await empresasApi.guardarContactos(id, limpiarContactos(editando))); setEditando(null); setAviso('Contactos actualizados.'); }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudieron guardar los contactos'); }
    finally { setOcupado(false); }
  }

  if (error && !e) return <div className="alerta" role="alert">{error}</div>;
  if (!e) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <button type="button" className="boton-texto" style={{ alignSelf: 'flex-start', minHeight: 0 }} onClick={() => navegar(-1)}>← Volver</button>
          <h1>{e.razonSocial}</h1>
          <p className="numeros">RUC {e.ruc} · {ubicacion(e)}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`chip ${e.estado === 'VENTA' ? 'chip--lima' : 'chip--gris'}`}>{e.estado === 'VENTA' ? 'Venta' : 'Prospecto'}</span>
          {e.libre && <span className="chip chip--crema">Libre</span>}
          {e.libre && puede('EMPRESA_TOMAR') && <button type="button" className="boton" onClick={tomar} disabled={ocupado}>{ocupado ? 'Tomando…' : 'Tomar empresa'}</button>}
        </div>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="panel vidrio" style={{ flex: '2 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="rejilla-3">
            <div className="dato"><span>Asesor a cargo</span><b>{e.asesor ?? 'Nadie (libre)'}</b></div>
            <div className="dato"><span>Equipo</span><b>{e.equipo ?? '—'}</b></div>
            <div className="dato"><span>Origen</span><b>{e.origen === 'BASE' ? 'Base cargada' : 'Prospección propia'}</b></div>
            <div className="dato"><span>Asignada desde</span><b>{fecha(e.asignadoAt)}</b></div>
            <div className="dato"><span>Última gestión</span><b>{fecha(e.ultimaGestionAt)}</b></div>
            <div className="dato"><span>Registrada</span><b>{fecha(e.creadoAt)}</b></div>
          </div>

          <div style={{ height: 1, background: 'var(--linea)' }} />

          <div className="fila-acciones">
            <h2 className="h2">Contactos</h2>
            {e.puedeEditar && !editando && e.contactos && (
              <button type="button" className="boton-secundario" onClick={() => setEditando(e.contactos!.map((c) => ({ nombre: c.nombre, celular: c.celular, correo: c.correo ?? '' })))}>Editar</button>
            )}
          </div>

          {e.contactos === null && (
            <p style={{ color: 'var(--texto-suave)', lineHeight: 1.5 }}>
              Los contactos e información comercial solo los ven el asesor a cargo, su supervisor, gerencia y back office.
            </p>
          )}
          {e.contactos && !editando && (
            <div className="rejilla-2">
              {e.contactos.map((c) => (
                <div key={c.id} className="bloque" style={{ gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--texto-tenue)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.posicion === 1 ? 'Principal' : 'Secundario'}</span>
                  <b>{c.nombre}</b>
                  <a href={`tel:${c.celular}`} className="numeros" style={{ textDecoration: 'none' }}>{c.celular.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</a>
                  {c.correo && <a href={`mailto:${c.correo}`} style={{ textDecoration: 'none' }}>{c.correo}</a>}
                </div>
              ))}
            </div>
          )}
          {editando && (
            <>
              <EditorContactos contactos={editando} onChange={setEditando} />
              <div className="fila-acciones">
                <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>Cancelar</button>
                <button type="button" className="boton" disabled={!contactosCompletos(editando) || ocupado} onClick={guardarContactos}>Guardar contactos</button>
              </div>
            </>
          )}
        </section>

        <aside className="panel vidrio" style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2">Historial</h2>
          {e.historial === null && <p style={{ color: 'var(--texto-suave)' }}>Sin acceso al historial de esta empresa.</p>}
          {e.historial?.length === 0 && <p style={{ color: 'var(--texto-suave)' }}>Sin movimientos todavía.</p>}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {e.historial?.map((h, i) => (
              <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 14, borderLeft: '2px solid var(--linea)' }}>
                <b style={{ fontSize: 14 }}>{MOTIVO[h.motivo] ?? h.motivo}</b>
                <span style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
                  {h.motivo === 'LIBERACION' ? `Antes: ${h.asesorAnterior ?? '—'}` : h.hechoPor}
                  {h.motivo === 'REASIGNACION' && ` · de ${h.asesorAnterior ?? '—'} a ${h.asesorNuevo ?? '—'}`}
                  {' · '}{fecha(h.fecha)}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}