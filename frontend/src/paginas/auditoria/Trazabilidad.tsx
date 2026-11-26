import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { bitacoraApi, TEXTO_ACCION } from '../../api/auditoria';
import { trazabilidadApi, type EmpresaTraza, type Periodo, type ResumenTraza, type TipoEvento, type UsuarioTraza } from '../../api/trazabilidad';
import { ActividadDiaria, Barras, MapaCalor } from '../../componentes/graficos';
import { useDebounce } from '../../hooks/useDebounce';
import { ultimoIngreso } from '../../utilidades/validacion';
import '../tableros/tableros.css';
import './trazabilidad.css';

type Vista = 'resumen' | 'empresa' | 'usuario';
const CATEGORIA: Record<string, string> = {
  accesos: 'Accesos y seguridad', empresas: 'Empresas y gestiones', ventas: 'Negociaciones y ventas', documentos: 'Documentos',
  datos: 'Bases, metas y exportaciones', admin: 'Administración', otras: 'Otras',
};
const ETAPA: Record<string, string> = { NEGOCIACION: 'Negociación', CIERRE: 'Cierre', PROSPECCION: 'Prospección' };
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const duracion = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`);

/** Trazabilidad: qué pasa en el CRM, quién lo hace y cuándo (administración y gerencia) */
export function Trazabilidad() {
  const [params, setParams] = useSearchParams();
  const vista = (params.get('vista') as Vista) || 'resumen';
  const [dias, setDias] = useState<Periodo>(30);
  const ir = (v: Vista, extra: Record<string, string> = {}) => setParams({ vista: v, ...extra });

  return (
    <>
      <div className="encabezado">
        <h1>Trazabilidad</h1>
        <p>Qué pasa en el CRM, quién lo hace y cuándo. Sale de la bitácora y del historial de cada empresa.</p>
      </div>

      <div className="traza-barra">
        <div className="pestanas" role="tablist" aria-label="Qué rastrear">
          {([['resumen', 'Resumen'], ['empresa', 'Por empresa'], ['usuario', 'Por usuario']] as const).map(([v, t]) => (
            <button key={v} type="button" role="tab" aria-selected={vista === v} className={`pestana${vista === v ? ' pestana--activa' : ''}`} onClick={() => ir(v)}>{t}</button>
          ))}
        </div>
        {vista !== 'empresa' && (
          <div className="pestanas" role="group" aria-label="Periodo">
            {([7, 30, 90] as Periodo[]).map((d) => (
              <button key={d} type="button" className={`pestana${dias === d ? ' pestana--activa' : ''}`} onClick={() => setDias(d)}>{d} días</button>
            ))}
          </div>
        )}
      </div>

      {vista === 'resumen' && <Resumen dias={dias} onUsuario={(id) => ir('usuario', { id })} />}
      {vista === 'empresa' && <PorEmpresa id={params.get('id')} onElegir={(id) => ir('empresa', { id })} />}
      {vista === 'usuario' && <PorUsuario id={params.get('id')} dias={dias} onElegir={(id) => ir('usuario', { id })} />}
    </>
  );
}

// ───────────────────────── Resumen ─────────────────────────
function Resumen({ dias, onUsuario }: { dias: Periodo; onUsuario: (id: string) => void }) {
  // El resultado queda junto al periodo pedido: si no coincide, se está cargando
  const [res, setRes] = useState<{ dias: Periodo; datos?: ResumenTraza; error?: string } | null>(null);
  useEffect(() => {
    trazabilidadApi.resumen(dias).then((datos) => setRes({ dias, datos }))
      .catch((e) => setRes({ dias, error: e instanceof ErrorApi ? e.message : 'No se pudo cargar la trazabilidad' }));
  }, [dias]);

  if (res?.dias === dias && res.error) return <div className="alerta" role="alert">{res.error}</div>;
  const r = res?.dias === dias ? res.datos : undefined;
  if (!r) return <p className="tenue">Cargando…</p>;
  const k = r.kpis;
  return (
    <>
      <div className="kpis kpis--seis">
        <Kpi titulo="Acciones registradas" valor={k.acciones} detalle={`en los últimos ${dias} días`} />
        <Kpi titulo="Usuarios activos" valor={k.usuariosActivos} detalle="hicieron al menos una acción" />
        <Kpi titulo="Ingresos al CRM" valor={k.ingresos} detalle="inicios de sesión" />
        <Kpi titulo="Intentos fallidos" valor={k.fallidos} detalle="contraseña, código o acceso denegado" alerta={k.fallidos > 0} />
        <Kpi titulo="Exportaciones" valor={k.exportaciones} detalle="descargas de reportes" alerta={k.exportaciones > 0} />
        <Kpi titulo="Alertas de seguridad" valor={k.alertas} detalle="ver la lista más abajo" alerta={k.alertas > 0} />
      </div>

      <section className="panel vidrio traza-panel">
        <h2 className="h2">Recorrido de las empresas · últimos {dias} días</h2>
        <p className="traza-ayuda">De dónde llegan las empresas, qué se hace con ellas y cómo terminan. Cada caja muestra cuántas pasaron por ese paso.</p>
        <FlujoEmpresas f={r.flujo} />
      </section>

      <div className="rejilla-2">
        <section className="panel vidrio traza-panel">
          <h2 className="h2">Actividad por día</h2>
          <ActividadDiaria datos={r.porDia} titulo="Acciones por día" />
        </section>
        <section className="panel vidrio traza-panel">
          <h2 className="h2">¿Cuándo se trabaja?</h2>
          <MapaCalor datos={r.calor} titulo="Acciones por día de la semana y hora" />
        </section>
      </div>

      <div className="rejilla-2">
        <section className="panel vidrio traza-panel">
          <h2 className="h2">Quién hace más</h2>
          <div className="traza-usuarios">
            {r.porUsuario.map((u) => {
              const max = r.porUsuario[0]?.n || 1;
              return (
                <button key={u.id} type="button" className="traza-usuario" onClick={() => onUsuario(u.id)} title="Ver su trazabilidad">
                  <span className="traza-usuario__nombre"><b>{u.usuario}</b><span className="tenue">{u.rol} · último: {ultimoIngreso(u.ultima)}</span></span>
                  <span className="barras__pista"><span className="barras__barra" style={{ width: `${(u.n / max) * 100}%` }} /></span>
                  <span className="numeros"><b>{u.n}</b></span>
                </button>
              );
            })}
            {!r.porUsuario.length && <span className="tenue">Sin actividad en el periodo.</span>}
          </div>
        </section>
        <section className="panel vidrio traza-panel">
          <h2 className="h2">Qué se hace</h2>
          <Barras titulo="Acciones por tipo" datos={r.porCategoria.map((c) => ({ etiqueta: CATEGORIA[c.categoria] ?? c.categoria, valor: c.n }))} />
          <h3 className="traza-sub">Por rol</h3>
          <Barras titulo="Acciones por rol" datos={r.porRol.map((x) => ({ etiqueta: x.rol, valor: x.n, detalle: `${x.usuarios} usuarios` }))} />
        </section>
      </div>

      <div className="rejilla-2">
        <section className="panel vidrio traza-panel">
          <h2 className="h2">Hoy en el CRM</h2>
          <div className="traza-hoy">
            <div><span className="kpi__valor numeros">{r.hoy.asignadas}</span><span className="tenue">empresas a cargo de un asesor</span></div>
            <div><span className="kpi__valor numeros">{r.hoy.libres}</span><span className="tenue">libres en el repositorio</span></div>
            <div><span className="kpi__valor numeros">{r.hoy.bloqueadas}</span><span className="tenue">bloqueadas (no interesadas o sin respuesta)</span></div>
          </div>
          <h3 className="traza-sub">Negociaciones abiertas por etapa</h3>
          {r.embudo.length
            ? <Barras titulo="Negociaciones abiertas" datos={r.embudo.map((e) => ({ etiqueta: ETAPA[e.etapa] ?? e.etapa, valor: e.n }))} />
            : <span className="tenue">No hay negociaciones abiertas.</span>}
        </section>
        <section className="panel vidrio traza-panel">
          <h2 className="h2">Alertas de seguridad</h2>
          {r.alertas.length === 0 && <p className="tenue" style={{ margin: 0 }}>Sin alertas en el periodo: no hubo intentos fallidos, exportaciones ni accesos denegados.</p>}
          <ul className="traza-alertas">
            {r.alertas.map((a, i) => (
              <li key={i}>
                <span className="chip chip--crema">{TEXTO_ACCION[a.accion] ?? a.accion}</span>
                <span><b>{a.usuario ?? 'Desconocido'}</b>{a.rol ? ` · ${a.rol}` : ''}<span className="tenue numeros" style={{ display: 'block', fontSize: 12 }}>{fechaHora(a.fecha)}{a.ip ? ` · IP ${a.ip}` : ''}</span></span>
              </li>
            ))}
          </ul>
          <Link to="/bitacora" className="boton-texto" style={{ alignSelf: 'flex-start' }}>Ver la bitácora completa →</Link>
        </section>
      </div>
    </>
  );
}

function Kpi({ titulo, valor, detalle, alerta }: { titulo: string; valor: number | string; detalle: string; alerta?: boolean }) {
  return (
    <section className="kpi vidrio">
      <span className="kpi__titulo">{titulo}</span>
      <span className="kpi__valor numeros" style={alerta ? { color: 'var(--salir)' } : undefined}>{typeof valor === 'number' ? valor.toLocaleString('es-PE') : valor}</span>
      <span className="kpi__detalle">{detalle}</span>
    </section>
  );
}

function Caja({ titulo, n, detalle, tono }: { titulo: string; n: number; detalle?: string; tono?: 'bien' | 'mal' | 'neutro' }) {
  return (
    <div className={`flujo__caja${tono ? ` flujo__caja--${tono}` : ''}`}>
      <span className="flujo__n numeros">{n.toLocaleString('es-PE')}</span>
      <span className="flujo__titulo">{titulo}</span>
      {detalle && <span className="flujo__detalle">{detalle}</span>}
    </div>
  );
}

/** Diagrama de flujo: entrada → trabajo → negociación → resultado, con las liberaciones aparte */
function FlujoEmpresas({ f }: { f: ResumenTraza['flujo'] }) {
  const liberadas = f.liberadasPlazo + f.liberadasSinRespuesta + f.liberadasRechazo + f.liberadasManual;
  return (
    <div className="flujo" role="img"
      aria-label={`Entraron ${f.porBase} por bases y ${f.porProspecto} como prospectos; ${f.tomadas} tomadas y ${f.asignadas} asignadas; ${f.gestionadas} gestionadas; ${f.negociaciones} negociaciones; ${f.ganadas} ganadas y ${f.perdidas} perdidas; ${liberadas} liberadas.`}>
      <div className="flujo__etapa">
        <span className="flujo__paso">1 · Entran</span>
        <Caja titulo="Por bases" n={f.porBase} />
        <Caja titulo="Como prospecto" n={f.porProspecto} detalle="registradas por un asesor" />
      </div>
      <span className="flujo__flecha" aria-hidden>→</span>
      <div className="flujo__etapa">
        <span className="flujo__paso">2 · Se asignan</span>
        <Caja titulo="Tomadas del repositorio" n={f.tomadas} />
        <Caja titulo="Asignadas" n={f.asignadas} detalle="por carga o reasignación" />
      </div>
      <span className="flujo__flecha" aria-hidden>→</span>
      <div className="flujo__etapa">
        <span className="flujo__paso">3 · Se gestionan</span>
        <Caja titulo="Empresas gestionadas" n={f.gestionadas} detalle={`${f.gestiones.toLocaleString('es-PE')} gestiones en total`} />
      </div>
      <span className="flujo__flecha" aria-hidden>→</span>
      <div className="flujo__etapa">
        <span className="flujo__paso">4 · Se negocian</span>
        <Caja titulo="Negociaciones iniciadas" n={f.negociaciones} />
      </div>
      <span className="flujo__flecha" aria-hidden>→</span>
      <div className="flujo__etapa">
        <span className="flujo__paso">5 · Terminan</span>
        <Caja titulo="Ganadas" n={f.ganadas} tono="bien" />
        <Caja titulo="Perdidas" n={f.perdidas} tono="mal" />
      </div>
      <div className="flujo__salida">
        <span className="flujo__paso">Vuelven al repositorio · {liberadas}</span>
        <div className="flujo__liberadas">
          <Caja titulo="Plazo vencido" n={f.liberadasPlazo} tono="neutro" />
          <Caja titulo="5 días sin respuesta" n={f.liberadasSinRespuesta} tono="neutro" />
          <Caja titulo="No interesadas" n={f.liberadasRechazo} tono="neutro" />
          <Caja titulo="Liberadas por el asesor" n={f.liberadasManual} tono="neutro" />
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Por empresa ─────────────────────────
const TIPOS: Record<TipoEvento, { texto: string; clase: string }> = {
  ASIGNACION: { texto: 'Asignación', clase: 'asignacion' }, GESTION: { texto: 'Gestión', clase: 'gestion' },
  NEGOCIACION: { texto: 'Negociación', clase: 'negociacion' }, ETAPA: { texto: 'Etapa', clase: 'negociacion' },
  VALIDACION: { texto: 'Back office', clase: 'validacion' }, POSVENTA: { texto: 'Posventa', clase: 'validacion' },
  FICHA: { texto: 'Revisó la ficha', clase: 'ficha' }, ACCION: { texto: 'Cambio', clase: 'accion' },
};

function PorEmpresa({ id, onElegir }: { id: string | null; onElegir: (id: string) => void }) {
  const [q, setQ] = useState('');
  const buscar = useDebounce(q);
  const [encontradas, setEncontradas] = useState<{ q: string; lista: { id: string; ruc: string; razonSocial: string; asesor: string | null }[] }>({ q: '', lista: [] });
  const [res, setRes] = useState<{ id: string; datos?: EmpresaTraza; error?: string } | null>(null);
  const [filtro, setFiltro] = useState<TipoEvento | ''>('');

  useEffect(() => {
    if (buscar.trim().length < 3) return;
    trazabilidadApi.buscarEmpresas(buscar).then((lista) => setEncontradas({ q: buscar, lista })).catch(() => undefined);
  }, [buscar]);
  useEffect(() => {
    if (!id) return;
    trazabilidadApi.empresa(id).then((datos) => setRes({ id, datos }))
      .catch((e) => setRes({ id, error: e instanceof ErrorApi ? e.message : 'No se pudo cargar la empresa' }));
  }, [id]);
  const resultados = q.trim().length >= 3 && encontradas.q === buscar ? encontradas.lista : [];
  const d = id && res?.id === id ? res.datos ?? null : null;
  const error = id && res?.id === id ? res.error ?? '' : '';

  const eventos = d?.eventos.filter((e) => !filtro || e.tipo === filtro || (filtro === 'NEGOCIACION' && e.tipo === 'ETAPA')) ?? [];
  const e = d?.empresa;
  return (
    <>
      <section className="panel vidrio traza-panel">
        <label htmlFor="buscar-traza" className="etiqueta">Busca la empresa por RUC o razón social</label>
        <input id="buscar-traza" type="search" className="entrada" placeholder="Ej. 20601234567 o Transportes Andinos" maxLength={100}
          value={q} onChange={(ev) => setQ(/^\d+$/.test(ev.target.value) ? ev.target.value.slice(0, 11) : ev.target.value)} />
        {resultados.length > 0 && (
          <ul className="traza-resultados">
            {resultados.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => { onElegir(x.id); setQ(''); }}>
                  <b>{x.razonSocial}</b><span className="tenue numeros">RUC {x.ruc} · {x.asesor ?? 'Libre'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <div className="alerta" role="alert">{error}</div>}
      {id && !d && !error && <p className="tenue">Cargando…</p>}
      {e && (
        <>
          <section className="panel vidrio traza-panel">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2 className="h2" style={{ margin: 0 }}>{e.razonSocial}</h2>
                <span className="tenue numeros">RUC {e.ruc} · {e.origen === 'BASE' ? 'llegó por una base' : 'registrada como prospecto'} el {fechaHora(e.creadaAt)}</span>
              </div>
              <Link className="boton-secundario" to={`/empresas/${e.id}`}>Abrir ficha</Link>
            </div>
            <div className="traza-hoy">
              <div><b>{e.asesor ?? 'Libre en el repositorio'}</b><span className="tenue">a cargo hoy</span></div>
              <div><span className="kpi__valor numeros">{e.asesores}</span><span className="tenue">{e.asesores === 1 ? 'asesor la tuvo' : 'asesores la tuvieron'}</span></div>
              <div><span className="kpi__valor numeros">{e.gestiones}</span><span className="tenue">gestiones</span></div>
              <div><span className="kpi__valor numeros">{duracion(e.segundosFicha)}</span><span className="tenue">tiempo total en su ficha</span></div>
            </div>
          </section>

          <section className="panel vidrio traza-panel">
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h2 className="h2" style={{ margin: 0 }}>Historia completa · {d!.eventos.length} eventos</h2>
              <div className="pestanas" role="group" aria-label="Filtrar eventos">
                {([['', 'Todo'], ['ASIGNACION', 'Asignaciones'], ['GESTION', 'Gestiones'], ['NEGOCIACION', 'Negociaciones'], ['VALIDACION', 'Back office'], ['ACCION', 'Cambios'], ['FICHA', 'Ficha']] as const).map(([v, t]) => (
                  <button key={v || 'todo'} type="button" className={`pestana${filtro === v ? ' pestana--activa' : ''}`} onClick={() => setFiltro(v)}>{t}</button>
                ))}
              </div>
            </div>
            <ol className="traza-tiempo">
              {eventos.map((ev, i) => (
                <li key={i} className={`traza-tiempo__item traza-tiempo__item--${TIPOS[ev.tipo].clase}`}>
                  <span className="traza-tiempo__punto" aria-hidden />
                  <div className="traza-tiempo__contenido">
                    <span className="traza-tiempo__meta numeros">{fechaHora(ev.fecha)} · {TIPOS[ev.tipo].texto}</span>
                    <b>{ev.tipo === 'ACCION' ? TEXTO_ACCION[ev.accion ?? ''] ?? ev.titulo : ev.titulo}</b>
                    {ev.detalle && <span className="traza-tiempo__detalle">{ev.detalle}</span>}
                    <span className="tenue" style={{ fontSize: 13 }}>{ev.usuario ?? 'Sin usuario'}{ev.rol ? ` · ${ev.rol}` : ''}</span>
                  </div>
                </li>
              ))}
              {!eventos.length && <li className="tenue">No hay eventos de este tipo.</li>}
            </ol>
          </section>
        </>
      )}
      {!id && <p className="tenue">Elige una empresa para ver todo lo que pasó con ella: quién la tuvo, cada gestión, sus negociaciones y cada cambio.</p>}
    </>
  );
}

// ───────────────────────── Por usuario ─────────────────────────
function PorUsuario({ id, dias, onElegir }: { id: string | null; dias: Periodo; onElegir: (id: string) => void }) {
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string; rol: string }[]>([]);
  const [res, setRes] = useState<{ clave: string; datos?: UsuarioTraza; error?: string } | null>(null);
  useEffect(() => { bitacoraApi.usuarios().then(setUsuarios).catch(() => undefined); }, []);
  const clave = `${id}-${dias}`;
  useEffect(() => {
    if (!id) return;
    trazabilidadApi.usuario(id, dias).then((datos) => setRes({ clave: `${id}-${dias}`, datos }))
      .catch((e) => setRes({ clave: `${id}-${dias}`, error: e instanceof ErrorApi ? e.message : 'No se pudo cargar el usuario' }));
  }, [id, dias]);
  const d = id && res?.clave === clave ? res.datos ?? null : null;
  const error = id && res?.clave === clave ? res.error ?? '' : '';

  return (
    <>
      <section className="panel vidrio traza-panel">
        <label htmlFor="usuario-traza" className="etiqueta">Usuario</label>
        <select id="usuario-traza" className="entrada" value={id ?? ''} onChange={(e) => e.target.value && onElegir(e.target.value)}>
          <option value="">Elige a quién rastrear…</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>)}
        </select>
      </section>
      {error && <div className="alerta" role="alert">{error}</div>}
      {id && !d && !error && <p className="tenue">Cargando…</p>}
      {d && (
        <>
          <div className="kpis kpis--seis">
            <Kpi titulo="Último ingreso" valor={ultimoIngreso(d.usuario.ultimoIngreso)} detalle={d.usuario.ultimoIngreso ? fechaHora(d.usuario.ultimoIngreso) : 'Nunca ha ingresado'} />
            <Kpi titulo="Días que ingresó" valor={d.trabajo.diasConIngreso} detalle={`de los últimos ${dias}`} />
            <Kpi titulo="Gestiones" valor={d.trabajo.gestiones} detalle={`en ${d.trabajo.empresas} empresas`} />
            <Kpi titulo="Empresas tomadas" valor={d.trabajo.tomadas} detalle="del repositorio" />
            <Kpi titulo="Empresas liberadas" valor={d.trabajo.liberadas} detalle="por plazo, sin respuesta, rechazo o a mano" alerta={d.trabajo.liberadas > d.trabajo.tomadas && d.trabajo.liberadas > 0} />
            <Kpi titulo="Tiempo en fichas" valor={duracion(d.trabajo.segundosFicha)} detalle="revisando empresas" />
          </div>
          <div className="rejilla-2">
            <section className="panel vidrio traza-panel">
              <h2 className="h2">{d.usuario.nombre}</h2>
              <span className="tenue">{d.usuario.rol}{d.usuario.equipo ? ` · ${d.usuario.equipo}` : ''} · {d.usuario.email}{d.usuario.activo ? '' : ' · desactivado'}</span>
              <ActividadDiaria datos={d.porDia} titulo="Acciones por día" />
            </section>
            <section className="panel vidrio traza-panel">
              <h2 className="h2">Qué hizo</h2>
              {d.porAccion.length
                ? <Barras titulo="Acciones por tipo" datos={d.porAccion.map((a) => ({ etiqueta: TEXTO_ACCION[a.accion] ?? a.accion, valor: a.n }))} />
                : <span className="tenue">Sin acciones en el periodo.</span>}
            </section>
          </div>
          <section className="panel vidrio traza-panel">
            <h2 className="h2">Últimas 40 acciones</h2>
            <ol className="traza-tiempo">
              {d.ultimas.map((a, i) => (
                <li key={i} className="traza-tiempo__item traza-tiempo__item--accion">
                  <span className="traza-tiempo__punto" aria-hidden />
                  <div className="traza-tiempo__contenido">
                    <span className="traza-tiempo__meta numeros">{fechaHora(a.fecha)}{a.ip ? ` · IP ${a.ip}` : ''}</span>
                    <b>{TEXTO_ACCION[a.accion] ?? a.accion}</b>
                    {a.empresa && a.entidadId && <Link to={`/trazabilidad?vista=empresa&id=${a.entidadId}`} className="traza-tiempo__detalle">{a.empresa} →</Link>}
                    {a.detalle && <span className="traza-tiempo__detalle">{a.detalle}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
      {!id && <p className="tenue">Elige un usuario para ver cuándo ingresa, qué hace y con qué empresas trabaja.</p>}
    </>
  );
}
