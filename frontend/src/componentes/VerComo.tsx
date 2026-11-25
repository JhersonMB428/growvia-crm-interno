import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import { soporteApi, type UsuarioParaVer } from '../api/soporte';
import { INICIO_POR_ROL } from '../layout/menu';
import { useSesion } from '../sesion/SesionContext';

/** Perfil del soporte: elegir a quién mirar. Cada usuario ve sus propios datos, así que se elige una persona de cada rol. */
export function VerComo() {
  const { iniciar } = useSesion();
  const navegar = useNavigate();
  const [usuarios, setUsuarios] = useState<UsuarioParaVer[] | null>(null);
  const [elegido, setElegido] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    soporteApi.usuarios().then(setUsuarios).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la lista'));
  }, []);

  const porRol = useMemo(() => {
    const grupos = new Map<string, UsuarioParaVer[]>();
    for (const u of usuarios ?? []) grupos.set(u.rolNombre, [...(grupos.get(u.rolNombre) ?? []), u]);
    return [...grupos];
  }, [usuarios]);

  async function ver() {
    setOcupado(true); setError('');
    try {
      const r = await soporteApi.verComo(elegido);
      iniciar(r.token, r.usuario);
      navegar(INICIO_POR_ROL[r.usuario.rol.codigo]);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo abrir la vista');
      setOcupado(false);
    }
  }

  return (
    <section className="panel vidrio perfil-panel">
      <h2 className="h2">Ver el CRM como otro usuario</h2>
      <p className="perfil-nota" style={{ marginTop: 0 }}>
        Solo para soporte. Ves las pantallas exactamente como las ve esa persona, con sus datos, pero no puedes cambiar nada ni exportar.
        Queda registrado en la bitácora. La vista dura 2 horas.
      </p>
      <div className="fila-acciones" style={{ alignItems: 'flex-end' }}>
        <div className="campo" style={{ flex: '1 1 320px' }}>
          <label htmlFor="ver-como" className="etiqueta">Usuario</label>
          <select id="ver-como" className="entrada" value={elegido} disabled={!usuarios} onChange={(e) => setElegido(e.target.value)}>
            <option value="">{usuarios ? 'Elige a quién ver' : 'Cargando…'}</option>
            {porRol.map(([rol, lista]) => (
              <optgroup key={rol} label={rol}>
                {lista.map((u) => <option key={u.id} value={u.id}>{u.nombre}{u.equipo ? ` · ${u.equipo}` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <button type="button" className="boton" disabled={!elegido || ocupado} onClick={ver}>{ocupado ? 'Abriendo…' : 'Ver como esta persona'}</button>
      </div>
      {error && <div className="alerta" role="alert">{error}</div>}
    </section>
  );
}

/** Franja fija arriba mientras se mira como otro usuario, o con el rol que eligió la cuenta de soporte */
export function FranjaVista() {
  const { usuario, iniciar } = useSesion();
  const navegar = useNavigate();
  const [ocupado, setOcupado] = useState(false);
  if (!usuario?.vista) return null;

  async function salir() {
    setOcupado(true);
    try {
      const r = await soporteApi.salir();
      iniciar(r.token, r.usuario);
      navegar(INICIO_POR_ROL[r.usuario.rol.codigo]);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="franja-vista" role="status">
      <span>
        👁 Estás viendo el CRM como <b>{usuario.nombres} {usuario.apellidos}</b> · {usuario.rol.nombre}{usuario.equipo ? ` · ${usuario.equipo.nombre}` : ''}.
        Solo lectura.
      </span>
      <button type="button" className="boton" onClick={salir} disabled={ocupado}>{ocupado ? 'Volviendo…' : 'Volver a mi cuenta'}</button>
    </div>
  );
}
