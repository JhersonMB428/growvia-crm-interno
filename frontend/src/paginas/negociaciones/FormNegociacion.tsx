import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorApi } from '../../api/cliente';
import { empresasApi } from '../../api/empresas';
import {
  negociacionesApi, soles, type Catalogos, type ItemNegociacion, type Modalidad,
} from '../../api/negociaciones';
import './negociaciones.css';

type Tipo = 'NUEVA' | 'AMPLIACION';
/** En el formulario los números se editan como texto para no pelear con el cursor */
type Fila = { planId: number | ''; modalidad: Modalidad; operadorOrigenId: number | ''; cantidad: string; cargo: string };

const filaVacia = (): Fila => ({ planId: '', modalidad: 'NUEVA', operadorOrigenId: '', cantidad: '1', cargo: '' });
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const filaValida = (f: Fila) =>
  f.planId !== '' && (f.modalidad === 'NUEVA' || f.operadorOrigenId !== '')
  && Number.isInteger(num(f.cantidad)) && num(f.cantidad) > 0 && num(f.cargo) >= 0;

/** Sirve para crear (/negociaciones/nueva?empresa=…) y para editar (/negociaciones/:id/editar) */
export function FormNegociacion() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const empresaId = params.get('empresa') ?? '';
  const navegar = useNavigate();

  const [cat, setCat] = useState<Catalogos | null>(null);
  const [empresa, setEmpresa] = useState<{ id: string; nombre: string; codigo?: string } | null>(null);
  const [tipo, setTipo] = useState<Tipo>('NUEVA');
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
        setTipo(n.tipo);
        setFilas(n.items.map((i) => ({
          planId: i.planId, modalidad: i.modalidad, operadorOrigenId: i.operadorOrigenId ?? '',
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
    // Al elegir un plan se sugiere su cargo fijo de referencia (si aún no se escribió uno)
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
  const listo = filas.length > 0 && filas.every(filaValida);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!empresa || !listo) return;
    setError(''); setGuardando(true);
    const items: ItemNegociacion[] = filas.map((f) => ({
      planId: Number(f.planId), modalidad: f.modalidad,
      operadorOrigenId: f.modalidad === 'PORTABILIDAD' ? Number(f.operadorOrigenId) : null,
      cantidad: num(f.cantidad), cargoFijoUnit: Math.round(num(f.cargo) * 100) / 100,
    }));
    try {
      const n = id
        ? await negociacionesApi.actualizar(id, { tipo, items })
        : await negociacionesApi.crear(empresa.id, { tipo, items });
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
        <p>Registra los planes que estás ofreciendo. El total se calcula solo.</p>
      </div>

      <form onSubmit={guardar} noValidate style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="panel vidrio" style={{ flex: '3 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2">Tipo de negociación</h2>
            <div className="pestanas" role="radiogroup" aria-label="Tipo de negociación" style={{ alignSelf: 'flex-start' }}>
              {(['NUEVA', 'AMPLIACION'] as Tipo[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={tipo === t}
                  className={`pestana${tipo === t ? ' pestana--activa' : ''}`} onClick={() => setTipo(t)}>
                  {t === 'NUEVA' ? 'Nueva' : 'Ampliación'}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>
              {tipo === 'NUEVA' ? 'La empresa aún no tiene servicios con nosotros.' : 'La empresa ya es cliente y suma más líneas o servicios.'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 className="h2">Planes negociados</h2>
            <div className="planes">
              <div className="planes__cabecera" aria-hidden="true">
                <span>Plan</span><span>Modalidad</span><span>Viene de</span><span>Cantidad</span><span>Cargo fijo c/u</span><span style={{ textAlign: 'right' }}>Subtotal</span><span />
              </div>
              {filas.map((f, i) => (
                <div key={i} className="planes__fila">
                  <select className="entrada" aria-label={`Plan ${i + 1}`} value={f.planId}
                    onChange={(e) => cambiar(i, { planId: e.target.value === '' ? '' : Number(e.target.value) })}>
                    <option value="">Elige el plan</option>
                    {moviles.length > 0 && <optgroup label="Línea móvil">{moviles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>}
                    {fijas.length > 0 && <optgroup label="Línea fija">{fijas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>}
                  </select>
                  <select className="entrada" aria-label={`Modalidad del plan ${i + 1}`} value={f.modalidad}
                    onChange={(e) => cambiar(i, { modalidad: e.target.value as Modalidad, operadorOrigenId: '' })}>
                    <option value="NUEVA">Línea nueva</option>
                    <option value="PORTABILIDAD">Portabilidad</option>
                  </select>
                  <select className="entrada" aria-label={`Operador de origen del plan ${i + 1}`} value={f.operadorOrigenId}
                    disabled={f.modalidad !== 'PORTABILIDAD'}
                    onChange={(e) => cambiar(i, { operadorOrigenId: e.target.value === '' ? '' : Number(e.target.value) })}>
                    <option value="">{f.modalidad === 'PORTABILIDAD' ? 'Elige operador' : '—'}</option>
                    {cat.operadores.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                  <input className="entrada numeros" aria-label={`Cantidad del plan ${i + 1}`} inputMode="numeric" value={f.cantidad}
                    onChange={(e) => cambiar(i, { cantidad: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                  <input className="entrada numeros" aria-label={`Cargo fijo por unidad del plan ${i + 1}`} inputMode="decimal" placeholder="S/ 0.00" value={f.cargo}
                    onChange={(e) => cambiar(i, { cargo: e.target.value.replace(',', '.').replace(/[^\d.]/g, '').replace(/^(\d*\.\d{0,2}).*$/, '$1') })} />
                  <span className="planes__subtotal numeros">{soles(subtotal(f))}</span>
                  <button type="button" className="boton-quitar" aria-label={`Quitar el plan ${i + 1}`} disabled={filas.length === 1}
                    onClick={() => setFilas((fs) => fs.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
            <button type="button" className="boton-secundario" style={{ alignSelf: 'flex-start' }} disabled={filas.length >= 20}
              onClick={() => setFilas((fs) => [...fs, filaVacia()])}>+ Agregar plan</button>
          </div>
        </section>

        <aside className="panel vidrio" style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 16 }}>
          <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }} className="numeros">{empresa.codigo ?? 'El código OP se asigna al guardar'}</span>
          <b style={{ fontSize: 17 }}>{empresa.nombre}</b>
          <div className="rejilla-2">
            <div className="dato"><span>Tipo</span><b>{tipo === 'NUEVA' ? 'Nueva' : 'Ampliación'}</b></div>
            <div className="dato"><span>Total de líneas</span><b className="numeros">{lineas}</b></div>
            <div className="dato"><span>Portabilidades</span><b className="numeros">{portas}</b></div>
            <div className="dato"><span>Líneas nuevas</span><b className="numeros">{lineas - portas}</b></div>
          </div>
          <div className="dato">
            <span>Cargo fijo total</span>
            <span className="total-grande numeros">{soles(total)}</span>
            <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>mensual</span>
          </div>
          {error && <div className="alerta" role="alert">{error}</div>}
          {!listo && <span style={{ fontSize: 13, color: 'var(--texto-tenue)' }}>Completa plan, cantidad y cargo fijo de cada fila (y el operador si es portabilidad).</span>}
          <button type="submit" className="boton" disabled={!listo || guardando}>{guardando ? 'Guardando…' : id ? 'Guardar cambios' : 'Abrir negociación'}</button>
          <Link to={volver} className="boton-secundario">Cancelar</Link>
        </aside>
      </form>
    </>
  );
}