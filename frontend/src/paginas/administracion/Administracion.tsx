import { useCallback, useEffect, useState } from 'react';
import { adminApi, type CatalogosAdmin, type CodigoRol, type DatosUsuario, type UsuarioAdmin } from '../../api/administracion';
import { ErrorApi } from '../../api/cliente';
import { Avatar } from '../../componentes/Avatar';
import { useSesion } from '../../sesion/SesionContext';
import { Equipos } from './Equipos';
import { Parametros, PlanesOperadores } from './Sistema';
import './administracion.css';

type Pestana = 'usuarios' | 'equipos' | 'planes' | 'parametros';

/** Administración: usuarios y equipos (back office y admin); planes, operadores y parámetros (solo admin) */
export function Administracion() {
  const { puede } = useSesion();
  const pestanas = ([
    ['usuarios', 'Usuarios', 'USUARIO_CREAR'], ['equipos', 'Equipos', 'USUARIO_CREAR'],
    ['planes', 'Planes y operadores', 'SISTEMA_CONFIGURAR'], ['parametros', 'Parámetros', 'SISTEMA_CONFIGURAR'],
  ] as [Pestana, string, string][]).filter(([, , permiso]) => puede(permiso));
  const [pestana, setPestana] = useState<Pestana>(pestanas[0]?.[0] ?? 'usuarios');

  return (
    <>
      <div className="encabezado">
        <h1>Administración</h1>
        <p>{puede('SISTEMA_CONFIGURAR') ? 'Usuarios, equipos, planes y parámetros del CRM.' : 'Crea y administra a los asesores y supervisores, y arma los equipos.'}</p>
      </div>
      {pestanas.length > 1 && (
        <div className="pestanas" role="tablist" aria-label="Secciones" style={{ alignSelf: 'flex-start' }}>
          {pestanas.map(([p, t]) => (
            <button key={p} type="button" role="tab" aria-selected={pestana === p} className={`pestana${pestana === p ? ' pestana--activa' : ''}`} onClick={() => setPestana(p)}>{t}</button>
          ))}
        </div>
      )}
      {pestana === 'usuarios' && <Usuarios />}
      {pestana === 'equipos' && <Equipos />}
      {pestana === 'planes' && <PlanesOperadores />}
      {pestana === 'parametros' && <Parametros />}
    </>
  );
}

const hace = (iso: string | null) => {
  if (!iso) return 'Nunca';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return dias === 0 ? 'Hoy' : dias === 1 ? 'Ayer' : `Hace ${dias} días`;
};

/** Muestra la contraseña temporal una sola vez, con botón para copiarla */
export function ClaveTemporal({ nombre, clave, onCerrar }: { nombre: string; clave: string; onCerrar: () => void }) {
  const [copiada, setCopiada] = useState(false);
  return (
    <div className="aviso clave-temporal" role="status">
      <div>
        <b>Contraseña temporal de {nombre}:</b> <code>{clave}</code>
        <span className="clave-temporal__nota">También se envió a su correo. Se muestra solo esta vez: al entrar, el CRM le pedirá elegir una propia.</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="boton-secundario" onClick={() => navigator.clipboard?.writeText(clave).then(() => setCopiada(true))}>{copiada ? 'Copiada' : 'Copiar'}</button>
        <button type="button" className="boton-texto" onClick={onCerrar}>Listo</button>
      </div>
    </div>
  );
}

