import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi, textoBloqueo, ubicacion, type Contacto, type EmpresaDetalle } from '../../api/empresas';
import type { GestionRegistrada, ResultadoGestion } from '../../api/gestiones';
import { LlamadaRapida } from '../../componentes/LlamadaRapida';
import { useVisitaFicha } from '../../hooks/useVisitaFicha';
import { contactosCompletos, EditorContactos, limpiarContactos, problemasContactos } from '../../componentes/EditorContactos';
import { Faltantes } from '../../componentes/Faltantes';
import { textoSunat } from '../../utilidades/texto';
import { GestionesEmpresa } from '../../componentes/GestionesEmpresa';
import { negociacionesApi, type Operador } from '../../api/negociaciones';
import { NegociacionesEmpresa } from '../../componentes/NegociacionesEmpresa';
import { SelectorUbigeo } from '../../componentes/SelectorUbigeo';
import { useSesion } from '../../sesion/SesionContext';

const MOTIVO: Record<string, string> = {
  CREACION: 'Registró la empresa', TOMA: 'Tomó la empresa del repositorio', REASIGNACION: 'Reasignó la empresa',
  LIBERACION: 'Volvió al repositorio: venció su plazo', CARGA: 'Llegó en una base cargada',
  DEVUELTA: 'El asesor la devolvió al repositorio', SIN_RESPUESTA: 'Volvió al repositorio: no contestó en varios intentos',
  RECHAZO: 'Volvió al repositorio: no está interesada',
};
/** Motivos en que la empresa se fue del asesor anterior */
const SALIDAS = ['LIBERACION', 'DEVUELTA', 'SIN_RESPUESTA', 'RECHAZO'];
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export function FichaEmpresa() {
  const { id = '' } = useParams();
  const { puede } = useSesion();
  const navegar = useNavigate();
  const [aviso, setAviso] = useState((useLocation().state as { aviso?: string } | null)?.aviso ?? '');
  const [e, setE] = useState<EmpresaDetalle | null>(null);
  const [error, setError] = useState('');
  const [editando, setEditando] = useState<Contacto[] | null>(null);
  const [intentoContactos, setIntentoContactos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState<{ razonSocial: string; distritoId: string } | null>(null);
  const [reasignando, setReasignando] = useState(false);
  const [preseleccion, setPreseleccion] = useState<{ resultado: ResultadoGestion; n: number } | null>(null);
  const [recargaGestiones, setRecargaGestiones] = useState(0);
  // Estable para que el selector de ubigeo no se re-ejecute en cada render
  const alCambiarDistrito = useCallback((d: string) => setCorrigiendo((c) => (c && c.distritoId !== d ? { ...c, distritoId: d } : c)), []);

  useEffect(() => {
    empresasApi.detalle(id).then(setE).catch((err) => setError(err instanceof ErrorApi ? err.message : 'No se pudo cargar la empresa'));
  }, [id]);

  // Tiempo en la ficha: solo cuenta para el asesor a cargo
  useVisitaFicha(id, !!e?.puedeEditar);

  /** Tras registrar una gestión: si la empresa se liberó, vuelve a la cartera; si no, actualiza el plazo */
  function alRegistrar(g: GestionRegistrada) {
    if (g.liberada && e) {
      navegar('/empresas', {
        state: {
          aviso: g.liberada === 'RECHAZO'
            ? `${e.razonSocial} volvió al repositorio como no interesada. Nadie la llamará por un tiempo.`
            : `${e.razonSocial} no contestó en varios intentos: volvió al repositorio para que la intente otro asesor.`,
        },
      });
      return;
    }
    setE((x) => (x ? { ...x, retencionHasta: g.retencionHasta, ultimaGestionAt: g.fecha, prorrogada: false } : x));
    setRecargaGestiones((n) => n + 1);
    setAviso(g.resultado === 'NO_CONTESTA' ? 'Registrado: no contestó. Vuelve a intentarlo antes de que venza el plazo.' : 'Gestión registrada.');
  }

  function preseleccionar(resultado: ResultadoGestion) {
    setPreseleccion((p) => ({ resultado, n: (p?.n ?? 0) + 1 }));
    document.getElementById('gestiones')?.scrollIntoView({ behavior: 'smooth' });
  }

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

  async function guardarDatos() {
    if (!corrigiendo) return;
    setOcupado(true); setError('');
    try { setE(await empresasApi.corregir(id, { razonSocial: corrigiendo.razonSocial.trim(), distritoId: corrigiendo.distritoId })); setCorrigiendo(null); setAviso('Datos de la empresa corregidos.'); }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudieron guardar los datos'); }
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
          {e.sunatEstado && (
            <span className={`chip ${e.sunatEstado === 'ACTIVO' && (!e.sunatCondicion || e.sunatCondicion === 'HABIDO') ? 'chip--lima' : 'chip--alerta'}`}
              title={`Consultado en SUNAT el ${fecha(e.sunatConsultadoAt ?? null)}`}>SUNAT: {textoSunat(e.sunatEstado, e.sunatCondicion)}</span>
          )}
          {e.libre && e.bloqueadaParaMi && <span className="chip chip--gris" title="Por ahora no se puede tomar">{textoBloqueo(e)}</span>}
          {e.libre && !e.bloqueadaParaMi && puede('EMPRESA_TOMAR') && <button type="button" className="boton" onClick={tomar} disabled={ocupado}>{ocupado ? 'Tomando…' : 'Tomar empresa'}</button>}
          {puede('EMPRESA_REASIGNAR') && !reasignando && (
            <button type="button" className="boton-secundario" onClick={() => setReasignando(true)}>{e.libre ? 'Asignar' : 'Reasignar'}</button>
          )}
          {e.puedeEditar && puede('NEGOCIACION_GESTIONAR') && (
            <button type="button" className="boton"
              onClick={() => document.getElementById('gestiones')?.scrollIntoView({ behavior: 'smooth' })}>Registrar gestión</button>
          )}
        </div>
      </div>

      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {error && <div className="alerta" role="alert">{error}</div>}
      {e.puedeEditar && e.estado === 'PROSPECTO' && puede('NEGOCIACION_GESTIONAR') && (
        <LlamadaRapida empresa={e} onPreseleccion={preseleccionar} onRegistrada={alRegistrar}
          onMantenida={(h) => { setE({ ...e, retencionHasta: h, prorrogada: true }); setAviso('Listo: tienes 24 horas más con esta empresa.'); }}
          onLiberada={() => navegar('/empresas', { state: { aviso: `${e.razonSocial} volvió al repositorio.` } })} />
      )}
      {reasignando && (
        <Reasignar e={e} onCancelar={() => setReasignando(false)}
          onHecho={(d) => { setE(d); setReasignando(false); setAviso(`La empresa ahora está a cargo de ${d.asesor}.`); }} />
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="panel vidrio" style={{ flex: '2 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {e.puedeCorregirDatos && !corrigiendo && (
            <div className="fila-acciones" style={{ justifyContent: 'flex-end', marginBottom: -8 }}>
              <button type="button" className="boton-secundario" onClick={() => setCorrigiendo({ razonSocial: e.razonSocial, distritoId: e.distritoId ?? '' })}>Corregir datos</button>
            </div>
          )}
          {corrigiendo && (
            <div className="bloque">
              <b>Corregir datos de la empresa</b>
              <div className="campo">
                <label htmlFor="razon-corr" className="etiqueta">Razón social</label>
                <input id="razon-corr" className="entrada" maxLength={200} value={corrigiendo.razonSocial}
                  onChange={(ev) => setCorrigiendo({ ...corrigiendo, razonSocial: ev.target.value })} />
              </div>
              <SelectorUbigeo inicial={e.distritoId} onCambio={alCambiarDistrito} />
              <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>El RUC no se puede cambiar.</span>
              <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="boton-secundario" onClick={() => setCorrigiendo(null)}>Cancelar</button>
                <button type="button" className="boton" disabled={ocupado || corrigiendo.razonSocial.trim().length < 3 || !corrigiendo.distritoId} onClick={guardarDatos}>Guardar datos</button>
              </div>
            </div>
          )}
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
            <h2 className="h2">Representante y contactos</h2>
            {(e.puedeEditar || e.puedeCorregirDatos) && !editando && e.contactos && (
              <button type="button" className="boton-secundario" onClick={() => setEditando(e.contactos!.map((c) => ({ nombre: c.nombre, celular: c.celular ?? '', correo: c.correo ?? '', dni: c.dni ?? '' })))}>Editar</button>
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--texto-tenue)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.posicion === 1 ? 'Representante legal (SUNAT)' : 'Otro contacto'}</span>
                  <b>{c.nombre}</b>
                  {c.posicion === 1 && <span className="numeros" style={{ fontSize: 14, color: 'var(--texto-suave)' }}>{c.dni ? `DNI ${c.dni}` : 'DNI sin registrar'}</span>}
                  {c.celular
                    ? <a href={`tel:${c.celular}`} className="numeros" style={{ textDecoration: 'none' }}>{c.celular.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</a>
                    : <span style={{ fontSize: 14, color: 'var(--salir)' }}>Teléfono sin registrar</span>}
                  {c.correo && <a href={`mailto:${c.correo}`} style={{ textDecoration: 'none' }}>{c.correo}</a>}
                </div>
              ))}
            </div>
          )}
          {editando && (
            <>
              <EditorContactos contactos={editando} onChange={setEditando} mostrarErrores={intentoContactos} telefonoRepOpcional />
              {intentoContactos && <Faltantes items={problemasContactos(editando, true)} />}
              <div className="fila-acciones">
                <button type="button" className="boton-secundario" onClick={() => { setEditando(null); setIntentoContactos(false); }}>Cancelar</button>
                <button type="button" className="boton" disabled={ocupado}
                  onClick={() => { setIntentoContactos(true); if (contactosCompletos(editando, true)) { setIntentoContactos(false); guardarContactos(); } }}>Guardar contactos</button>
              </div>
            </>
          )}

          {e.contratoActual && (
            <OperadorLineas e={e} editable={e.puedeEditar || !!e.puedeCorregirDatos}
              onGuardado={(d) => { setE(d); setAviso('Operador y líneas guardados.'); }} />
          )}
        </section>

        <aside className="panel vidrio" style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2">Historial de asesores</h2>
          {e.historial === null && <p style={{ color: 'var(--texto-suave)' }}>Sin acceso al historial de esta empresa.</p>}
          {e.historial?.length === 0 && <p style={{ color: 'var(--texto-suave)' }}>Sin movimientos todavía.</p>}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {e.historial?.map((h, i) => (
              <li key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 14, borderLeft: '2px solid var(--linea)' }}>
                <b style={{ fontSize: 14 }}>{MOTIVO[h.motivo] ?? h.motivo}</b>
                <span style={{ fontSize: 14 }}>
                  {h.motivo === 'REASIGNACION' ? <>De <b>{h.asesorAnterior ?? 'repositorio'}</b> a <b>{h.asesorNuevo ?? 'repositorio'}</b></>
                    : SALIDAS.includes(h.motivo) ? <>Dejó de estar con <b>{h.asesorAnterior ?? '—'}</b></>
                    : <>A cargo de <b>{h.asesorNuevo ?? 'nadie (repositorio)'}</b></>}
                </span>
                <span style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
                  {h.hechoPor} · {fecha(h.fecha)}
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {/* Solo quien ve la información comercial ve sus negociaciones */}
      {e.contactos !== null && <NegociacionesEmpresa empresaId={e.id} puedeAbrir={e.puedeEditar && puede('NEGOCIACION_GESTIONAR')} />}
      {e.contactos !== null && (
        <GestionesEmpresa empresaId={e.id} preseleccion={preseleccion} recarga={recargaGestiones} onRegistrada={alRegistrar} />
      )}
    </>
  );
}


