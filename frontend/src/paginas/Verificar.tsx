import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ErrorApi } from '../api/cliente';
import { PantallaAcceso } from '../componentes/PantallaAcceso';
import { huellaDelEquipo } from '../sesion/huella';
import { useSesion } from '../sesion/SesionContext';
import type { Usuario } from '../sesion/tipos';

interface Estado { desafio: string; correo: string; desde?: string }

export function Verificar() {
  const estado = useLocation().state as Estado | null;
  const { iniciar } = useSesion();
  const navegar = useNavigate();

  const [codigo, setCodigo] = useState('');
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(60);

  // Cuenta regresiva para poder pedir otro código
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // Si alguien entra directo a /verificar sin pasar por el login
  if (!estado?.desafio) return <Navigate to="/login" replace />;

  async function verificar(e: FormEvent) {
    e.preventDefault();
    setError(''); setAviso('');
    setEnviando(true);
    try {
      const r = await api<{ token: string; usuario: Usuario }>('/auth/verificar', {
        metodo: 'POST',
        cuerpo: { desafio: estado!.desafio, codigo, recordar, huella: huellaDelEquipo() },
      });
      iniciar(r.token, r.usuario);
      navegar(estado!.desde ?? '/inicio', { replace: true });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'Ocurrió un error inesperado');
      setCodigo('');
    } finally {
      setEnviando(false);
    }
  }

  async function reenviar() {
    setError(''); setAviso('');
    try {
      await api('/auth/reenviar', { metodo: 'POST', cuerpo: { desafio: estado!.desafio } });
      setAviso('Te enviamos un código nuevo. El anterior ya no sirve.');
      setEspera(60);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No pudimos reenviar el código');
    }
  }

  return (
    <PantallaAcceso>
      <section aria-labelledby="titulo-cod" className="tarjeta-acceso vidrio">
        <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(199,225,150,0.16)', color: 'var(--lima)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        </span>
        <div>
          <h2 id="titulo-cod">Revisa tu correo</h2>
          <p className="subtitulo">
            Te enviamos un código de 6 dígitos a <b style={{ color: '#fff' }}>{estado.correo}</b>. Lo pedimos porque es un equipo nuevo o pasaron 7 días desde tu última verificación.
          </p>
        </div>
        <form onSubmit={verificar} noValidate>
          <div className="campo">
            <label htmlFor="codigo" className="etiqueta">Código de verificación</label>
            <input id="codigo" className="entrada" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" autoFocus
              value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-invalid={!!error}
              style={{ height: 64, fontFamily: 'var(--fuente-titulos)', fontSize: 30, fontWeight: 600, letterSpacing: '0.5em', textAlign: 'center' }} />
            <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>Vence en 10 minutos</span>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />
            Recordar este equipo por 7 días
          </label>
          {error && <div className="alerta" role="alert">{error}</div>}
          {aviso && <div className="aviso" role="status">{aviso}</div>}
          <button type="submit" className="boton" disabled={enviando || codigo.length !== 6}>
            {enviando ? 'Verificando…' : 'Verificar e ingresar'}
          </button>
        </form>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <button type="button" className="boton-texto" onClick={reenviar} disabled={espera > 0}>
            {espera > 0 ? `Reenviar código en ${espera} s` : 'Reenviar código'}
          </button>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Usar otra cuenta</Link>
        </div>
      </section>
    </PantallaAcceso>
  );
}
