import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { fechaLarga, negociacionesApi, soles, textoPlazo } from '../../api/negociaciones';
import {
  renovacionesApi, TEXTO_ESTADO_RENOVACION, textoDias, urgencia,
  type ContratoCompetencia, type ContratoPorVencer, type FiltroRenovacion, type ResumenRenovaciones,
} from '../../api/renovaciones';
import { useSesion } from '../../sesion/SesionContext';
import '../tableros/tableros.css';
import './renovaciones.css';

type Vista = 'clientes' | 'competencia';

const FILTROS: Record<Vista, [FiltroRenovacion, string][]> = {
  clientes: [['proximas', 'Por vencer'], ['vencidas', 'Vencidos'], ['renovadas', 'Renovados'], ['todas', 'Todos']],
  competencia: [['proximas', 'Por vencer'], ['vencidas', 'Ya vencieron'], ['todas', 'Todos']],
};

/** Contratos que vencen: renovar a nuestros clientes y portar a los prospectos cuando se libera su contrato */
export function Renovaciones() {
  const { usuario, puede } = useSesion();
  const navegar = useNavigate();
  const [vista, setVista] = useState<Vista>('clientes');
  const [filtro, setFiltro] = useState<FiltroRenovacion>('proximas');
  const [buscar, setBuscar] = useState('');
  const [q, setQ] = useState('');
  const [datos, setDatos] = useState<{ ventana: number; resumen?: ResumenRenovaciones; contratos?: ContratoPorVencer[]; competencia?: ContratoCompetencia[] } | null>(null);
  const [error, setError] = useState('');
  const [renovando, setRenovando] = useState('');

  const verAsesor = usuario?.rol.codigo !== 'ASESOR';
  const puedeGestionar = puede('NEGOCIACION_GESTIONAR');

  // Espera a que deje de escribir para buscar
  useEffect(() => { const t = setTimeout(() => setQ(buscar), 350); return () => clearTimeout(t); }, [buscar]);

  useEffect(() => {
    setDatos(null); setError('');
    const pedido = vista === 'clientes'
      ? renovacionesApi.contratos({ filtro, q }).then((d) => ({ ventana: d.ventana, resumen: d.resumen, contratos: d.filas }))
      : renovacionesApi.competencia({ filtro, q }).then((d) => ({ ventana: d.ventana, competencia: d.filas }));
    pedido.then(setDatos).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar'));
  }, [vista, filtro, q]);

  function cambiarVista(v: Vista) {
    setVista(v);
    if (v === 'competencia' && filtro === 'renovadas') setFiltro('proximas');
  }

  async function renovar(c: ContratoPorVencer) {
    setRenovando(c.id); setError('');
    try {
      const n = await negociacionesApi.renovar(c.id);
      navegar(`/negociaciones/${n.id}`, { state: { aviso: `Se abrió la renovación ${n.codigo} con los mismos planes. Ajusta lo que cambie y ciérrala cuando el cliente acepte.` } });
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo iniciar la renovación');
      setRenovando('');
    }
  }

  const r = datos?.resumen;
  const filas = vista === 'clientes' ? datos?.contratos : datos?.competencia;

  return (
    <>
      <div className="encabezado">
        <h1>Renovaciones</h1>
        <p>Contratos que vencen: renueva a tiempo a nuestros clientes y aprovecha cuando a un prospecto se le acaba el contrato con su operador.</p>
      </div>

      <div className="pestanas reno-vistas" role="tablist" aria-label="Qué contratos ver">
        <button type="button" role="tab" aria-selected={vista === 'clientes'} className={`pestana${vista === 'clientes' ? ' pestana--activa' : ''}`} onClick={() => cambiarVista('clientes')}>Nuestros clientes</button>
        <button type="button" role="tab" aria-selected={vista === 'competencia'} className={`pestana${vista === 'competencia' ? ' pestana--activa' : ''}`} onClick={() => cambiarVista('competencia')}>Prospectos con contrato de la competencia</button>
      </div>

      {vista === 'clientes' && r && datos && (
        <div className="kpis reno-kpis">
          <section className="kpi vidrio">
            <span className="kpi__titulo">Vencen en 30 días</span>
            <span className={`kpi__valor numeros${r.vencen30 ? ' reno-urgente' : ''}`}>{r.vencen30}</span>
            <span className="kpi__detalle">sin renovar todavía</span>
          </section>
          <section className="kpi vidrio">
            <span className="kpi__titulo">Vencen en {datos.ventana} días</span>
            <span className="kpi__valor numeros">{r.vencenVentana}</span>
            <span className="kpi__detalle">empieza a conversar con ellos</span>
          </section>
          <section className="kpi vidrio">
            <span className="kpi__titulo">Vencidos sin renovar</span>
            <span className={`kpi__valor numeros${r.vencidos ? ' reno-vencido' : ''}`}>{r.vencidos}</span>
            <span className="kpi__detalle">riesgo de que se vayan</span>
          </section>
          <section className="kpi vidrio">
            <span className="kpi__titulo">En negociación</span>
            <span className="kpi__valor numeros">{r.enNegociacion}</span>
            <span className="kpi__detalle">renovaciones abiertas</span>
          </section>
          <section className="kpi vidrio">
            <span className="kpi__titulo">Tasa de renovación</span>
            <span className="kpi__valor numeros">{r.tasaRenovacion === null ? '—' : `${r.tasaRenovacion}%`}</span>
            <span className="kpi__detalle">{r.tasaRenovacion === null ? 'aún no vence ningún contrato' : 'de los que vencieron en 12 meses'}</span>
          </section>
        </div>
      )}

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="reno-filtros">
          <div className="pestanas" role="group" aria-label="Filtro">
            {FILTROS[vista].map(([f, t]) => (
              <button key={f} type="button" aria-pressed={filtro === f} className={`pestana${filtro === f ? ' pestana--activa' : ''}`} onClick={() => setFiltro(f)}>{t}</button>
            ))}
          </div>
          <input className="entrada reno-buscar" type="search" placeholder="Buscar por RUC o razón social" aria-label="Buscar por RUC o razón social"
            value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>

        {vista === 'competencia' && (
          <p className="reno-nota">
            Cuando registres en la ficha de un prospecto con qué operador está y cuándo termina su contrato, aparecerá aquí y te avisaremos
            {datos ? ` ${datos.ventana}, 30 y 7 días antes` : ' con anticipación'}: es el mejor momento para ofrecerle la portabilidad.
          </p>
        )}

        {error && <div className="alerta" role="alert">{error}</div>}
        {!datos && !error && <p className="reno-nota">Cargando…</p>}
        {filas?.length === 0 && <p className="reno-nota">{vacio(vista, filtro, datos?.ventana ?? 90)}</p>}

        {vista === 'clientes' && !!datos?.contratos?.length && (
          <div className="tabla-scroll">
            <table className="tabla reno-tabla">
              <thead>
                <tr><th>Empresa</th>{verAsesor && <th>Asesor</th>}<th>Contrato</th><th>Vence</th><th>Renovación</th><th aria-label="Acción" /></tr>
              </thead>
              <tbody>
                {datos.contratos.map((c) => {
                  const mio = c.asesorId === usuario?.id && puedeGestionar;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/empresas/${c.clienteId}`}><b>{c.razonSocial}</b></Link>
                        <span className="tenue numeros" style={{ display: 'block' }}>RUC {c.ruc}</span>
                      </td>
                      {verAsesor && <td>{c.asesor ?? <span className="tenue">Sin asesor</span>}{c.equipo && <span className="tenue" style={{ display: 'block' }}>{c.equipo}</span>}</td>}
                      <td>
                        <Link to={`/negociaciones/${c.id}`} className="numeros">{c.codigo}</Link>
                        <span className="tenue" style={{ display: 'block' }}>{c.lineas} {c.lineas === 1 ? 'línea' : 'líneas'} · {soles(c.total)} · {textoPlazo(c.plazoMeses)}</span>
                      </td>
                      <td>
                        <span className={`reno-dias reno-dias--${c.estado === 'RENOVADA' ? 'ok' : urgencia(c.dias)}`}>{c.estado === 'RENOVADA' ? 'Renovado' : textoDias(c.dias)}</span>
                        <span className="tenue" style={{ display: 'block' }}>{fechaLarga(c.fin)}</span>
                      </td>
                      <td>
                        <span className={`chip ${c.estado === 'RENOVADA' ? 'chip--lima' : c.estado === 'EN_NEGOCIACION' ? 'chip--gris' : 'chip--crema'}`}>{TEXTO_ESTADO_RENOVACION[c.estado]}</span>
                        {c.renovacionId && <Link to={`/negociaciones/${c.renovacionId}`} className="numeros reno-enlace">{c.renovacionCodigo}</Link>}
                      </td>
                      <td className="reno-accion">
                        {mio && (c.estado === 'PENDIENTE' || c.estado === 'PERDIDA') && (
                          <button type="button" className="boton" disabled={!!renovando} onClick={() => renovar(c)}>{renovando === c.id ? 'Abriendo…' : 'Renovar'}</button>
                        )}
                        {c.estado === 'EN_NEGOCIACION' && c.renovacionId && <Link to={`/negociaciones/${c.renovacionId}`} className="boton-secundario">Ver renovación</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {vista === 'competencia' && !!datos?.competencia?.length && (
          <div className="tabla-scroll">
            <table className="tabla reno-tabla">
              <thead>
                <tr><th>Empresa</th>{verAsesor && <th>Asesor</th>}<th>Operador actual</th><th>Su contrato vence</th><th aria-label="Acción" /></tr>
              </thead>
              <tbody>
                {datos.competencia.map((c) => {
                  const mio = c.asesorId === usuario?.id && puedeGestionar;
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/empresas/${c.id}`}><b>{c.razonSocial}</b></Link>
                        <span className="tenue numeros" style={{ display: 'block' }}>RUC {c.ruc}</span>
                      </td>
                      {verAsesor && <td>{c.asesor ?? <span className="tenue">Libre en el repositorio</span>}{c.equipo && <span className="tenue" style={{ display: 'block' }}>{c.equipo}</span>}</td>}
                      <td>{c.operador ?? <span className="tenue">No registrado</span>}</td>
                      <td>
                        <span className={`reno-dias reno-dias--${urgencia(c.dias)}`}>{textoDias(c.dias)}</span>
                        <span className="tenue" style={{ display: 'block' }}>{fechaLarga(c.fin)}</span>
                      </td>
                      <td className="reno-accion">
                        {c.negociacionId
                          ? <Link to={`/negociaciones/${c.negociacionId}`} className="boton-secundario">Ver negociación</Link>
                          : mio
                            ? <Link to={`/negociaciones/nueva?empresa=${c.id}`} className="boton">Ofrecer portabilidad</Link>
                            : <Link to={`/empresas/${c.id}`} className="boton-secundario">Ver empresa</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function vacio(vista: Vista, filtro: FiltroRenovacion, ventana: number) {
  if (vista === 'competencia') {
    return filtro === 'proximas' ? `Ningún prospecto termina su contrato en los próximos ${ventana} días.` : 'No hay prospectos con fecha de fin de contrato registrada.';
  }
  if (filtro === 'proximas') return `Ningún contrato vence en los próximos ${ventana} días.`;
  if (filtro === 'vencidas') return 'No hay contratos vencidos sin renovar. ¡Bien!';
  if (filtro === 'renovadas') return 'Todavía no hay contratos renovados.';
  return 'Aún no hay contratos activos con plazo.';
}