/** Operador actual y cantidad de líneas que tiene hoy (estructura de Ann): dicen si vale la pena llamar primero */
function OperadorLineas({ e, editable, onGuardado }: { e: EmpresaDetalle; editable: boolean; onGuardado: (d: EmpresaDetalle) => void }) {
  const c = e.contratoActual!;
  const [editando, setEditando] = useState(false);
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operadorId, setOperadorId] = useState<number | ''>(c.operadorId ?? '');
  const [lineas, setLineas] = useState(c.lineas === null ? '' : String(c.lineas));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  function abrir() {
    setOperadorId(c.operadorId ?? ''); setLineas(c.lineas === null ? '' : String(c.lineas)); setError(''); setEditando(true);
    if (!operadores.length) negociacionesApi.catalogos().then((k) => setOperadores(k.operadores)).catch(() => undefined);
  }

  async function guardar() {
    setOcupado(true); setError('');
    try {
      // La fecha de fin de contrato (si la hubiera) se conserva tal cual
      onGuardado(await empresasApi.guardarContratoActual(e.id, operadorId === '' ? null : operadorId, c.fin, lineas === '' ? null : Number(lineas)));
      setEditando(false);
    }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  }

  return (
    <>
      <div style={{ height: 1, background: 'var(--linea)' }} />
      <div className="fila-acciones">
        <h2 className="h2">Operador actual y líneas</h2>
        {editable && !editando && <button type="button" className="boton-secundario" onClick={abrir}>{c.operadorId || c.lineas !== null ? 'Editar' : 'Registrar'}</button>}
      </div>
      {!editando && (
        c.operador || c.lineas !== null ? (
          <div className="rejilla-2">
            <div className="dato"><span>Operador</span><b>{c.operador ?? 'Sin registrar'}</b></div>
            <div className="dato"><span>Cantidad de líneas</span><b>{c.lineas === null ? 'Sin registrar' : c.lineas}</b></div>
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--texto-suave)', lineHeight: 1.5 }}>¿Con qué operador está y cuántas líneas tiene hoy? Regístralo para priorizar esta empresa.</p>
        )
      )}
      {editable && <RevisarLineas ruc={e.ruc} onAbierta={() => { if (!editando) abrir(); }} />}
      {editando && (
        <div className="bloque">
          <div className="rejilla-2">
            <div className="campo">
              <label htmlFor="op-actual" className="etiqueta">Operador actual</label>
              <select id="op-actual" className="entrada" value={operadorId} onChange={(ev) => setOperadorId(ev.target.value === '' ? '' : Number(ev.target.value))}>
                <option value="">No sé</option>
                {operadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="lineas-actual" className="etiqueta">Cantidad de líneas</label>
              <input id="lineas-actual" className="entrada numeros" inputMode="numeric" maxLength={5} value={lineas} placeholder="Ej. 25"
                onChange={(ev) => setLineas(ev.target.value.replace(/\D/g, '').slice(0, 5))} />
            </div>
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => setEditando(false)}>Cancelar</button>
            <button type="button" className="boton" disabled={ocupado} onClick={guardar}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Gerencia y admin: pasar la empresa (y su negociación abierta) a otro asesor */
function Reasignar({ e, onCancelar, onHecho }: { e: EmpresaDetalle; onCancelar: () => void; onHecho: (d: EmpresaDetalle) => void }) {
  const [asesores, setAsesores] = useState<{ id: string; nombre: string; equipo: string | null }[] | null>(null);
  const [destino, setDestino] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    empresasApi.asesores().then((l) => setAsesores(l.filter((a) => a.id !== e.asesorId)))
      .catch((err) => setError(err instanceof ErrorApi ? err.message : 'No se pudo cargar la lista de asesores'));
  }, [e.asesorId]);

  async function confirmar() {
    setOcupado(true); setError('');
    try { onHecho(await empresasApi.reasignar(e.id, destino)); }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo reasignar'); setOcupado(false); }
  }

  return (
    <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 className="h2">{e.libre ? 'Asignar la empresa' : 'Reasignar la empresa'}</h2>
      <p style={{ margin: 0, color: 'var(--texto-suave)', lineHeight: 1.5 }}>
        {e.libre ? 'La empresa está libre en el repositorio.' : `Hoy la tiene ${e.asesor}.`} Si tiene una negociación abierta, pasa con la empresa al nuevo asesor.
      </p>
      <div className="campo" style={{ maxWidth: 420 }}>
        <label htmlFor="reasignar-a" className="etiqueta">Nuevo asesor</label>
        <select id="reasignar-a" className="entrada" value={destino} onChange={(ev) => setDestino(ev.target.value)} disabled={!asesores}>
          <option value="">{asesores ? 'Elige el asesor' : 'Cargando…'}</option>
          {asesores?.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.equipo ? ` · ${a.equipo}` : ''}</option>)}
        </select>
      </div>
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="boton" disabled={!destino || ocupado} onClick={confirmar}>{ocupado ? 'Guardando…' : 'Confirmar'}</button>
      </div>
    </section>
  );
}

