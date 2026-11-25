import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi } from '../../api/empresas';
import { negociacionesApi, soles, type Catalogos, type ItemNegociacion, type Modalidad } from '../../api/negociaciones';
import './negociaciones.css';

/** En el formulario los números se editan como texto para no pelear con el cursor */
type Fila = { planId: number | ''; modalidad: Modalidad; operadorOrigenId: number | ''; conEquipo: boolean; cantidad: string; cargo: string };

const filaVacia = (): Fila => ({ planId: '', modalidad: 'NUEVA', operadorOrigenId: '', conEquipo: false, cantidad: '1', cargo: '' });
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const filaValida = (f: Fila) =>
  f.planId !== '' && (f.modalidad === 'NUEVA' || f.operadorOrigenId !== '')
  && Number.isInteger(num(f.cantidad)) && num(f.cantidad) > 0 && num(f.cargo) >= 0;

/** Sirve para crear (/negociaciones/nueva?empresa=…) y para editar (/negociaciones/:id/editar). Montos sin IGV. */
export function FormNegociacion() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const empresaId = params.get('empresa') ?? '';
  const navegar = useNavigate();

  const [cat, setCat] = useState<Catalogos | null>(null);
  const [empresa, setEmpresa] = useState<{ id: string; nombre: string; codigo?: string } | null>(null);
  const [filas, setFilas] = useState<Fila[]>([filaVacia()]);
  const [error, setError] = useState('');
  const [bloqueo, setBloqueo] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const falla = (e: unknown) => setBloqueo(e instanceof ErrorApi ? e.message : 'No se pudo cargar la información');
    negociacionesApi.catalogos().then(setCat).catch(falla);
    if (id) {
      negociacionesApi.detalle(id).then((n) => {
        if (!n.puedeEditar) { setBloqueo('Esta negociación ya no se puede editar.'); return; }
        setEmpresa({ id: n.clienteId, nombre: n.razonSocial, codigo: n.codigo });
        setFilas(n.items.map((i) => ({
          planId: i.planId, modalidad: i.modalidad, operadorOrigenId: i.operadorOrigenId ?? '', conEquipo: i.conEquipo,
          cantidad: String(i.cantidad), cargo: String(i.cargoFijoUnit),
        })));
      }).catch(falla);
    } else if (empresaId) {
      empresasApi.detalle(empresaId).then((e) => {
        if (!e.puedeEditar) { setBloqueo('Solo el asesor a cargo de la empresa puede abrir una negociación.'); return; }
        setEmpresa({ id: e.id, nombre: e.razonSocial });
      }).catch(falla);
    } else {
      setBloqueo('Elige primero la empresa: entra a su ficha y pulsa “Nueva negociación”.');
    }
  }, [id, empresaId]);

  const cambiar = (i: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => {
    if (j !== i) return f;
    const nueva = { ...f, ...cambio };
    // Al elegir un servicio se sugiere su cargo de referencia (si aún no se escribió uno)
    if (cambio.planId !== undefined && f.cargo.trim() === '') {
      const ref = cat?.planes.find((p) => p.id === cambio.planId)?.cargoRef;
      if (ref != null) nueva.cargo = String(ref);
    }
    return nueva;
  }));

  const subtotal = (f: Fila) => (filaValida(f) ? num(f.cantidad) * num(f.cargo) : 0);
  const total = filas.reduce((s, f) => s + subtotal(f), 0);
  const lineas = filas.reduce((s, f) => s + (filaValida(f) ? num(f.cantidad) : 0), 0);
  const portas = filas.reduce((s, f) => s + (filaValida(f) && f.modalidad === 'PORTABILIDAD' ? num(f.cantidad) : 0), 0);
  const conEquipo = filas.reduce((s, f) => s + (filaValida(f) && f.conEquipo ? num(f.cantidad) : 0), 0);
  const listo = filas.length > 0 && filas.every(filaValida);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!empresa || !listo) return;
    setError(''); setGuardando(true);
    const items: ItemNegociacion[] = filas.map((f) => ({
      planId: Number(f.planId), modalidad: f.modalidad, conEquipo: f.conEquipo,
      operadorOrigenId: f.modalidad === 'PORTABILIDAD' ? Number(f.operadorOrigenId) : null,
      cantidad: num(f.cantidad), cargoFijoUnit: Math.round(num(f.cargo) * 100) / 100,
    }));
    try {
      const n = id ? await negociacionesApi.actualizar(id, { items }) : await negociacionesApi.crear(empresa.id, { items });
      navegar(`/negociaciones/${n.id}`, { replace: true, state: { aviso: id ? 'Cambios guardados.' : `Se abrió la negociación ${n.codigo}.` } });
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la negociación');
    } finally {
      setGuardando(false);
    }
  }

  const volver = id ? `/negociaciones/${id}` : empresa ? `/empresas/${empresa.id}` : '/negociaciones';

  if (bloqueo) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
        <div className="alerta" role="alert">{bloqueo}</div>
        <Link to={volver} className="boton-secundario">Volver</Link>
      </div>
    );
  }
  if (!cat || !empresa) return <p style={{ color: 'var(--texto-suave)' }}>Cargando…</p>;

  const moviles = cat.planes.filter((p) => p.tipo === 'MOVIL');
  const fijas = cat.planes.filter((p) => p.tipo === 'FIJA');

  return (
    <>
      <div className="encabezado">
        <nav aria-label="Ruta" style={{ fontSize: 14 }}>
          <Link to={`/empresas/${empresa.id}`} style={{ textDecoration: 'none' }}>{empresa.nombre}</Link>
          <span style={{ color: 'var(--texto-tenue)' }}> / {id ? `Editar ${empresa.codigo}` : 'Nueva negociación'}</span>
        </nav>
        <h1>{id ? 'Editar negociación' : 'Nueva negociación'}</h1>
        <p>Registra los servicios que estás ofreciendo. Todos los montos van <b>sin IGV</b>; el subtotal se calcula solo.</p>
      </div>

      <form onSubmit={guardar} noValidate style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="panel vidrio" style={{ flex: '3 1 860px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 className="h2">Servicios negociados</h2>
          <div className="planes">
            <div className="planes__cabecera" aria-hidden="true">
              <span>Servicio</span><span>Modalidad</span><span>Viene de</span><span>Equipo</span><span>Cantidad</span><span>Cargo sin IGV c/u</span><span style={{ textAlign: 'right' }}>Subtotal</span><span />
            </div>
            {filas.map((f, i) => (
              <div key={i} className="planes__fila">
                <select className="entrada" aria-label={`Servicio ${i + 1}`} value={f.planId}
                  onChange={(e) => cambiar(i, { planId: e.target.value === '' ? '' : Number(e.target.value) })}>
                  <option value="">Elige el servicio</option>
                  {moviles.length > 0 && <optgroup label="Línea móvil">{moviles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>}
                  {fijas.length > 0 && <optgroup label="Línea fija">{fijas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>}
                </select>
                <select className="entrada" aria-label={`Modalidad del servicio ${i + 1}`} value={f.modalidad}
                  onChange={(e) => cambiar(i, { modalidad: e.target.value as Modalidad, operadorOrigenId: '' })}>
                  <option value="NUEVA">Línea nueva</option>
                  <option value="PORTABILIDAD">Portabilidad</option>
                </select>
                <select className="entrada" aria-label={`Operador de origen del servicio ${i + 1}`} value={f.operadorOrigenId}
                  disabled={f.modalidad !== 'PORTABILIDAD'}
                  onChange={(e) => cambiar(i, { operadorOrigenId: e.target.value === '' ? '' : Number(e.target.value) })}>
                  <option value="">{f.modalidad === 'PORTABILIDAD' ? 'Elige operador' : '—'}</option>
                  {cat.operadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
                <select className="entrada" aria-label={`Equipo del servicio ${i + 1}`} value={f.conEquipo ? 'SI' : 'NO'}
                  onChange={(e) => cambiar(i, { conEquipo: e.target.value === 'SI' })}>
                  <option value="NO">Sin equipo</option>
                  <option value="SI">Con equipo</option>
                </select>
                <input className="entrada numeros" aria-label={`Cantidad del servicio ${i + 1}`} inputMode="numeric" value={f.cantidad}
                  onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                <input className="entrada numeros" aria-label={`Cargo sin IGV por unidad del servicio ${i + 1}`} inputMode="decimal" placeholder="S/ 0.00" value={f.cargo}
                  onChange={(e) => cambiar(i, { cargo: e.target.value.replace(',', '.').replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1') })} />
                <span className="planes__subtotal numeros">{soles(subtotal(f))}</span>
                <button type="button" className="boton-quitar" aria-label={`Quitar el servicio ${i + 1}`} disabled={filas.length === 1}
                  onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
          <button type="button" className="boton-secundario" style={{ alignSelf: 'flex-start' }} disabled={filas.length >= 20}
            onClick={() => setFilas((fs) => [...fs, filaVacia()])}>+ Agregar servicio</button>
        </section>

        <aside className="panel vidrio" style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }} className="numeros">{empresa.codigo ?? 'El código OP se asigna al guardar'}</span>
          <b style={{ fontSize: 17 }}>{empresa.nombre}</b>
          <div className="rejilla-2">
            <div className="dato"><span>Total de líneas</span><b className="numeros">{lineas}</b></div>
            <div className="dato"><span>Portabilidades</span><b className="numeros">{portas}</b></div>
            <div className="dato"><span>Líneas nuevas</span><b className="numeros">{lineas - portas}</b></div>
            <div className="dato"><span>Con equipo</span><b className="numeros">{conEquipo}</b></div>
          </div>
          <div className="dato">
            <span>Subtotal sin IGV</span>
            <span className="total-grande numeros">{soles(total)}</span>
            <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>mensual</span>
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          {!listo && <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>Completa servicio, cantidad y cargo de cada fila (y el operador si es portabilidad).</span>}
          <button type="submit" className="boton" disabled={!listo || guardando}>{guardando ? 'Guardando…' : id ? 'Guardar cambios' : 'Abrir negociación'}</button>
          <Link to={volver} className="boton-secundario">Cancelar</Link>
        </aside>
      </form>
    </>
  );
}