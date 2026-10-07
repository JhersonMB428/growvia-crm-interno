import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ACCIONES_ALERTA, bitacoraApi, TEXTO_ACCION, type Categoria, type FiltrosBitacora, type RegistroBitacora } from '../../api/auditoria';
import { ErrorApi } from '../../api/cliente';
import { TEXTO_DOCUMENTO, type TipoDocumento } from '../../api/expediente';
import { TEXTO_CANAL, TEXTO_RESULTADO, type Canal, type ResultadoGestion } from '../../api/gestiones';
import { TEXTO_ETAPA, type Etapa } from '../../api/negociaciones';
import { TEXTO_EVENTO, type EventoPosventa } from '../../api/validacion';
import './auditoria.css';

const CATEGORIAS: [Categoria | '', string][] = [
  ['', 'Todo'], ['accesos', 'Accesos'], ['empresas', 'Empresas'], ['ventas', 'Ventas'], ['documentos', 'Documentos'], ['datos', 'Bases y exportaciones'],
];
const REPORTE: Record<string, string> = { ventas: 'Ventas', negociaciones: 'Negociaciones', gestiones: 'Gestiones', cartera: 'Cartera', metas: 'Metas' };

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** El detalle de cada acción, en palabras */
function detalle(r: RegistroBitacora): string {
  const d = r.detalle ?? {};
  switch (r.accion) {
    case 'EXPORTAR': return `${REPORTE[String(d.tipo)] ?? d.tipo} · ${d.periodo ?? ''} · ${d.filas ?? 0} filas${d.contactos ? ' · con contactos' : ''}`;
    case 'LOGIN_FALLIDO': case 'LOGIN_BLOQUEADO': return String(d.email ?? '');
    case 'LOGIN': return d.conCodigo ? 'Con código al correo' : 'Equipo de confianza';
    case 'ACCESO_DENEGADO': return String(d.ruta ?? '');
    case 'EMPRESA_REASIGNAR': return r.otroUsuario ? `a ${r.otroUsuario}` : '';
    case 'EMPRESA_CORREGIR': return String(d.razonSocial ?? '');
    case 'EMPRESA_CREAR': return `RUC ${d.ruc ?? ''}`;
    case 'NEGOCIACION_CERRAR': return d.resultado === 'GANADA' ? 'Ganada' : `Perdida${d.motivoPerdida ? `: ${d.motivoPerdida}` : ''}`;
    case 'NEGOCIACION_ETAPA': return TEXTO_ETAPA[d.etapa as Etapa] ?? '';
    case 'VENTA_OBSERVAR': case 'VENTA_DETENER': case 'BASE_RECHAZAR': return String(d.comentario ?? d.motivo ?? '');
    case 'VENTA_POSVENTA': return `${TEXTO_EVENTO[d.evento as EventoPosventa] ?? d.evento}${d.ordenOperador ? ` · orden ${d.ordenOperador}` : ''}`;
    case 'DOCUMENTO_SUBIR': return TEXTO_DOCUMENTO[d.tipo as TipoDocumento] ?? '';
    case 'GESTION_REGISTRAR': return `${TEXTO_CANAL[d.canal as Canal] ?? ''} · ${TEXTO_RESULTADO[d.resultado as ResultadoGestion] ?? ''}`;
    case 'META_DEFINIR': return `${d.alcance === 'EQUIPO' ? 'Equipo' : 'Asesor'} · ${d.mes} · ${d.metaLineas} líneas`;
    case 'BASE_SUBIR': return r.otroUsuario ? `para ${r.otroUsuario}` : d.asignarA === 'repositorio' ? 'al repositorio' : '';
    case 'OTRA': return String(d.ruta ?? '');
    default: return '';
  }
}

/** Enlace a la ficha de lo que se tocó */
function enlace(r: RegistroBitacora) {
  if (!r.enlaceId) return null;
  if (r.entidad === 'EMPRESA') return `/empresas/${r.enlaceId}`;
  if (r.entidad === 'NEGOCIACION' || r.entidad === 'DOCUMENTO') return `/negociaciones/${r.enlaceId}`;
  if (r.entidad === 'CARGA') return `/bases/${r.enlaceId}`;
  return null;
}