function Usuarios() {
  const [cat, setCat] = useState<CatalogosAdmin | null>(null);
  const [filas, setFilas] = useState<UsuarioAdmin[] | null>(null);
  const [f, setF] = useState({ q: '', rol: '', equipoId: '', estado: 'activos' });
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [clave, setClave] = useState<{ nombre: string; clave: string } | null>(null);
  const [form, setForm] = useState<UsuarioAdmin | 'nuevo' | null>(null);
  const [baja, setBaja] = useState<UsuarioAdmin | null>(null);

  useEffect(() => { adminApi.catalogos().then(setCat).catch(() => undefined); }, []);
  const cargar = useCallback(() => {
    adminApi.usuarios(f).then((r) => { setFilas(r); setError(''); }).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar'));
  }, [f]);
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  function hecho(mensaje: string) { setAviso(mensaje); setForm(null); setBaja(null); cargar(); adminApi.catalogos().then(setCat).catch(() => undefined); }

  async function restablecer(u: UsuarioAdmin) {
    if (!window.confirm(`¿Restablecer la contraseña de ${u.nombres}? Se cerrarán sus sesiones abiertas.`)) return;
    try { const r = await adminApi.restablecer(u.id); setAviso(''); setClave({ nombre: `${u.nombres} ${u.apellidos}`, clave: r.claveTemporal }); cargar(); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo restablecer'); }
  }
  async function quitarFoto(u: UsuarioAdmin) {
    if (!window.confirm(`¿Quitar la foto de ${u.nombres}? Volverán a mostrarse sus iniciales.`)) return;
    try { await adminApi.quitarFoto(u.id); hecho(`Se quitó la foto de ${u.nombres} ${u.apellidos}.`); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo quitar la foto'); }
  }
  async function reactivar(u: UsuarioAdmin) {
    try { await adminApi.reactivar(u.id); hecho(`${u.nombres} ${u.apellidos} está activo otra vez. Restablécele la contraseña si no la recuerda.`); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo reactivar'); }
  }

  return (
    <>
      {aviso && <div className="aviso" role="status">{aviso}</div>}
      {clave && <ClaveTemporal nombre={clave.nombre} clave={clave.clave} onCerrar={() => setClave(null)} />}
      {form && cat && (
        <FormUsuario u={form === 'nuevo' ? null : form} cat={cat} onCancelar={() => setForm(null)}
          onCreado={(nombre, c) => { setForm(null); setAviso(''); setClave({ nombre, clave: c }); cargar(); }} onHecho={hecho} />
      )}
      {baja && cat && <Desactivar u={baja} cat={cat} onCancelar={() => setBaja(null)} onHecho={hecho} />}

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="admin-filtros">
          <div className="campo" style={{ flex: '2 1 220px' }}>
            <label htmlFor="u-buscar" className="etiqueta">Buscar</label>
            <input id="u-buscar" className="entrada" placeholder="Nombre o correo" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          </div>
          <div className="campo">
            <label htmlFor="u-rol" className="etiqueta">Rol</label>
            <select id="u-rol" className="entrada" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
              <option value="">Todos</option>
              {(['ASESOR', 'SUPERVISOR', 'GERENTE', 'BACKOFFICE', 'ADMIN'] as CodigoRol[]).map((r) => <option key={r} value={r}>{TEXTO_ROL[r]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="u-equipo" className="etiqueta">Equipo</label>
            <select id="u-equipo" className="entrada" value={f.equipoId} onChange={(e) => setF({ ...f, equipoId: e.target.value })}>
              <option value="">Todos</option>
              {cat?.equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="u-estado" className="etiqueta">Estado</label>
            <select id="u-estado" className="entrada" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>
              <option value="activos">Activos</option><option value="inactivos">Desactivados</option><option value="todos">Todos</option>
            </select>
          </div>
          {!form && <button type="button" className="boton" onClick={() => { setForm('nuevo'); setAviso(''); }}>Nuevo usuario</button>}
        </div>

        {error && <div className="alerta" role="alert">{error}</div>}
        {!filas && !error && <p className="admin-vacio">Cargando…</p>}
        {filas?.length === 0 && <p className="admin-vacio">No hay usuarios con estos filtros.</p>}
        {filas && filas.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla admin-tabla">
              <thead><tr><th>Usuario</th><th>Rol</th><th>Equipo</th><th className="num">Empresas</th><th>Último ingreso</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
              <tbody>
                {filas.map((u) => (
                  <tr key={u.id} className={u.activo ? '' : 'admin-tabla__inactivo'}>
                    <td>
                      <span className="admin-usuario">
                        <Avatar id={u.id} version={u.fotoVersion} nombres={u.nombres} apellidos={u.apellidos} tam={34} />
                        <span><b>{u.nombres} {u.apellidos}</b>{u.soyYo && <span className="tenue"> (tú)</span>}<span className="tenue admin-tabla__correo">{u.email}</span></span>
                      </span>
                    </td>
                    <td>{u.rolNombre}</td>
                    <td>{u.equipo ?? <span className="tenue">—</span>}{u.esSupervisorDelEquipo && <span className="tenue admin-tabla__correo">Supervisa</span>}</td>
                    <td className="num">{u.empresas || <span className="tenue">—</span>}</td>
                    <td>{hace(u.ultimoIngreso)}</td>
                    <td>
                      {!u.activo ? <span className="chip chip--gris">Desactivado</span>
                        : u.claveTemporal ? <span className="chip chip--crema">Clave temporal</span> : <span className="chip chip--lima">Activo</span>}
                    </td>
                    <td className="admin-tabla__acciones">
                      {u.editable && u.activo && (
                        <>
                          <button type="button" className="boton-texto" onClick={() => { setForm(u); setAviso(''); }}>Editar</button>
                          <button type="button" className="boton-texto" onClick={() => restablecer(u)}>Restablecer clave</button>
                          {!u.soyYo && u.fotoVersion && <button type="button" className="boton-texto" onClick={() => quitarFoto(u)}>Quitar foto</button>}
                          {!u.soyYo && <button type="button" className="boton-texto admin-peligro" onClick={() => { setBaja(u); setAviso(''); }}>Desactivar</button>}
                        </>
                      )}
                      {u.editable && !u.activo && <button type="button" className="boton-texto" onClick={() => reactivar(u)}>Reactivar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export const TEXTO_ROL: Record<CodigoRol, string> = {
  ASESOR: 'Asesor', SUPERVISOR: 'Supervisor', GERENTE: 'Gerente de ventas', BACKOFFICE: 'Back office', ADMIN: 'Administrador',
};

function FormUsuario({ u, cat, onCancelar, onCreado, onHecho }: {
  u: UsuarioAdmin | null; cat: CatalogosAdmin; onCancelar: () => void; onCreado: (nombre: string, clave: string) => void; onHecho: (m: string) => void;
}) {
  const [d, setD] = useState<DatosUsuario>({
    nombres: u?.nombres ?? '', apellidos: u?.apellidos ?? '', email: u?.email ?? '', rol: u?.rol ?? 'ASESOR', equipoId: u?.equipoId ?? null,
  });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const usaEquipo = d.rol === 'ASESOR' || d.rol === 'SUPERVISOR';
  const equipoOcupado = d.rol === 'SUPERVISOR' && d.equipoId
    ? cat.equipos.find((e) => e.id === d.equipoId && e.supervisorId && e.supervisorId !== u?.id) : undefined;

  async function guardar() {
    setOcupado(true); setError('');
    const datos = { ...d, equipoId: usaEquipo ? d.equipoId : null };
    try {
      if (u) {
        const r = await adminApi.editar(u.id, datos);
        onHecho(`Se guardaron los datos de ${d.nombres} ${d.apellidos}.${r.debeVolverAEntrar ? ' Como cambió su rol o equipo, deberá volver a iniciar sesión.' : ''}`);
      } else {
        const r = await adminApi.crear(datos);
        onCreado(`${d.nombres} ${d.apellidos}`, r.claveTemporal);
      }
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  }

  const listo = d.nombres.trim().length >= 2 && d.apellidos.trim().length >= 2 && /\S+@\S+\.\S+/.test(d.email) && (d.rol !== 'ASESOR' || !!d.equipoId);
  return (
    <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="h2">{u ? `Editar a ${u.nombres} ${u.apellidos}` : 'Nuevo usuario'}</h2>
      <div className="rejilla-2">
        <div className="campo"><label htmlFor="f-nombres" className="etiqueta">Nombres</label>
          <input id="f-nombres" className="entrada" maxLength={80} value={d.nombres} onChange={(e) => setD({ ...d, nombres: e.target.value })} /></div>
        <div className="campo"><label htmlFor="f-apellidos" className="etiqueta">Apellidos</label>
          <input id="f-apellidos" className="entrada" maxLength={80} value={d.apellidos} onChange={(e) => setD({ ...d, apellidos: e.target.value })} /></div>
        <div className="campo"><label htmlFor="f-email" className="etiqueta">Correo corporativo</label>
          <input id="f-email" className="entrada" type="email" maxLength={150} placeholder="nombre@growvia.global" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></div>
        <div className="campo"><label htmlFor="f-rol" className="etiqueta">Rol</label>
          <select id="f-rol" className="entrada" value={d.rol} disabled={u?.soyYo} onChange={(e) => setD({ ...d, rol: e.target.value as CodigoRol })}>
            {cat.roles.map((r) => <option key={r.codigo} value={r.codigo}>{r.nombre}</option>)}
          </select></div>
        {usaEquipo && (
          <div className="campo"><label htmlFor="f-equipo" className="etiqueta">{d.rol === 'SUPERVISOR' ? 'Equipo que supervisa (opcional)' : 'Equipo'}</label>
            <select id="f-equipo" className="entrada" value={d.equipoId ?? ''} onChange={(e) => setD({ ...d, equipoId: e.target.value || null })}>
              <option value="">{d.rol === 'SUPERVISOR' ? 'Sin equipo por ahora' : 'Elige…'}</option>
              {cat.equipos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select></div>
        )}
      </div>
      {equipoOcupado && <p className="admin-nota">Ese equipo ya tiene supervisor: al guardar, el anterior quedará sin equipo.</p>}
      {!u && <p className="admin-nota">Se le enviará una contraseña temporal a su correo. Al entrar por primera vez, el CRM le pedirá elegir una propia.</p>}
      {u && <p className="admin-nota">Si cambias su rol o equipo, tendrá que volver a iniciar sesión.</p>}
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado || !listo} onClick={guardar}>{u ? 'Guardar cambios' : 'Crear usuario'}</button>
      </div>
    </section>
  );
}

function Desactivar({ u, cat, onCancelar, onHecho }: { u: UsuarioAdmin; cat: CatalogosAdmin; onCancelar: () => void; onHecho: (m: string) => void }) {
  const [destino, setDestino] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const opciones = cat.cartera.filter((c) => c.id !== u.id);

  async function confirmar() {
    setOcupado(true); setError('');
    try {
      const r = await adminApi.desactivar(u.id, destino || undefined);
      const quien = destino === 'repositorio' ? 'volvieron al repositorio' : `pasaron a ${opciones.find((o) => o.id === destino)?.nombre}`;
      onHecho(`${u.nombres} ${u.apellidos} quedó desactivado y su sesión se cerró.${r.empresas ? ` Sus ${r.empresas} empresas ${quien}.` : ''}${r.negociaciones ? ` Negociaciones movidas o cerradas: ${r.negociaciones}.` : ''}`);
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo desactivar'); }
    finally { setOcupado(false); }
  }

  return (
    <section className="panel vidrio admin-baja" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 className="h2">Desactivar a {u.nombres} {u.apellidos}</h2>
      <p className="admin-vacio">Ya no podrá entrar al CRM y su sesión se cerrará de inmediato. Su historial (gestiones, ventas, bitácora) se conserva.</p>
      {u.empresas > 0 && (
        <div className="campo">
          <label htmlFor="baja-destino" className="etiqueta">¿Qué pasa con sus {u.empresas} empresas?</label>
          <select id="baja-destino" className="entrada" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Elige…</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>Pasan a {o.nombre}{o.equipo ? ` · ${o.equipo}` : ''}</option>)}
            <option value="repositorio">Vuelven al repositorio (sus negociaciones abiertas se cierran)</option>
          </select>
        </div>
      )}
      {destino && destino !== 'repositorio' && <p className="admin-nota">Sus negociaciones abiertas y ventas observadas también pasan a esa persona.</p>}
      {error && <div className="alerta" role="alert">{error}</div>}
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="boton" disabled={ocupado || (u.empresas > 0 && !destino)} onClick={confirmar}>Desactivar</button>
      </div>
    </section>
  );
}