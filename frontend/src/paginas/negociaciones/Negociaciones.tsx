import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import {
  negociacionesApi, resumenLineas, soles, TEXTO_ESTADO_VENTA, TEXTO_SERVICIO, TEXTO_TIPO, type NegociacionResumen,
} from '../../api/negociaciones';
import { useSesion } from '../../sesion/SesionContext';
import './negociaciones.css';

type Servicio = '' | 'MOVIL' | 'FIJA' | 'AMBOS';

const COLUMNAS: { clave: string; titulo: string; filtro: (n: NegociacionResumen) => boolean; suma: boolean }[] = [
  { clave: 'PROSPECCION', titulo: 'Prospección', filtro: (n) => n.resultado === 'EN_CURSO' && n.etapa === 'PROSPECCION', suma: true },
  { clave: 'CONTACTO', titulo: 'Contacto', filtro: (n) => n.resultado === 'EN_CURSO' && n.etapa === 'CONTACTO', suma: true },
  { clave: 'NEGOCIACION', titulo: 'Negociación', filtro: (n) => n.resultado === 'EN_CURSO' && n.etapa === 'NEGOCIACION', suma: true },
  { clave: 'GANADA', titulo: 'Ganadas del mes', filtro: (n) => n.resultado === 'GANADA', suma: true },
  { clave: 'PERDIDA', titulo: 'Perdidas del mes', filtro: (n) => n.resultado === 'PERDIDA', suma: false },
];

export function Negociaciones() {
  const { usuario } = useSesion();
  const esAsesor = usuario?.rol.codigo === 'ASESOR';
  const [filas, setFilas] = useState<NegociacionResumen[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [servicio, setServicio] = useState<Servicio>('');

  useEffect(() => {
    negociacionesApi.embudo()
      .then((d) => setFilas(d.filas))
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el embudo'));
  }, []);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return (filas ?? []).filter((n) =>
      (!servicio || n.servicio === servicio)
      && (!texto || n.razonSocial.toLowerCase().includes(texto) || n.ruc.includes(texto)
        || n.codigo.toLowerCase().includes(texto) || n.asesor.toLowerCase().includes(texto)));
  }, [filas, q, servicio]);

  const abiertas = visibles.filter((n) => n.resultado === 'EN_CURSO');

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Negociaciones</h1>
          <p>
            {filas
              ? `${abiertas.length} ${abiertas.length === 1 ? 'abierta' : 'abiertas'} · ${soles(abiertas.reduce((s, n) => s + n.total, 0))} en cargo fijo mensual`
              : esAsesor ? 'Tu embudo de ventas' : 'El embudo de ventas de tu alcance'}
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

        {error && <div className="alerta" role="alert">{error}</div>}
        {!filas && !error && <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>}
        {esAsesor && filas?.length === 0 && (
          <div className="aviso" role="status">
            Aún no tienes negociaciones. Para abrir una, entra a una de <Link to="/empresas" style={{ fontWeight: 700 }}>tus empresas</Link> y pulsa <b>Nueva negociación</b>.
          </div>
        )}

        {filas && (
          <div className="embudo">
            {COLUMNAS.map((col) => {
              const lista = visibles.filter(col.filtro);
              return (
                <section key={col.clave} className="embudo__columna" aria-label={col.titulo}>
                  <header className="embudo__cabecera">
                    <h2>{col.titulo} · {lista.length}</h2>
                    {col.suma && <span className="numeros">{soles(lista.reduce((s, n) => s + n.total, 0))}</span>}
                  </header>
                  {lista.length === 0 && <div className="embudo__vacia">Sin negociaciones</div>}
                  {lista.map((n) => <Tarjeta key={n.id} n={n} verAsesor={!esAsesor} />)}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function Tarjeta({ n, verAsesor }: { n: NegociacionResumen; verAsesor: boolean }) {
  return (
    <article className="tarjeta-op">
      <Link to={`/negociaciones/${n.id}`} className="recortar" title={n.razonSocial}>{n.razonSocial}</Link>
      <span className="tenue numeros">{n.codigo} · {TEXTO_TIPO[n.tipo]}{n.servicio ? ` · ${TEXTO_SERVICIO[n.servicio]}` : ''}</span>
      <span>{resumenLineas(n)}</span>
      {verAsesor && <span className="tenue recortar">{n.asesor}{n.equipo ? ` · ${n.equipo}` : ''}</span>}
      <div className="tarjeta-op__pie">
        <b className="numeros">{soles(n.total)}</b>
        {n.resultado === 'GANADA' && n.estadoVenta && (
          <span className={`chip ${n.estadoVenta === 'ACTIVA' || n.estadoVenta === 'VALIDADA' ? 'chip--lima' : 'chip--crema'}`}>{TEXTO_ESTADO_VENTA[n.estadoVenta]}</span>
        )}
        {n.resultado === 'PERDIDA' && <span className="chip chip--gris recortar" title={n.motivoPerdida ?? ''}>{n.motivoPerdida}</span>}
      </div>
    </article>
  );
}