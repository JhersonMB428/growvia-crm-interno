import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import {
  estadoDe, negociacionesApi, resumenLineas, soles, TEXTO_SERVICIO, type NegociacionDetalle, type NegociacionResumen,
} from '../../api/negociaciones';
import { useSesion } from '../../sesion/SesionContext';
import './negociaciones.css';

type Servicio = '' | 'MOVIL' | 'FIJA' | 'AMBOS';
type Grupo = 'NEGOCIACION' | 'CIERRE' | 'GANADA' | 'PERDIDA';

const GRUPOS: { clave: Grupo; titulo: string; filtro: (n: NegociacionResumen) => boolean }[] = [
  { clave: 'NEGOCIACION', titulo: 'En negociación', filtro: (n) => n.resultado === 'EN_CURSO' && n.etapa !== 'CIERRE' },
  { clave: 'CIERRE', titulo: 'En cierre', filtro: (n) => n.resultado === 'EN_CURSO' && n.etapa === 'CIERRE' },
  { clave: 'GANADA', titulo: 'Ganadas del mes', filtro: (n) => n.resultado === 'GANADA' },
  { clave: 'PERDIDA', titulo: 'Perdidas del mes', filtro: (n) => n.resultado === 'PERDIDA' },
];
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });

/** Lista a la izquierda y resumen de la negociación elegida a la derecha */
export function Negociaciones() {
  const { usuario } = useSesion();
  const rol = usuario?.rol.codigo;
  const esAsesor = rol === 'ASESOR';
  const [filas, setFilas] = useState<NegociacionResumen[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [servicio, setServicio] = useState<Servicio>('');
  // Back office llega a ver las ventas ganadas; los demás, lo que está en negociación
  const [grupo, setGrupo] = useState<Grupo>(rol === 'BACKOFFICE' ? 'GANADA' : 'NEGOCIACION');
  const [elegida, setElegida] = useState<string | null>(null);

  useEffect(() => {
    negociacionesApi.embudo()
      .then((d) => setFilas(d.filas))
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las negociaciones'));
  }, []);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return (filas ?? []).filter((n) =>
      (!servicio || n.servicio === servicio)
      && (!texto || n.razonSocial.toLowerCase().includes(texto) || n.ruc.includes(texto)
        || n.codigo.toLowerCase().includes(texto) || n.asesor.toLowerCase().includes(texto)));
  }, [filas, q, servicio]);

  const actual = GRUPOS.find((g) => g.clave === grupo)!;
  const lista = visibles.filter(actual.filtro);
  const seleccion = lista.find((n) => n.id === elegida) ?? lista[0] ?? null;
  const abiertas = (filas ?? []).filter((n) => n.resultado === 'EN_CURSO');

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>{rol === 'BACKOFFICE' ? 'Ventas' : 'Negociaciones'}</h1>
          <p>
            {filas
              ? `${abiertas.length} ${abiertas.length === 1 ? 'abierta' : 'abiertas'} · ${soles(abiertas.reduce((s, n) => s + n.total, 0))} mensual sin IGV`
              : 'Cargando…'}
          </p>
        </div>
        {esAsesor && <Link to="/empresas" className="boton">+ Nueva negociación</Link>}
      </div>

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="fila-acciones">
          <div style={{ flex: '1 1 280px', maxWidth: 420 }}>
            <label htmlFor="q" className="oculto-visual">Buscar</label>
            <input id="q" className="entrada" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder={esAsesor ? 'Buscar empresa, RUC o código' : 'Buscar empresa, RUC, código o asesor'} />
          </div>
          <div className="pestanas" role="group" aria-label="Filtrar por servicio">
            {([['', 'Todos'], ['MOVIL', 'Móvil'], ['FIJA', 'Fija'], ['AMBOS', 'Ambos']] as [Servicio, string][]).map(([v, t]) => (
              <button key={v} type="button" className={`pestana${servicio === v ? ' pestana--activa' : ''}`} aria-pressed={servicio === v} onClick={() => setServicio(v)}>{t}</button>
            ))}
          </div>
        </div>

        <div className="pestanas neg-grupos" role="tablist" aria-label="Estado">
          {GRUPOS.map((g) => {
            const n = visibles.filter(g.filtro);
            return (
              <button key={g.clave} type="button" role="tab" aria-selected={grupo === g.clave}
                className={`pestana${grupo === g.clave ? ' pestana--activa' : ''}`} onClick={() => { setGrupo(g.clave); setElegida(null); }}>
                {g.titulo} · {n.length}
              </button>
            );
          })}
        </div>

        {error && <div className="alerta" role="alert">{error}</div>}
        {!filas && !error && <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>}
        {esAsesor && filas?.length === 0 && (
          <div className="aviso" role="status">
            Aún no tienes negociaciones. Para abrir una, entra a una de <Link to="/empresas" style={{ fontWeight: 700 }}>tus empresas</Link> y pulsa <b>Nueva negociación</b>.
          </div>
        )}

        {filas && (
          <div className="neg-maestro">
            <ul className="neg-lista" aria-label={actual.titulo}>
              {lista.length === 0 && <li className="embudo__vacia">Sin negociaciones {actual.titulo.toLowerCase()}</li>}
              {lista.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`neg-item${seleccion?.id === n.id ? ' neg-item--activa' : ''}`}
                    aria-current={seleccion?.id === n.id} onClick={() => setElegida(n.id)}>
                    <span className="neg-item__texto">
                      <b className="recortar">{n.razonSocial}</b>
                      <span className="tenue recortar numeros">
                        {n.codigo}{n.servicio ? ` · ${TEXTO_SERVICIO[n.servicio]}` : ''}{!esAsesor ? ` · ${n.asesor}` : ''}
                      </span>
                    </span>
                    <span className="numeros neg-item__monto">{soles(n.total)}</span>
                    <span className="neg-item__flecha" aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
            <ResumenNegociacion key={seleccion?.id ?? 'ninguna'} n={seleccion} verAsesor={!esAsesor} />
          </div>
        )}
      </section>
    </>
  );
}

