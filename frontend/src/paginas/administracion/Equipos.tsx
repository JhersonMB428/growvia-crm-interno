import { useEffect, useState } from 'react';
import { adminApi, type EquipoAdmin } from '../../api/administracion';
import { ErrorApi } from '../../api/cliente';

type Datos = { equipos: EquipoAdmin[]; supervisores: { id: string; nombre: string }[] };

/** Equipos: nombre, supervisor y quiénes lo integran (los asesores se mueven desde Usuarios) */
export function Equipos() {
  const [d, setD] = useState<Datos | null>(null);
  const [editando, setEditando] = useState<EquipoAdmin | 'nuevo' | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => { adminApi.equipos().then(setD).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar')); }, []);
  if (!d) return error ? <div className="alerta" role="alert">{error}</div> : <p className="admin-vacio">Cargando…</p>;

  return (
    <>
      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {editando && (
        <FormEquipo e={editando === 'nuevo' ? null : editando} supervisores={d.supervisores} onCancelar={() => setEditando(null)}
          onGuardado={(nd, m) => { setD(nd); setEditando(null); setAviso(m); }} />
      )}
      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="fila-acciones">
          <p className="admin-nota" style={{ margin: 0 }}>Para mover asesores de un equipo a otro, edítalos en Usuarios.</p>
          {!editando && <button type="button" className="boton" onClick={() => { setEditando('nuevo'); setAviso(''); }}>Nuevo equipo</button>}
        </div>
        <div className="admin-equipos">
          {d.equipos.map((e) => (
            <article key={e.id} className={`admin-equipo${e.activo ? '' : ' admin-equipo--inactivo'}`}>
              <div className="fila-acciones">
                <b>{e.nombre}</b>
                {e.activo ? <span className="chip chip--lima">{e.asesores} {e.asesores === 1 ? 'asesor' : 'asesores'}</span> : <span className="chip chip--gris">Desactivado</span>}
              </div>
              <span className="admin-equipo__dato">Supervisor: {e.supervisor ?? <i>sin supervisor</i>}</span>
              {e.integrantes && <span className="admin-equipo__dato">{e.integrantes}</span>}
              <button type="button" className="boton-texto" style={{ alignSelf: 'flex-start', minHeight: 0, padding: 0 }} onClick={() => { setEditando(e); setAviso(''); }}>Editar</button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function FormEquipo({ e, supervisores, onCancelar, onGuardado }: {
  e: EquipoAdmin | null; supervisores: { id: string; nombre: string }[]; onCancelar: () => void; onGuardado: (d: Datos, m: string) => void;
}) {
  const [nombre, setNombre] = useState(e?.nombre ?? '');
  const [supervisorId, setSupervisorId] = useState(e?.supervisorId ?? '');
  const [activo, setActivo] = useState(e?.activo ?? true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    setOcupado(true); setError('');
    try {
      const d = await adminApi.guardarEquipo(e?.id ?? null, { nombre, supervisorId: supervisorId || null, activo });
      onGuardado(d, e ? `Se guardó ${nombre}.` : `Se creó ${nombre}. Ahora asígnale asesores desde Usuarios.`);
    } catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  }

  return (
    <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="h2">{e ? `Editar ${e.nombre}` : 'Nuevo equipo'}</h2>
      <div className="rejilla-2">
        <div className="campo"><label htmlFor="eq-nombre" className="etiqueta">Nombre</label>
          <input id="eq-nombre" className="entrada" maxLength={60} value={nombre} onChange={(ev) => setNombre(ev.target.value)} placeholder="Ej. Equipo Norte" /></div>
        <div className="campo"><label htmlFor="eq-sup" className="etiqueta">Supervisor</label>
          <select id="eq-sup" className="entrada" value={supervisorId} disabled={!activo} onChange={(ev) => setSupervisorId(ev.target.value)}>
            <option value="">Sin supervisor</option>
            {supervisores.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select></div>
      </div>
      {e && (
        <label className="casilla"><input type="checkbox" checked={activo} onChange={(ev) => setActivo(ev.target.checked)} /> Equipo activo (para desactivarlo no debe tener asesores)</label>
      )}
      <p className="admin-nota">Un supervisor dirige un solo equipo. Si eliges a alguien que ya supervisa otro, deja ese equipo y tendrá que volver a iniciar sesión.</p>
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado || nombre.trim().length < 2} onClick={guardar}>{e ? 'Guardar' : 'Crear equipo'}</button>
      </div>
    </section>
  );
}