const URL_OSIPTEL = 'https://checatuslineas.osiptel.gob.pe/';

/**
 * Consulta oficial de OSIPTEL en una ventana pequeña al costado del CRM, con el RUC ya copiado.
 * La página de OSIPTEL no se puede mostrar dentro del CRM ni recibir el RUC escrito: se pega con Ctrl+V.
 */
function RevisarLineas({ ruc, onAbierta }: { ruc: string; onAbierta: () => void }) {
  const [estado, setEstado] = useState<'' | 'abierta' | 'bloqueada'>('');

  function abrir() {
    navigator.clipboard?.writeText(ruc).catch(() => undefined);
    const ancho = 520;
    const alto = Math.min(820, window.screen.availHeight - 80);
    const izquierda = Math.max(0, window.screenX + window.outerWidth - ancho - 24);
    const v = window.open('about:blank', 'osiptel-lineas', `popup=yes,width=${ancho},height=${alto},left=${izquierda},top=${window.screenY + 60}`);
    if (!v) { setEstado('bloqueada'); return; }
    // La página de OSIPTEL no puede tocar la pestaña del CRM
    v.opener = null;
    v.location.href = URL_OSIPTEL;
    v.focus();
    setEstado('abierta');
    onAbierta();
  }

  return (
    <div className="revisar-lineas">
      <span>
        {estado === 'abierta' ? (
          <><b>RUC {ruc} copiado.</b> En la ventana de OSIPTEL elige <b>RUC</b>, pega con <kbd>Ctrl</kbd>+<kbd>V</kbd> y consulta. Luego anota aquí lo que encontraste.</>
        ) : estado === 'bloqueada' ? (
          <><b>El navegador bloqueó la ventana.</b> Permite las ventanas emergentes para este sitio o ábrela en otra pestaña. El RUC {ruc} ya está copiado.</>
        ) : (
          <><b>¿Quieres confirmar las líneas?</b> Consulta las líneas asociadas al RUC en OSIPTEL, en una ventana al costado.</>
        )}
      </span>
      <span className="revisar-lineas__acciones">
        <button type="button" className="boton" onClick={abrir}>{estado === 'abierta' ? 'Volver a abrir' : 'Revisar en OSIPTEL'}</button>
        {estado === 'bloqueada' && <a className="boton-secundario" href={URL_OSIPTEL} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña ↗</a>}
      </span>
    </div>
  );
}
