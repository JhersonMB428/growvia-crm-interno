import { useEffect, useState } from 'react';
import { adminApi, TEXTO_PARAMETRO, type Operador, type Parametro, type Plan } from '../../api/administracion';
import { ErrorApi } from '../../api/cliente';
import { soles } from '../../api/negociaciones';

type Catalogo = { planes: Plan[]; operadores: Operador[] };

/** Planes que se pueden negociar y operadores de origen de las portabilidades */
export function PlanesOperadores() {
  const [c, setC] = useState<Catalogo | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { adminApi.catalogo().then(setC).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar')); }, []);
  if (!c) return error ? <div className="alerta" role="alert">{error}</div> : <p className="admin-vacio">Cargando…</p>;

  return (
    <div className="admin-dos">
      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2">Planes</h2>
        <p className="admin-nota" style={{ margin: 0 }}>El cargo fijo es referencial: el asesor puede ajustarlo en cada negociación. Un plan desactivado ya no se ofrece, pero las ventas anteriores lo conservan.</p>
        {c.planes.map((p) => <FilaPlan key={p.id} p={p} onGuardado={setC} />)}
        <FilaPlan p={null} onGuardado={setC} />
      </section>
      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2">Operadores</h2>
        <p className="admin-nota" style={{ margin: 0 }}>De qué operador viene el cliente en las portabilidades.</p>
        {c.operadores.map((o) => <FilaOperador key={o.id} o={o} onGuardado={setC} />)}
        <FilaOperador o={null} onGuardado={setC} />
      </section>
    </div>
  );
}

function FilaPlan({ p, onGuardado }: { p: Plan | null; onGuardado: (c: Catalogo) => void }) {
  const [editando, setEditando] = useState(false);
  const [tipo, setTipo] = useState<'MOVIL' | 'FIJA'>(p?.tipo ?? 'MOVIL');
  const [nombre, setNombre] = useState(p?.nombre ?? '');
  const [cargo, setCargo] = useState(p ? String(p.cargoRef) : '');
  const [error, setError] = useState('');

  async function guardar(activo = p?.activo ?? true) {
    setError('');
    try {
      onGuardado(await adminApi.guardarPlan(p?.id ?? null, { tipo, nombre, cargoRef: Number(cargo), activo }));
      setEditando(false);
      if (!p) { setNombre(''); setCargo(''); }
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar'); }
  }

  if (p && !editando) {
    return (
      <div className={`admin-item${p.activo ? '' : ' admin-item--inactivo'}`}>
        <span className="admin-item__info"><b>{p.nombre}</b><span>{p.tipo === 'MOVIL' ? 'Móvil' : 'Fija'} · {soles(p.cargoRef)} ref. · usado en {p.usos} {p.usos === 1 ? 'venta' : 'ventas'}</span></span>
        {!p.activo && <span className="chip chip--gris">Desactivado</span>}
        <button type="button" className="boton-texto" onClick={() => setEditando(true)}>Editar</button>
        <button type="button" className="boton-texto" onClick={() => guardar(!p.activo)}>{p.activo ? 'Desactivar' : 'Activar'}</button>
      </div>
    );
  }
  if (!p && !editando) return <button type="button" className="boton-secundario" style={{ alignSelf: 'flex-start' }} onClick={() => setEditando(true)}>Agregar plan</button>;
  return (
    <div className="bloque" style={{ gap: 10 }}>
      <div className="admin-form-linea">
        <div className="campo"><label className="etiqueta" htmlFor={`pt-${p?.id ?? 'n'}`}>Tipo</label>
          <select id={`pt-${p?.id ?? 'n'}`} className="entrada" value={tipo} disabled={!!p} onChange={(e) => setTipo(e.target.value as 'MOVIL' | 'FIJA')}>
            <option value="MOVIL">Móvil</option><option value="FIJA">Fija</option>
          </select></div>
        <div className="campo" style={{ flex: '2 1 160px' }}><label className="etiqueta" htmlFor={`pn-${p?.id ?? 'n'}`}>Nombre</label>
          <input id={`pn-${p?.id ?? 'n'}`} className="entrada" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
        <div className="campo"><label className="etiqueta" htmlFor={`pc-${p?.id ?? 'n'}`}>Cargo fijo ref. (S/)</label>
          <input id={`pc-${p?.id ?? 'n'}`} className="entrada" inputMode="decimal" value={cargo} onChange={(e) => setCargo(e.target.value.replace(',', '.'))} /></div>
      </div>
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={() => setEditando(false)}>Cancelar</button>
        <button type="button" className="boton" disabled={nombre.trim().length < 2 || !(Number(cargo) >= 0) || cargo === ''} onClick={() => guardar()}>Guardar</button>
      </div>
    </div>
  );
}

function FilaOperador({ o, onGuardado }: { o: Operador | null; onGuardado: (c: Catalogo) => void }) {
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(o?.nombre ?? '');
  const [error, setError] = useState('');

  async function guardar(activo = o?.activo ?? true) {
    setError('');
    try { onGuardado(await adminApi.guardarOperador(o?.id ?? null, { nombre, activo })); setEditando(false); if (!o) setNombre(''); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar'); }
  }

  if (o && !editando) {
    return (
      <div className={`admin-item${o.activo ? '' : ' admin-item--inactivo'}`}>
        <span className="admin-item__info"><b>{o.nombre}</b><span>Usado en {o.usos} {o.usos === 1 ? 'línea' : 'líneas'}</span></span>
        {!o.activo && <span className="chip chip--gris">Desactivado</span>}
        <button type="button" className="boton-texto" onClick={() => setEditando(true)}>Editar</button>
        <button type="button" className="boton-texto" onClick={() => guardar(!o.activo)}>{o.activo ? 'Desactivar' : 'Activar'}</button>
      </div>
    );
  }
  if (!o && !editando) return <button type="button" className="boton-secundario" style={{ alignSelf: 'flex-start' }} onClick={() => setEditando(true)}>Agregar operador</button>;
  return (
    <div className="bloque" style={{ gap: 10 }}>
      <div className="campo"><label className="etiqueta" htmlFor={`on-${o?.id ?? 'n'}`}>Nombre del operador</label>
        <input id={`on-${o?.id ?? 'n'}`} className="entrada" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={() => setEditando(false)}>Cancelar</button>
        <button type="button" className="boton" disabled={nombre.trim().length < 2} onClick={() => guardar()}>Guardar</button>
      </div>
    </div>
  );
}

/** Reglas del CRM que se pueden ajustar sin tocar código */
export function Parametros() {
  const [ps, setPs] = useState<Parametro[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { adminApi.parametros().then(setPs).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar')); }, []);
  if (!ps) return error ? <div className="alerta" role="alert">{error}</div> : <p className="admin-vacio">Cargando…</p>;

  return (
    <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="admin-nota" style={{ margin: 0 }}>Los cambios se aplican al momento y quedan en la bitácora.</p>
      {ps.map((p) => <FilaParametro key={p.clave} p={p} onGuardado={setPs} />)}
    </section>
  );
}

function FilaParametro({ p, onGuardado }: { p: Parametro; onGuardado: (ps: Parametro[]) => void }) {
  const [valor, setValor] = useState(p.valor);
  const [estado, setEstado] = useState('');
  const cambiado = valor !== p.valor;

  async function guardar() {
    setEstado('');
    try { onGuardado(await adminApi.guardarParametro(p.clave, valor)); setEstado('Guardado'); }
    catch (e) { setEstado(e instanceof ErrorApi ? e.message : 'No se pudo guardar'); }
  }

  return (
    <div className={`admin-parametro${p.editable ? '' : ' admin-item--inactivo'}`}>
      <span className="admin-item__info">
        <b>{TEXTO_PARAMETRO[p.clave] ?? p.clave}</b>
        <span>{p.descripcion}{p.minimo !== null ? ` · entre ${p.minimo} y ${p.maximo}` : ''}{p.actualizadoPor ? ` · cambió ${p.actualizadoPor}` : ''}</span>
        {estado && <span className={estado === 'Guardado' ? 'admin-ok' : 'admin-error'} role="status">{estado}</span>}
      </span>
      <input className="entrada admin-parametro__valor" aria-label={TEXTO_PARAMETRO[p.clave] ?? p.clave} disabled={!p.editable}
        type={p.tipo === 'hora' ? 'time' : 'number'} min={p.minimo ?? undefined} max={p.maximo ?? undefined}
        value={valor} onChange={(e) => { setValor(e.target.value); setEstado(''); }} />
      {p.editable ? <button type="button" className="boton-secundario" disabled={!cambiado} onClick={guardar}>Guardar</button> : <span className="chip chip--gris">Fijo</span>}
    </div>
  );
}