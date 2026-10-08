import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { accesosMovilApi, DURACIONES } from '../api/accesosMovil';
import { api, CLAVE_SALIDA, ErrorApi } from '../api/cliente';
import { PantallaAcceso } from '../componentes/PantallaAcceso';
import { huellaDelEquipo } from '../sesion/huella';
import { useSesion } from '../sesion/SesionContext';
import type { RespuestaLogin } from '../sesion/tipos';

/** El celular está bloqueado: el login devolvió un permiso temporal para pedir acceso a gerencia */
interface Bloqueo { permiso: string; pendienteDesde: string | null }

export function Login() {
  const { usuario, iniciar } = useSesion();
  const navegar = useNavigate();
  const desde = (useLocation().state as { desde?: string } | null)?.desde ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [bloqueo, setBloqueo] = useState<Bloqueo | null>(null);
  // Por qué se cerró la sesión anterior (venció, se retiró el acceso del celular...)
  const [salida] = useState(() => sessionStorage.getItem(CLAVE_SALIDA));
  useEffect(() => { sessionStorage.removeItem(CLAVE_SALIDA); }, []);

  if (usuario) return <Navigate to="/" replace />;

  async function ingresar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await api<RespuestaLogin>('/auth/login', {
        metodo: 'POST',
        cuerpo: { email, password, huella: huellaDelEquipo() },
      });
      if (r.requiereCodigo) {
        navegar('/verificar', { state: { desafio: r.desafio, correo: r.correo, desde } });
      } else {
        iniciar(r.token, r.usuario);
        navegar(desde, { replace: true });
      }
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'MOVIL_BLOQUEADO' && typeof err.datos?.permiso === 'string') {
        setBloqueo({ permiso: err.datos.permiso, pendienteDesde: (err.datos.pendienteDesde as string | null) ?? null });
      } else {
        setError(err instanceof ErrorApi ? err.message : 'Ocurrió un error inesperado');
      }
    } finally {
      setEnviando(false);
    }
  }

  if (bloqueo) return <PantallaAcceso><SolicitudCelular bloqueo={bloqueo} onVolver={() => { setBloqueo(null); setPassword(''); }} /></PantallaAcceso>;

  return (
    <PantallaAcceso>
      <section aria-labelledby="titulo-login" className="tarjeta-acceso vidrio">
        <div>
          <h2 id="titulo-login">Iniciar sesión</h2>
          <p className="subtitulo">Ingresa con tu correo corporativo</p>
        </div>
        {salida && <div className="alerta" role="alert">{salida}</div>}
        <form onSubmit={ingresar} noValidate>
          <div className="campo">
            <label htmlFor="correo" className="etiqueta">Correo</label>
            <input id="correo" className="entrada" type="email" autoComplete="username" placeholder="nombre@growvia.global"
              value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={!!error} />
          </div>
          <div className="campo">
            <label htmlFor="clave" className="etiqueta">Contraseña</label>
            <div style={{ position: 'relative' }}>
              <input id="clave" className="entrada" type={verClave ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required aria-invalid={!!error}
                style={{ paddingRight: 56 }} />
              <button type="button" className="boton-texto" onClick={() => setVerClave(!verClave)}
                aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                style={{ position: 'absolute', top: 4, right: 4, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
                  {verClave && <path d="M3 3l18 18" />}
                </svg>
              </button>
            </div>
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          <button type="submit" className="boton" disabled={enviando || !email || !password}>
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.72)' }}>
          ¿No tienes acceso? Solicítalo a tu supervisor.
        </p>
      </section>
    </PantallaAcceso>
  );
}

/** En el celular sin acceso: pedirlo a gerencia ahí mismo */
function SolicitudCelular({ bloqueo, onVolver }: { bloqueo: Bloqueo; onVolver: () => void }) {
  const [motivo, setMotivo] = useState('');
  const [dias, setDias] = useState(7);
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);
  const [error, setError] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true); setError('');
    try { await accesosMovilApi.solicitarDesdeCelular(bloqueo.permiso, motivo, dias); setEnviada(true); }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar la solicitud'); }
    finally { setEnviando(false); }
  }

  const pendiente = enviada || !!bloqueo.pendienteDesde;
  return (
    <section aria-labelledby="titulo-celular" className="tarjeta-acceso vidrio">
      <div>
        <h2 id="titulo-celular">Acceso desde el celular</h2>
        <p className="subtitulo">Por seguridad, el CRM solo se usa en la computadora. Gerencia puede darte acceso desde el celular por unos días.</p>
      </div>
      {pendiente ? (
        <div className="aviso" role="status">
          {enviada
            ? 'Listo, enviamos tu solicitud. Gerencia te avisará por correo cuando la revise.'
            : `Ya enviaste una solicitud el ${new Date(bloqueo.pendienteDesde!).toLocaleDateString('es-PE', { day: 'numeric', month: 'long' })}. Gerencia te avisará por correo cuando la revise.`}
        </div>
      ) : (
        <form onSubmit={enviar} noValidate>
          <div className="campo">
            <label htmlFor="motivo-celular" className="etiqueta">¿Para qué lo necesitas?</label>
            <textarea id="motivo-celular" className="entrada" rows={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Esta semana tengo visitas a clientes en campo" style={{ height: 'auto', padding: '12px 16px', font: 'inherit' }} />
          </div>
          <div className="campo">
            <label htmlFor="dias-celular" className="etiqueta">¿Por cuántos días?</label>
            <select id="dias-celular" className="entrada" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {DURACIONES.map((d) => <option key={d} value={d}>{d} {d === 1 ? 'día' : 'días'}</option>)}
            </select>
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          <button type="submit" className="boton" disabled={enviando || motivo.trim().length < 5}>{enviando ? 'Enviando…' : 'Pedir acceso a gerencia'}</button>
        </form>
      )}
      <button type="button" className="boton-texto" onClick={onVolver} style={{ alignSelf: 'center' }}>← Volver al inicio de sesión</button>
    </section>
  );
}