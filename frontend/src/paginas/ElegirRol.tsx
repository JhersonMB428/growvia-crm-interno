import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import { soporteApi } from '../api/soporte';
import { INICIO_POR_ROL } from '../layout/menu';
import { useSesion } from '../sesion/SesionContext';
import type { Usuario } from '../sesion/tipos';

type Rol = Usuario['rol']['codigo'];

const ROLES: { rol: Rol; nombre: string; texto: string; conEquipo?: boolean }[] = [
  { rol: 'ADMIN', nombre: 'Administrador del sistema', texto: 'Usuarios, equipos, parámetros y bitácora.' },
  { rol: 'GERENTE', nombre: 'Gerente de ventas', texto: 'Resumen general, metas, bases, reportes y exportación.' },
  { rol: 'SUPERVISOR', nombre: 'Supervisor', texto: 'Su equipo: ranking, alertas, aprobaciones y bases.', conEquipo: true },
  { rol: 'BACKOFFICE', nombre: 'Back office', texto: 'Ventas cerradas y mantenimiento de datos de empresas.' },
  { rol: 'ASESOR', nombre: 'Asesor (ejecutivo de ventas)', texto: 'Su cartera, llamadas, agenda y negociaciones.', conEquipo: true },
];

/** Cuentas de soporte: eligen con qué rol usar el CRM antes de entrar */
export function ElegirRol() {
  const { usuario, iniciar } = useSesion();
  const navegar = useNavigate();
  const [rol, setRol] = useState<Rol | ''>('');
  const [equipos, setEquipos] = useState<{ id: string; nombre: string }[] | null>(null);
  const [equipoId, setEquipoId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    soporteApi.equipos().then((l) => { setEquipos(l); if (l.length === 1) setEquipoId(l[0].id); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la lista de equipos'));
  }, []);

  if (!usuario?.soporte) return <div className="alerta" role="alert">Esta pantalla es solo para las cuentas de soporte del CRM.</div>;

  const elegido = ROLES.find((r) => r.rol === rol);
  const listo = !!elegido && (!elegido.conEquipo || !!equipoId);

  async function entrar() {
    if (!elegido) return;
    setOcupado(true); setError('');
    try {
      const r = await soporteApi.entrarConRol(elegido.rol, elegido.conEquipo ? equipoId : undefined);
      iniciar(r.token, r.usuario);
      navegar(INICIO_POR_ROL[r.usuario.rol.codigo], { replace: true });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo entrar con ese rol');
      setOcupado(false);
    }
  }

  return (
    <>
      <div className="encabezado">
        <h1>¿Con qué rol quieres entrar?</h1>
        <p>Cuenta de soporte: usas el CRM con tu propio usuario y el rol que elijas. Puedes cambiarlo cuando quieras desde la franja de arriba.</p>
      </div>
      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="elegir-rol" role="radiogroup" aria-label="Rol">
          {ROLES.map((r) => (
            <button key={r.rol} type="button" role="radio" aria-checked={rol === r.rol}
              className={`elegir-rol__opcion${rol === r.rol ? ' elegir-rol__opcion--activa' : ''}`} onClick={() => setRol(r.rol)}>
              <b>{r.nombre}</b>
              <span>{r.texto}</span>
            </button>
          ))}
        </div>
        {elegido?.conEquipo && (
          <div className="campo" style={{ maxWidth: 420 }}>
            <label htmlFor="rol-equipo" className="etiqueta">Equipo</label>
            <select id="rol-equipo" className="entrada" value={equipoId} onChange={(e) => setEquipoId(e.target.value)} disabled={!equipos}>
              <option value="">{equipos ? (equipos.length ? 'Elige el equipo' : 'No hay equipos: créalos en Administración') : 'Cargando…'}</option>
              {equipos?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--texto-suave)' }}>
              Lo que hagas (tomar empresas, registrar llamadas, negociar) queda a tu nombre y es real. No apareces en los rankings del equipo.
            </span>
          </div>
        )}
        {error && <div className="alerta" role="alert">{error}</div>}
        <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="boton" disabled={!listo || ocupado} onClick={entrar}>
            {ocupado ? 'Entrando…' : elegido ? `Entrar como ${elegido.nombre.split(' (')[0].toLowerCase()}` : 'Elige un rol'}
          </button>
        </div>
      </section>
    </>
  );
}
