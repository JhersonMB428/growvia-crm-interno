import { useEffect, useState, type FormEvent } from 'react';
import { accesosMovilApi, DURACIONES, ultimoDia, type AccesoMovil } from '../../api/accesosMovil';
import { ErrorApi } from '../../api/cliente';
import { perfilApi, reglasClave, type MiPerfil } from '../../api/perfil';
import { useSesion } from '../../sesion/SesionContext';
import './perfil.css';

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
const hace = (iso: string | null) => {
  if (!iso) return 'nunca';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 2) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
};

/** Mi perfil: datos, contraseña, avisos, equipos de confianza y acceso desde celular */
export function Perfil() {
  const { usuario } = useSesion();
  const [p, setP] = useState<MiPerfil | null>(null);
  const [error, setError] = useState('');
  const cargar = () => perfilApi.datos().then(setP).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar tu perfil'));
  useEffect(() => { cargar(); }, []);

  if (error && !p) return <div className="alerta" role="alert">{error}</div>;
  if (!p) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  return (
    <>
      <div className="encabezado">
        <h1>Mi perfil</h1>
        <p>Tus datos, tu contraseña y cómo te avisa el CRM.</p>
      </div>
      {usuario?.debeCambiarClave && (
        <div className="aviso" role="status"><b>Bienvenido/a.</b> Entraste con una contraseña temporal: elige una propia para empezar a usar el CRM.</div>
      )}
      <div className="perfil-rejilla">
        <div className="perfil-columna">
          <section className="panel vidrio perfil-panel">
            <h2 className="h2">Mis datos</h2>
            <div className="rejilla-2">
              <div className="dato"><span>Nombre</span><b>{p.nombres} {p.apellidos}</b></div>
              <div className="dato"><span>Correo</span><b>{p.email}</b></div>
              <div className="dato"><span>Rol</span><b>{p.rol}</b></div>
              <div className="dato"><span>Equipo</span><b>{p.equipo ?? '—'}</b></div>
              {p.supervisor && <div className="dato"><span>Supervisor</span><b>{p.supervisor}</b></div>}
              <div className="dato"><span>En el CRM desde</span><b>{fecha(p.creado)}</b></div>
            </div>
            <p className="perfil-nota">Si algún dato está mal, pídele a back office que lo corrija.</p>
          </section>
          <CambiarClave email={p.email} cambiada={p.claveCambiada} onCambio={cargar} />
        </div>
        <div className="perfil-columna">
          <Avisos p={p} />
          <Equipos p={p} onCambio={cargar} />
          <AccesoCelular />
        </div>
      </div>
    </>
  );
}

