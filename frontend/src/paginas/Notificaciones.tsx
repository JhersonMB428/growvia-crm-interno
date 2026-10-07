import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../api/cliente';
import { avisarCampana, notificacionesApi, type Notificacion } from '../api/gestiones';
import '../componentes/gestiones.css';

/** A dónde lleva cada aviso al tocarlo */
function enlace(n: Notificacion): string {
  if (n.entidad === 'EMPRESA' && n.entidadId) return `/empresas/${n.entidadId}#gestiones`;
  if (n.entidad === 'NEGOCIACION' && n.entidadId) return `/negociaciones/${n.entidadId}`;
  if (n.entidad === 'LOTE' && n.entidadId) return `/bases/${n.entidadId}`;
  if (n.tipo.startsWith('GESTION')) return '/agenda';
  return '/notificaciones';
}

function cuando(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'Ahora';
  if (min < 60) return `Hace ${min} min`;
  if (min < 24 * 60) return `Hace ${Math.round(min / 60)} h`;
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Notificaciones() {
  const [soloSinLeer, setSoloSinLeer] = useState(false);
  const [filas, setFilas] = useState<Notificacion[] | null>(null);
  const [sinLeer, setSinLeer] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    notificacionesApi.listar(soloSinLeer)
      .then((r) => { setFilas(r.filas); setSinLeer(r.sinLeer); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las notificaciones'));
  }, [soloSinLeer]);

  async function leer(n: Notificacion) {
    if (n.leida) return;
    const r = await notificacionesApi.leida(n.id).catch(() => null);
    if (!r) return;
    setSinLeer(r.sinLeer);
    setFilas((fs) => fs?.map((x) => (x.id === n.id ? { ...x, leida: true } : x)) ?? null);
    avisarCampana();
  }

  async function leerTodas() {
    await notificacionesApi.leerTodas();
    setSinLeer(0);
    setFilas((fs) => (soloSinLeer ? [] : fs?.map((x) => ({ ...x, leida: true })) ?? null));
    avisarCampana();
  }

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Notificaciones</h1>
          <p>{sinLeer === 0 ? 'Estás al día' : `${sinLeer} sin leer`}</p>
        </div>
        <button type="button" className="boton-secundario" disabled={sinLeer === 0} onClick={leerTodas}>Marcar todo como leído</button>
      </div>

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="pestanas" role="group" aria-label="Filtrar" style={{ alignSelf: 'flex-start' }}>
          {([[false, 'Todas'], [true, 'Sin leer']] as [boolean, string][]).map(([v, t]) => (
            <button key={t} type="button" className={`pestana${soloSinLeer === v ? ' pestana--activa' : ''}`} aria-pressed={soloSinLeer === v} onClick={() => setSoloSinLeer(v)}>{t}</button>
          ))}
        </div>
        {error && <div className="alerta" role="alert">{error}</div>}
        {!filas && !error && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>Cargando…</p>}
        {filas?.length === 0 && <p style={{ color: 'var(--texto-suave)', margin: 0 }}>{soloSinLeer ? 'No tienes notificaciones sin leer.' : 'Todavía no tienes notificaciones.'}</p>}
        {filas?.map((n) => (
          <article key={n.id} className={`notif${n.leida ? ' notif--leida' : ''}`}>
            <span className="notif__punto" aria-hidden="true" />
            <div className="notif__cuerpo">
              <Link to={enlace(n)} onClick={() => leer(n)}>{n.titulo}{!n.leida && <span className="oculto-visual"> (sin leer)</span>}</Link>
              <p>{n.mensaje}</p>
            </div>
            <span className="notif__fecha">{cuando(n.fecha)}</span>
          </article>
        ))}
      </section>
    </>
  );
}