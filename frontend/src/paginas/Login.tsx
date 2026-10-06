import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import { PantallaAcceso } from '../componentes/PantallaAcceso';
import { huellaDelEquipo } from '../sesion/huella';
import { useSesion } from '../sesion/SesionContext';
import type { RespuestaLogin } from '../sesion/tipos';

export function Login() {
  const { usuario, iniciar } = useSesion();
  const navegar = useNavigate();
  const desde = (useLocation().state as { desde?: string } | null)?.desde ?? '/inicio';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/inicio" replace />;

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
      setError(err instanceof ErrorApi ? err.message : 'Ocurrió un error inesperado');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <PantallaAcceso>
      <section aria-labelledby="titulo-login" className="tarjeta-acceso vidrio">
        <div>
          <h2 id="titulo-login">Iniciar sesión</h2>
          <p className="subtitulo">Ingresa con tu correo corporativo</p>
        </div>
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
