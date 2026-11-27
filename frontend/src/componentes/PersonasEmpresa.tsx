import { useState, type FormEvent } from 'react';
import { ErrorApi } from '../api/cliente';
import { empresasApi, ESTADOS_MEDIO, type Contacto, type EmpresaDetalle, type EstadoMedio, type Medio, type PersonaNueva } from '../api/empresas';
import { etiquetaPersona, telefonoLegible } from '../utilidades/personas';
import './personas.css';

const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

const ORIGEN: Record<string, string> = { SUNAT: 'De SUNAT', BASE: 'De la base cargada', ASESORA: 'Agregada por el equipo' };

interface Props {
  e: EmpresaDetalle;
  editable: boolean;
  onCambio: (d: EmpresaDetalle, aviso: string) => void;
}

/**
 * Todas las personas de la empresa (sin límite) y sus teléfonos y correos.
 * La asesora marca quién decide la compra, agrega a quien de verdad decide y anota qué número funciona.
 */
export function PersonasEmpresa({ e, editable, onCambio }: Props) {
  const personas = e.contactos ?? [];
  const [formulario, setFormulario] = useState<{ id: string | null; datos: PersonaNueva } | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<EmpresaDetalle>, aviso: string) {
    setOcupado(true); setError('');
    try { onCambio(await accion(), aviso); setFormulario(null); }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar'); }
    finally { setOcupado(false); }
  }

  const datosDe = (c: Contacto): PersonaNueva => ({
    nombre: c.nombre, cargo: c.cargo ?? '', celular: c.celular ?? '', correo: c.correo ?? '', dni: c.dni ?? '', decisor: !!c.decisor, nota: c.nota ?? '',
  });
  const limpiar = (p: PersonaNueva): PersonaNueva => ({
    nombre: p.nombre.trim(), cargo: p.cargo?.trim() || undefined, celular: p.celular?.replace(/\D/g, '') || undefined,
    correo: p.correo?.trim() || undefined, dni: p.dni?.replace(/\D/g, '') || undefined, decisor: !!p.decisor, nota: p.nota?.trim() || undefined,
  });

  function guardarFormulario(ev: FormEvent) {
    ev.preventDefault();
    if (!formulario) return;
    const datos = limpiar(formulario.datos);
    if (datos.nombre.length < 2) { setError('Escribe el nombre de la persona'); return; }
    if (formulario.id) ejecutar(() => empresasApi.editarPersona(e.id, formulario.id!, datos), `Se guardaron los datos de ${datos.nombre}.`);
    else ejecutar(() => empresasApi.agregarPersona(e.id, datos), `${datos.nombre} se agregó a la empresa.`);
  }

  const decisores = personas.filter((c) => c.decisor);

  return (
    <div className="personas">
      <div className="fila-acciones">
        <h2 className="h2">Personas de contacto <span className="chip chip--gris">{personas.length}</span></h2>
        {editable && !formulario && (
          <button type="button" className="boton-secundario" onClick={() => { setError(''); setFormulario({ id: null, datos: { nombre: '', decisor: false } }); }}>
            + Agregar persona
          </button>
        )}
      </div>
      {editable && personas.length > 0 && decisores.length === 0 && (
        <p className="personas__ayuda">¿Sabes quién toma la decisión de compra? Márcalo con <b>“Decide la compra”</b>, o agrégalo si no está en la lista.</p>
      )}

      {formulario && (
        <FormPersona
          titulo={formulario.id ? 'Editar persona' : 'Nueva persona de contacto'}
          datos={formulario.datos}
          telefonoObligatorio={personas.find((c) => c.id === formulario.id)?.posicion === 2}
          ocupado={ocupado}
          onChange={(datos) => setFormulario({ ...formulario, datos })}
          onGuardar={guardarFormulario}
          onCancelar={() => { setFormulario(null); setError(''); }}
        />
      )}
      {error && <div className="alerta" role="alert">{error}</div>}

      <div className="personas__lista">
        {personas.map((c) => (
          <article key={c.id} className={`persona${c.decisor ? ' persona--decisor' : ''}`}>
            <div className="persona__cabecera">
              <span className="persona__rol">{etiquetaPersona(c)}</span>
              {c.decisor && <span className="chip chip--lima">★ Decide la compra</span>}
            </div>
            <b className="persona__nombre">{c.nombre}</b>
            {c.posicion !== undefined && c.posicion <= 2 && c.cargo && <span className="persona__dato">{c.cargo}</span>}
            {c.dni && <span className="persona__dato numeros">DNI {c.dni}</span>}
            {c.celular
              ? <a href={`tel:${c.celular}`} className="numeros persona__enlace">{telefonoLegible(c.celular)}</a>
              : <span className="persona__dato persona__dato--falta">Sin teléfono propio</span>}
            {c.correo && <a href={`mailto:${c.correo}`} className="persona__enlace">{c.correo}</a>}
            {c.nota && <span className="persona__nota">“{c.nota}”</span>}
            <span className="persona__meta">
              {c.origen === 'ASESORA' && c.creadoPor ? `Agregada por ${c.creadoPor}` : ORIGEN[c.origen ?? ''] ?? ''}
              {c.ultimaGestion ? ` · última gestión con ella: ${fechaCorta(c.ultimaGestion)}` : ''}
            </span>
            {editable && (
              <div className="persona__acciones">
                <button type="button" className="boton-texto" disabled={ocupado}
                  onClick={() => ejecutar(() => empresasApi.editarPersona(e.id, c.id!, limpiar({ ...datosDe(c), decisor: !c.decisor })),
                    c.decisor ? `${c.nombre} ya no figura como quien decide.` : `${c.nombre} quedó como quien decide la compra.`)}>
                  {c.decisor ? 'Ya no decide' : '★ Decide la compra'}
                </button>
                <button type="button" className="boton-texto" disabled={ocupado}
                  onClick={() => { setError(''); setFormulario({ id: c.id!, datos: datosDe(c) }); }}>Editar</button>
                {(c.posicion ?? 1) > 2 && (
                  <button type="button" className="boton-texto boton-texto--peligro" disabled={ocupado}
                    onClick={() => { if (confirm(`¿Quitar a ${c.nombre} de esta empresa?`)) ejecutar(() => empresasApi.quitarPersona(e.id, c.id!), `${c.nombre} se quitó de la empresa.`); }}>
                    Quitar
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
        {!personas.length && <p className="personas__ayuda">Todavía no hay personas de contacto registradas.</p>}
      </div>

      <MediosEmpresa e={e} editable={editable} onCambio={onCambio} />
    </div>
  );
}

function FormPersona({ titulo, datos, telefonoObligatorio, ocupado, onChange, onGuardar, onCancelar }: {
  titulo: string; datos: PersonaNueva; telefonoObligatorio: boolean; ocupado: boolean;
  onChange: (d: PersonaNueva) => void; onGuardar: (e: FormEvent) => void; onCancelar: () => void;
}) {
  const campo = (k: keyof PersonaNueva) => (ev: { target: { value: string } }) => onChange({ ...datos, [k]: ev.target.value });
  return (
    <form className="persona-form" onSubmit={onGuardar} noValidate>
      <h3 className="persona-form__titulo">{titulo}</h3>
      <div className="rejilla-2">
        <div className="campo">
          <label htmlFor="persona-nombre" className="etiqueta obligatorio">Nombre completo</label>
          <input id="persona-nombre" className="entrada" maxLength={100} value={datos.nombre} onChange={campo('nombre')} autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="persona-cargo" className="etiqueta">Cargo</label>
          <input id="persona-cargo" className="entrada" maxLength={80} value={datos.cargo ?? ''} onChange={campo('cargo')} placeholder="Ej. Jefe de compras, Gerente de TI" />
        </div>
        <div className="campo">
          <label htmlFor="persona-telefono" className={`etiqueta${telefonoObligatorio ? ' obligatorio' : ''}`}>Teléfono</label>
          <input id="persona-telefono" className="entrada numeros" inputMode="tel" maxLength={12} value={datos.celular ?? ''} onChange={campo('celular')} placeholder="9XXXXXXXX o fijo 01XXXXXXX" />
        </div>
        <div className="campo">
          <label htmlFor="persona-correo" className="etiqueta">Correo</label>
          <input id="persona-correo" className="entrada" type="email" maxLength={150} value={datos.correo ?? ''} onChange={campo('correo')} />
        </div>
        <div className="campo">
          <label htmlFor="persona-dni" className="etiqueta">DNI</label>
          <input id="persona-dni" className="entrada numeros" inputMode="numeric" maxLength={8} value={datos.dni ?? ''} onChange={(ev) => onChange({ ...datos, dni: ev.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="campo">
          <label htmlFor="persona-nota" className="etiqueta">Nota</label>
          <input id="persona-nota" className="entrada" maxLength={200} value={datos.nota ?? ''} onChange={campo('nota')} placeholder="Ej. Contestar después de las 3 p. m." />
        </div>
      </div>
      <label className="casilla">
        <input type="checkbox" checked={!!datos.decisor} onChange={(ev) => onChange({ ...datos, decisor: ev.target.checked })} />
        Esta persona decide la compra
      </label>
      <div className="fila-acciones" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="boton" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

/** Teléfonos y correos de la empresa: la asesora anota cuál funciona para no volver a intentar los que no */
function MediosEmpresa({ e, editable, onCambio }: Props) {
  const medios = e.medios ?? [];
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<EmpresaDetalle>, aviso: string) {
    setOcupado(true); setError('');
    try { onCambio(await accion(), aviso); return true; }
    catch (err) { setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar'); return false; }
    finally { setOcupado(false); }
  }

  async function agregar(ev: FormEvent) {
    ev.preventDefault();
    const v = nuevo.trim();
    if (!v) return;
    if (await ejecutar(() => empresasApi.agregarMedio(e.id, v.includes('@') ? 'CORREO' : 'TELEFONO', v), 'Se agregó a la lista.')) setNuevo('');
  }

  const telefonos = medios.filter((m) => m.tipo === 'TELEFONO');
  const correos = medios.filter((m) => m.tipo === 'CORREO');
  const fila = (m: Medio) => (
    <li key={m.id} className={`medio medio--${m.estado.toLowerCase()}`}>
      <a href={m.tipo === 'TELEFONO' ? `tel:${m.valor}` : `mailto:${m.valor}`} className="medio__valor numeros">
        {m.tipo === 'TELEFONO' ? telefonoLegible(m.valor) : m.valor}
      </a>
      {editable ? (
        <select className="entrada medio__estado" aria-label={`Estado de ${m.valor}`} value={m.estado} disabled={ocupado}
          onChange={(ev) => ejecutar(() => empresasApi.estadoMedio(e.id, m.id, ev.target.value as EstadoMedio), 'Estado actualizado.')}>
          {ESTADOS_MEDIO.map((x) => <option key={x.valor} value={x.valor}>{x.texto}</option>)}
        </select>
      ) : (
        <span className={`chip ${m.estado === 'FUNCIONA' ? 'chip--lima' : m.estado === 'SIN_PROBAR' ? 'chip--gris' : 'chip--crema'}`}>
          {ESTADOS_MEDIO.find((x) => x.valor === m.estado)?.texto}
        </span>
      )}
      <span className="medio__meta">
        {m.actualizadoPor ? `${m.actualizadoPor} · ${fechaCorta(m.actualizadoAt)}` : ORIGEN[m.origen]}
      </span>
    </li>
  );

  return (
    <div className="medios">
      <h3 className="h3">Teléfonos y correos de la empresa</h3>
      <p className="personas__ayuda">
        Prueba uno por uno. Al registrar una gestión con un número, se marca solo: <b>funciona</b> si contestaron, <b>no contesta</b> si no.
      </p>
      {!medios.length && <p className="personas__ayuda">Sin teléfonos ni correos registrados.</p>}
      {telefonos.length > 0 && <ul className="medios__lista" aria-label="Teléfonos">{telefonos.map(fila)}</ul>}
      {correos.length > 0 && <ul className="medios__lista" aria-label="Correos">{correos.map(fila)}</ul>}
      {editable && (
        <form className="medios__agregar" onSubmit={agregar}>
          <label htmlFor="medio-nuevo" className="oculto-visual">Agregar teléfono o correo</label>
          <input id="medio-nuevo" className="entrada" placeholder="Agregar teléfono o correo" maxLength={150} value={nuevo} onChange={(ev) => setNuevo(ev.target.value)} />
          <button type="submit" className="boton-secundario" disabled={ocupado || !nuevo.trim()}>Agregar</button>
        </form>
      )}
      {error && <div className="alerta" role="alert">{error}</div>}
    </div>
  );
}