/** Resumen de la negociación elegida (trae sus servicios y el último comentario). Se monta de nuevo al cambiar de negociación. */
function ResumenNegociacion({ n, verAsesor }: { n: NegociacionResumen | null; verAsesor: boolean }) {
  const [d, setD] = useState<NegociacionDetalle | null>(null);
  const id = n?.id;

  useEffect(() => {
    if (id) negociacionesApi.detalle(id).then(setD).catch(() => undefined);
  }, [id]);

  if (!n) return <aside className="neg-resumen neg-resumen--vacio">Elige una negociación de la lista para ver su resumen.</aside>;

  const chip = n.resultado === 'GANADA' ? 'chip--lima' : n.resultado === 'PERDIDA' ? 'chip--crema' : 'chip--gris';
  const conEquipo = d?.items.filter((i) => i.conEquipo).reduce((s, i) => s + i.cantidad, 0) ?? 0;
  const ultimo = d?.gestiones[0];

  return (
    <aside className="neg-resumen" aria-label={`Resumen de ${n.razonSocial}`}>
      <div className="fila-acciones" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <h2 className="h2 recortar" title={n.razonSocial}>{n.razonSocial}</h2>
          <span className="tenue numeros">{n.codigo} · RUC {n.ruc}</span>
        </div>
        <span className={`chip ${chip}`}>{estadoDe(n)}</span>
      </div>

      <div className="dato">
        <span>Subtotal sin IGV</span>
        <span className="total-grande numeros">{soles(n.total)}</span>
        <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>mensual · {resumenLineas(n)}</span>
      </div>

      <div className="rejilla-2">
        {verAsesor && <div className="dato"><span>Asesor</span><b>{n.asesor}</b></div>}
        {verAsesor && <div className="dato"><span>Equipo</span><b>{n.equipo ?? '—'}</b></div>}
        <div className="dato"><span>Servicio</span><b>{n.servicio ? TEXTO_SERVICIO[n.servicio] : '—'}</b></div>
        <div className="dato"><span>Con equipo</span><b className="numeros">{d ? (conEquipo ? `${conEquipo} ${conEquipo === 1 ? 'línea' : 'líneas'}` : 'No') : '…'}</b></div>
        <div className="dato"><span>Abierta</span><b>{fecha(n.creadoAt)}</b></div>
        <div className="dato"><span>{n.fechaCierre ? 'Cerrada' : 'Último movimiento'}</span><b>{fecha(n.fechaCierre ?? n.actualizadoAt)}</b></div>
      </div>

      {n.resultado === 'PERDIDA' && <p style={{ margin: 0 }}><b>Motivo:</b> {n.motivoPerdida}</p>}

      {d && d.items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="etiqueta">Servicios</span>
          <ul className="neg-servicios">
            {d.items.map((i) => (
              <li key={i.id}>
                <span className="recortar"><b>{i.cantidad}</b> × {i.plan}{i.modalidad === 'PORTABILIDAD' ? ` · porta de ${i.operadorOrigen}` : ''}{i.conEquipo ? ' · con equipo' : ''}</span>
                <span className="numeros">{soles(i.subtotal ?? 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ultimo && (
        <div className="bloque" style={{ gap: 4 }}>
          <span className="etiqueta">Último comentario</span>
          <span style={{ fontSize: 14 }}>“{ultimo.comentario}”</span>
          <span style={{ fontSize: 12, color: 'var(--texto-tenue)' }}>{ultimo.usuario} · {fecha(ultimo.fecha)}</span>
        </div>
      )}

      <div className="fila-acciones" style={{ justifyContent: 'flex-end', marginTop: 'auto' }}>
        <Link to={`/empresas/${n.clienteId}`} className="boton-secundario">Ver empresa</Link>
        <Link to={`/negociaciones/${n.id}`} className="boton">Abrir negociación</Link>
      </div>
    </aside>
  );
}