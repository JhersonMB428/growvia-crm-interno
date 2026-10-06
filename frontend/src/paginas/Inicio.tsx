import { useSesion } from '../sesion/SesionContext';

/** Pantalla temporal después de iniciar sesión. Luego se reemplaza por el dashboard de cada rol. */
export function Inicio() {
  const { usuario, cerrar } = useSesion();
  if (!usuario) return null;
  return (
    <div style={{ minHeight: '100vh', padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <section className="vidrio" style={{ maxWidth: 560, width: '100%', borderRadius: 28, padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <img src="/img/logo-growvia.webp" alt="Growvia" style={{ height: 32, alignSelf: 'flex-start' }} />
        <h1 style={{ fontSize: 34 }}>Hola, {usuario.nombres}</h1>
        <p style={{ color: 'var(--texto-suave)' }}>
          {usuario.rol.nombre}{usuario.equipo ? ` · ${usuario.equipo.nombre}` : ''} · {usuario.email}
        </p>
        <div>
          <p className="etiqueta" style={{ marginBottom: 8 }}>Tus permisos</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--texto-suave)', fontSize: 14, lineHeight: 1.7 }}>
            {usuario.permisos.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
        <button className="boton" onClick={cerrar} style={{ alignSelf: 'flex-start', padding: '0 22px' }}>Cerrar sesión</button>
      </section>
    </div>
  );
}
