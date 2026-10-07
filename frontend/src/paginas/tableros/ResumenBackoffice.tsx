import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { validacionApi, type ResumenBackoffice as Resumen } from '../../api/validacion';
import { pct } from '../../api/tableros';
import { Columnas } from '../../componentes/graficos';
import { useSesion } from '../../sesion/SesionContext';
import './tableros.css';

/** "2026-10-07" → "7/10" */
const diaCorto = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** Inicio de back office con los indicadores de su perfil de puesto */
export function ResumenBackoffice() {
  const { usuario } = useSesion();
  const [r, setR] = useState<Resumen | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    validacionApi.resumen().then(setR).catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar el resumen'));
  }, []);

  if (error) return <div className="alerta" role="alert">{error}</div>;
  if (!r) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  const errores = pct(r.observadasMes, r.validadasMes + r.observadasMes);
  const exito = pct(r.activas90, r.validadas90);

  return (
    <>
      <div className="fila-acciones" style={{ padding: '8px 4px 0', alignItems: 'flex-end' }}>
        <div className="encabezado" style={{ padding: 0 }}>
          <h1>Hola, {usuario?.nombres.split(' ')[0]}</h1>
          <p className="saludo">
            {r.porValidar ? <>Tienes <b>{r.porValidar} {r.porValidar === 1 ? 'venta' : 'ventas'} por validar</b> y {r.enPosventa} en posventa.</> : 'No hay ventas esperando validación.'}
          </p>
        </div>
        <Link to="/validacion" className="boton">Validar ventas{r.porValidar ? ` · ${r.porValidar}` : ''}</Link>
      </div>

      <div className="kpis kpis--seis">
        <section className="kpi vidrio">
          <span className="kpi__titulo">Validadas hoy</span>
          <span className="kpi__valor numeros">{r.validadasHoy}</span>
          <span className="kpi__detalle">{r.validadasMes} en el mes</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Tiempo de procesamiento</span>
          <span className="kpi__valor numeros">{r.horasProcesamiento} <small>h</small></span>
          <span className="kpi__detalle">promedio desde la aprobación del supervisor</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Errores detectados</span>
          <span className="kpi__valor numeros">{errores ?? 0}%</span>
          <span className="kpi__detalle">{r.observadasMes} observadas por back office este mes</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Activaciones del mes</span>
          <span className="kpi__valor numeros">{r.activadasMes}</span>
          <span className="kpi__detalle">{r.diasActivacion} días promedio desde la validación</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">Activaciones exitosas</span>
          <span className="kpi__valor numeros">{exito ?? 0}%</span>
          <span className="kpi__detalle">{r.activas90} de {r.validadas90} validadas (90 días)</span>
        </section>
        <section className="kpi vidrio">
          <span className="kpi__titulo">En posventa</span>
          <span className="kpi__valor numeros">{r.enPosventa}</span>
          <span className="kpi__detalle">esperan chips, portabilidad o activación</span>
        </section>
      </div>

      <div className="rejilla-tablero">
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel-titulo"><h2 className="h2">Validadas por día</h2><span>Últimos 14 días</span></div>
          <Columnas titulo="Ventas validadas por día" datos={r.porDia.map((d) => ({ etiqueta: diaCorto(d.dia), valor: d.validadas }))} />
        </section>
        <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="panel-titulo"><h2 className="h2">Las que más esperan</h2><span>Por validar</span></div>
          {r.esperando.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Nada pendiente. ¡Al día!</p>}
          {r.esperando.map((e) => (
            <div key={e.id} className="alerta-item">
              <b className="numeros" style={{ fontSize: 17, minWidth: 48 }}>{e.horas ?? 0} h</b>
              <span style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/negociaciones/${e.id}`} style={{ textDecoration: 'none', fontWeight: 700, color: 'var(--texto)' }}>{e.razonSocial}</Link>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--texto-suave)' }}>{e.codigo} · {e.asesor}</span>
              </span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}