import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import { soporteApi } from '../api/soporte';
import { Icono } from '../layout/Icono';
import { INICIO_POR_ROL } from '../layout/menu';
import { useSesion } from '../sesion/SesionContext';
import type { Usuario } from '../sesion/tipos';

type Rol = Usuario['rol']['codigo'];
const ROLES: { rol: Rol; nombre: string; conEquipo?: boolean }[] = [
  { rol: 'ADMIN', nombre: 'Administrador del sistema' },
  { rol: 'GERENTE', nombre: 'Gerente de ventas' },
  { rol: 'SUPERVISOR', nombre: 'Supervisor', conEquipo: true },
  { rol: 'BACKOFFICE', nombre: 'Back office' },
  { rol: 'ASESOR', nombre: 'Asesor', conEquipo: true },
];

/** Cuentas de soporte: icono en la barra superior con un menú pequeño para cambiar de rol (reemplaza la franja) */
export function MenuRol() {
  const { usuario, iniciar } = useSesion();
  const navegar = useNavigate();
  const [abierto, setAbierto] = useState(false);
  const [pidiendoEquipo, setPidiendoEquipo] = useState<Rol | ''>('');
  const [equipos, setEquipos] = useState<{ id: string; nombre: string }[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const caja = useRef<HTMLDivElement>(null);

  // Se cierra al hacer clic fuera o con Escape
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [abierto]);

  useEffect(() => {
    if (abierto && !equipos) soporteApi.equipos().then(setEquipos).catch(() => setEquipos([]));
  }, [abierto, equipos]);

  if (!usuario?.soporte || !usuario.rolElegido || usuario.vista) return null;

  async function entrar(rol: Rol, equipoId?: string) {
    const r = ROLES.find((x) => x.rol === rol)!;
    if (r.conEquipo && !equipoId) {
      if (equipos?.length === 1) equipoId = equipos[0].id;
      else { setPidiendoEquipo(rol); return; }
    }
    setOcupado(true); setError('');
    try {
      const s = await soporteApi.entrarConRol(rol, r.conEquipo ? equipoId : undefined);
      iniciar(s.token, s.usuario);
      setAbierto(false); setPidiendoEquipo('');
      navegar(INICIO_POR_ROL[s.usuario.rol.codigo], { replace: true });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo cambiar de rol');
    } finally {
      setOcupado(false);
    }
  }

  const actual = usuario.rol.codigo;
  return (
    <div className="menu-rol" ref={caja}>
      <button type="button" className="topbar__circulo" aria-haspopup="menu" aria-expanded={abierto}
        aria-label={`Cuenta de soporte: usando el CRM como ${usuario.rol.nombre}. Cambiar de rol`}
        title={`Soporte · ${usuario.rol.nombre}`} onClick={() => { setAbierto(!abierto); setPidiendoEquipo(''); setError(''); }}>
        <Icono nombre="cambiarRol" tam={20} />
      </button>
      {abierto && (
        <div className="menu-rol__panel" role="menu" aria-label="Cambiar de rol">
          <span className="menu-rol__titulo">Cuenta de soporte · usando el CRM como</span>
          {ROLES.map((r) => (
            <div key={r.rol}>
              <button type="button" role="menuitemradio" aria-checked={actual === r.rol} disabled={ocupado}
                className={`menu-rol__opcion${actual === r.rol ? ' menu-rol__opcion--activa' : ''}`}
                onClick={() => (actual === r.rol && !r.conEquipo ? setAbierto(false) : entrar(r.rol))}>
                <span>{r.nombre}</span>
                {actual === r.rol && <span className="menu-rol__marca">{usuario.equipo && r.conEquipo ? usuario.equipo.nombre : 'Actual'}</span>}
              </button>
              {pidiendoEquipo === r.rol && (
                <div className="menu-rol__equipos">
                  {!equipos && <span className="tenue">Cargando equipos…</span>}
                  {equipos?.length === 0 && <span className="tenue">No hay equipos: créalos en Administración.</span>}
                  {equipos?.map((e) => (
                    <button key={e.id} type="button" className="menu-rol__equipo" disabled={ocupado} onClick={() => entrar(r.rol, e.id)}>{e.nombre}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {error && <span className="campo-error" role="alert">{error}</span>}
        </div>
      )}
    </div>
  );
}