/** Gerencia y administración: quién hizo qué, cuándo y desde dónde. No se puede modificar ni borrar. */
export function Bitacora() {
  const [f, setF] = useState<FiltrosBitacora>({ pagina: 1 });
  const [datos, setDatos] = useState<{ total: number; pagina: number; paginas: number; filas: RegistroBitacora[] } | null>(null);
  const [usuarios, setUsuarios] = useState<{ id: string; nombre: string; rol: string }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { bitacoraApi.usuarios().then(setUsuarios).catch(() => undefined); }, []);
  useEffect(() => {
    setDatos(null);
    bitacoraApi.listar(f).then((d) => { setDatos(d); setError(''); })
      .catch((e) => setError(e instanceof ErrorApi ? e.message : 'No se pudo cargar la bitácora'));
  }, [f]);

  const cambiar = (c: Partial<FiltrosBitacora>) => setF((x) => ({ ...x, ...c, pagina: c.pagina ?? 1 }));
  const hayFiltros = !!(f.categoria || f.usuarioId || f.desde || f.hasta);

  return (
    <>
      <div className="encabezado">
        <h1>Bitácora</h1>
        <p>Quién hizo qué, cuándo y desde dónde. Los registros no se pueden modificar ni borrar.</p>
      </div>

      <section className="panel vidrio" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="pestanas" role="group" aria-label="Tipo de acción" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
          {CATEGORIAS.map(([c, t]) => (
            <button key={c || 'todo'} type="button" className={`pestana${(f.categoria ?? '') === c ? ' pestana--activa' : ''}`}
              aria-pressed={(f.categoria ?? '') === c} onClick={() => cambiar({ categoria: c || undefined })}>{t}</button>
          ))}
        </div>

        <div className="bitacora-filtros">
          <div className="campo">
            <label htmlFor="b-usuario" className="etiqueta">Usuario</label>
            <select id="b-usuario" className="entrada" value={f.usuarioId ?? ''} onChange={(e) => cambiar({ usuarioId: e.target.value || undefined })}>
              <option value="">Todos</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="b-desde" className="etiqueta">Desde</label>
            <input id="b-desde" type="date" className="entrada" value={f.desde ?? ''} onChange={(e) => cambiar({ desde: e.target.value || undefined })} />
          </div>
          <div className="campo">
            <label htmlFor="b-hasta" className="etiqueta">Hasta</label>
            <input id="b-hasta" type="date" className="entrada" value={f.hasta ?? ''} onChange={(e) => cambiar({ hasta: e.target.value || undefined })} />
          </div>
          {hayFiltros && <button type="button" className="boton-secundario" onClick={() => setF({ pagina: 1 })}>Limpiar filtros</button>}
        </div>

        {error && <div className="alerta" role="alert">{error}</div>}
        {!datos && !error && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>Cargando…</p>}
        {datos?.filas.length === 0 && <p style={{ margin: 0, color: 'var(--texto-suave)' }}>No hay registros con estos filtros.</p>}

        {datos && datos.filas.length > 0 && (
          <div className="tabla-scroll">
            <table className="tabla bitacora-tabla">
              <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Sobre</th><th>Detalle</th><th>IP</th></tr></thead>
              <tbody>
                {datos.filas.map((r) => {
                  const ruta = enlace(r);
                  return (
                    <tr key={r.id}>
                      <td className="numeros" style={{ whiteSpace: 'nowrap' }}>{fechaHora(r.fecha)}</td>
                      <td>
                        {r.usuario ? <><b>{r.usuario}</b><span className="tenue" style={{ display: 'block', fontSize: 12 }}>{r.rol}</span></> : <span className="tenue">Desconocido</span>}
                      </td>
                      <td><span className={`chip ${ACCIONES_ALERTA.has(r.accion) ? 'chip--crema' : 'chip--gris'}`}>{TEXTO_ACCION[r.accion] ?? r.accion}</span></td>
                      <td className="bitacora-tabla__sobre">{r.referencia ? (ruta ? <Link to={ruta}>{r.referencia}</Link> : r.referencia) : <span className="tenue">—</span>}</td>
                      <td className="bitacora-tabla__detalle">{detalle(r) || <span className="tenue">—</span>}</td>
                      <td className="numeros tenue">{r.ip ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {datos && datos.paginas > 1 && (
          <div className="paginacion">
            <span>{datos.total} registros · página {datos.pagina} de {datos.paginas}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="boton-secundario" disabled={datos.pagina <= 1} onClick={() => cambiar({ pagina: datos.pagina - 1 })}>Anterior</button>
              <button type="button" className="boton-secundario" disabled={datos.pagina >= datos.paginas} onClick={() => cambiar({ pagina: datos.pagina + 1 })}>Siguiente</button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}