function CambiarClave({ email, cambiada, onCambio }: { email: string; cambiada: string | null; onCambio: () => void }) {
  const { iniciar } = useSesion();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const reglas = reglasClave(nueva, actual, confirmar, email);
  const lista = !!actual && reglas.every((r) => r.ok);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true); setError(''); setAviso('');
    try {
      const r = await perfilApi.cambiarClave(actual, nueva);
      iniciar(r.token, r.usuario); // esta sesión sigue con el token nuevo
      setActual(''); setNueva(''); setConfirmar('');
      setAviso('Listo, cambiaste tu contraseña. Se cerraron tus sesiones en otros equipos.');
      onCambio();
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo cambiar la contraseña');
    } finally {
      setOcupado(false);
    }
  }

  const tipo = ver ? 'text' : 'password';
  return (
    <section className="panel vidrio perfil-panel">
      <div className="fila-acciones">
        <h2 className="h2">Contraseña</h2>
        <span className="perfil-nota">{cambiada ? `Cambiada el ${fecha(cambiada)}` : 'Aún usas la contraseña inicial'}</span>
      </div>
      <form onSubmit={guardar} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="campo">
          <label htmlFor="clave-actual" className="etiqueta">Contraseña actual</label>
          <input id="clave-actual" className="entrada" type={tipo} autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
        </div>
        <div className="rejilla-2">
          <div className="campo">
            <label htmlFor="clave-nueva" className="etiqueta">Nueva contraseña</label>
            <input id="clave-nueva" className="entrada" type={tipo} autoComplete="new-password" maxLength={72} value={nueva} onChange={(e) => setNueva(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="clave-confirmar" className="etiqueta">Repítela</label>
            <input id="clave-confirmar" className="entrada" type={tipo} autoComplete="new-password" maxLength={72} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
          </div>
        </div>
        <ul className="reglas-clave" aria-label="Requisitos de la contraseña">
          {reglas.map((r) => <li key={r.texto} className={r.ok ? 'reglas-clave__ok' : ''}>{r.ok ? '✓' : '·'} {r.texto}</li>)}
        </ul>
        <label className="casilla"><input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar contraseñas</label>
        {error && <div className="alerta" role="alert">{error}</div>}
        {aviso && <div className="aviso" role="status">{aviso}</div>}
        <button type="submit" className="boton" style={{ alignSelf: 'flex-start' }} disabled={!lista || ocupado}>{ocupado ? 'Guardando…' : 'Cambiar contraseña'}</button>
      </form>
    </section>
  );
}

function Avisos({ p }: { p: MiPerfil }) {
  const [correo, setCorreo] = useState(p.avisoCorreo);
  const [minutos, setMinutos] = useState(p.minutosRecordatorio);
  const [estado, setEstado] = useState('');

  async function guardar(c: boolean, m: number) {
    setCorreo(c); setMinutos(m); setEstado('Guardando…');
    try { await perfilApi.avisos(c, m); setEstado('Guardado'); }
    catch (e) { setEstado(e instanceof ErrorApi ? e.message : 'No se pudo guardar'); }
  }

  return (
    <section className="panel vidrio perfil-panel">
      <div className="fila-acciones">
        <h2 className="h2">Avisos</h2>
        {estado && <span className="perfil-nota" role="status">{estado}</span>}
      </div>
      <div className="campo">
        <label htmlFor="minutos" className="etiqueta">Recordarme cada gestión agendada</label>
        <select id="minutos" className="entrada" value={minutos} onChange={(e) => guardar(correo, Number(e.target.value))}>
          {[[0, 'A la hora exacta'], [10, '10 minutos antes'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      <label className="casilla">
        <input type="checkbox" checked={correo} onChange={(e) => guardar(e.target.checked, minutos)} />
        Enviarme por correo el resumen de gestiones del día
      </label>
    </section>
  );
}

function Equipos({ p, onCambio }: { p: MiPerfil; onCambio: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function ejecutar(accion: () => Promise<unknown>) {
    setOcupado(true); setError('');
    try { await accion(); onCambio(); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo quitar'); }
    finally { setOcupado(false); }
  }

  return (
    <section className="panel vidrio perfil-panel">
      <div className="fila-acciones">
        <h2 className="h2">Equipos de confianza</h2>
        {p.dispositivos.length > 1 && (
          <button type="button" className="boton-texto" style={{ minHeight: 0, padding: 0 }} disabled={ocupado}
            onClick={() => window.confirm('Todos tus equipos volverán a pedir el código del correo. ¿Continuar?') && ejecutar(perfilApi.quitarTodos)}>Quitar todos</button>
        )}
      </div>
      <p className="perfil-nota" style={{ marginTop: -6 }}>Entran sin pedir el código del correo durante {p.diasConfianza} días. Quita los que no reconozcas.</p>
      {p.dispositivos.length === 0 && <p className="perfil-vacio">No tienes equipos de confianza. Al ingresar, marca "Recordar este equipo".</p>}
      <ul className="perfil-equipos">
        {p.dispositivos.map((d) => (
          <li key={d.id}>
            <span className="perfil-equipos__info">
              <b>{d.nombre}{d.actual && <span className="chip chip--lima" style={{ marginLeft: 8 }}>Este equipo</span>}</b>
              <span>Último uso {hace(d.ultimoUso)} · vence el {fecha(d.expira)}</span>
            </span>
            <button type="button" className="boton-secundario perfil-equipos__quitar" disabled={ocupado} onClick={() => ejecutar(() => perfilApi.quitarDispositivo(d.id))}>Quitar</button>
          </li>
        ))}
      </ul>
      {error && <div className="alerta" role="alert">{error}</div>}
    </section>
  );
}

function AccesoCelular() {
  const [estado, setEstado] = useState<{ vigente: AccesoMovil | null; pendiente: AccesoMovil | null } | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState(7);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const cargar = () => accesosMovilApi.mio().then(setEstado).catch(() => undefined);
  useEffect(() => { cargar(); }, []);
  if (!estado) return null;

  async function pedir() {
    setOcupado(true); setError('');
    try { await accesosMovilApi.solicitar(motivo, dias); setPidiendo(false); setMotivo(''); cargar(); }
    catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar'); }
    finally { setOcupado(false); }
  }

  // Con acceso vigente se puede pedir la renovación en los últimos 3 días
  const puedePedir = !estado.pendiente && (!estado.vigente || new Date(estado.vigente.hasta!).getTime() - Date.now() <= 3 * 86400_000);
  return (
    <section className="panel vidrio perfil-panel">
      <h2 className="h2">Acceso desde celular</h2>
      {estado.vigente
        ? <div className="aviso" role="status">Puedes usar el CRM en tu celular hasta el <b>{ultimoDia(estado.vigente.hasta!)}</b>.</div>
        : <p className="perfil-vacio">Por seguridad, el CRM solo se usa en la computadora. Gerencia puede darte acceso desde el celular por unos días.</p>}
      {estado.pendiente && <div className="aviso" role="status">Tu solicitud de {estado.pendiente.diasSolicitados} días está pendiente. Te avisaremos cuando gerencia la revise.</div>}
      {puedePedir && !pidiendo && (
        <button type="button" className="boton-secundario" style={{ alignSelf: 'flex-start' }} onClick={() => setPidiendo(true)}>{estado.vigente ? 'Pedir renovación' : 'Pedir acceso'}</button>
      )}
      {pidiendo && (
        <div className="bloque">
          <div className="campo">
            <label htmlFor="motivo-cel" className="etiqueta">¿Para qué lo necesitas?</label>
            <input id="motivo-cel" className="entrada" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Visitas a clientes esta semana" />
          </div>
          <div className="campo">
            <label htmlFor="dias-cel" className="etiqueta">¿Por cuántos días?</label>
            <select id="dias-cel" className="entrada" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {DURACIONES.map((d) => <option key={d} value={d}>{d} {d === 1 ? 'día' : 'días'}</option>)}
            </select>
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="boton-secundario" onClick={() => setPidiendo(false)}>Cancelar</button>
            <button type="button" className="boton" disabled={ocupado || motivo.trim().length < 5} onClick={pedir}>Enviar a gerencia</button>
          </div>
        </div>
      )}
    </section>
  );
}