import { useState } from 'react';
import { Link } from 'react-router-dom';
import { exportacionApi, type Reporte } from '../../api/auditoria';
import { ErrorApi } from '../../api/cliente';
import { mesActual, mesLargo, moverMes } from '../../api/tableros';
import './auditoria.css';

interface Tarjeta { tipo: Reporte; titulo: string; descripcion: string; periodo: 'rango' | 'mes' | 'ninguno' }

const REPORTES: Tarjeta[] = [
  { tipo: 'ventas', titulo: 'Ventas ganadas', periodo: 'rango',
    descripcion: 'Cada venta con empresa, asesor, equipo, estado, líneas, portabilidades, cargo fijo, fechas de validación y activación, N° de orden, plazo y fin de contrato.' },
  { tipo: 'negociaciones', titulo: 'Negociaciones', periodo: 'rango',
    descripcion: 'El embudo completo: abiertas o cerradas en el periodo, con etapa, resultado y motivo de pérdida.' },
  { tipo: 'gestiones', titulo: 'Gestiones', periodo: 'rango',
    descripcion: 'Llamadas, WhatsApp, correos y visitas de cada asesor, con su resultado y si la próxima acción se cumplió.' },
  { tipo: 'metas', titulo: 'Metas y avance', periodo: 'mes',
    descripcion: 'Meta de cada asesor, líneas activas, porcentaje de avance, cargo fijo y lo que tiene por activar.' },
  { tipo: 'cartera', titulo: 'Cartera de empresas', periodo: 'ninguno',
    descripcion: 'Todas las empresas del CRM con su ubicación, estado, asesor a cargo y última gestión.' },
];

/** Últimos 24 meses para los desplegables (más reciente primero) */
const MESES = Array.from({ length: 24 }, (_, i) => moverMes(mesActual(), -i));

/** Solo gerencia: descarga de reportes en Excel. Cada descarga queda en la bitácora. */
export function Exportar() {
  return (
    <>
      <div className="encabezado">
        <h1>Exportar datos</h1>
        <p>Solo gerencia puede descargar información del CRM. Cada archivo lleva tu nombre y la descarga queda registrada en la <Link to="/bitacora">bitácora</Link>.</p>
      </div>
      <div className="exportar-rejilla">
        {REPORTES.map((r) => <TarjetaReporte key={r.tipo} r={r} />)}
      </div>
    </>
  );
}

function TarjetaReporte({ r }: { r: Tarjeta }) {
  const [desde, setDesde] = useState(mesActual());
  const [hasta, setHasta] = useState(mesActual());
  const [contactos, setContactos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  const rangoMalo = r.periodo === 'rango' && hasta < desde;

  async function descargar() {
    setOcupado(true); setError(''); setAviso('');
    try {
      const d = await exportacionApi.descargar(r.tipo, {
        desde: r.periodo === 'ninguno' ? undefined : desde,
        hasta: r.periodo === 'rango' ? hasta : undefined,
        contactos: r.tipo === 'cartera' ? contactos : undefined,
      });
      setAviso(`Descargado: ${d.nombre} · ${d.filas} ${d.filas === 1 ? 'fila' : 'filas'}`);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo exportar');
    } finally {
      setOcupado(false);
    }
  }

  const selectorMes = (id: string, etiqueta: string, valor: string, cambiar: (v: string) => void) => (
    <div className="campo">
      <label htmlFor={id} className="etiqueta">{etiqueta}</label>
      <select id={id} className="entrada" value={valor} onChange={(e) => cambiar(e.target.value)}>
        {MESES.map((m) => <option key={m} value={m}>{mesLargo(m)}</option>)}
      </select>
    </div>
  );

  return (
    <section className="panel vidrio exportar-tarjeta">
      <h2 className="h2">{r.titulo}</h2>
      <p className="exportar-tarjeta__texto">{r.descripcion}</p>

      {r.periodo === 'rango' && (
        <div className="rejilla-2">
          {selectorMes(`desde-${r.tipo}`, 'Desde', desde, setDesde)}
          {selectorMes(`hasta-${r.tipo}`, 'Hasta', hasta, setHasta)}
        </div>
      )}
      {r.periodo === 'mes' && selectorMes(`mes-${r.tipo}`, 'Mes', desde, setDesde)}
      {r.tipo === 'cartera' && (
        <label className="casilla">
          <input type="checkbox" checked={contactos} onChange={(e) => setContactos(e.target.checked)} />
          Incluir contactos (nombres, celulares y correos)
        </label>
      )}

      {rangoMalo && <div className="alerta" role="alert">El mes final no puede ser anterior al inicial.</div>}
      {error && <div className="alerta" role="alert">{error}</div>}
      {aviso && <div className="aviso" role="status">{aviso}</div>}

      <button type="button" className="boton exportar-tarjeta__boton" disabled={ocupado || rangoMalo} onClick={descargar}>
        {ocupado ? 'Preparando el Excel…' : 'Descargar Excel'}
      </button>
    </section>
  );
}