import type { Contacto } from '../api/empresas';

/** Teléfono válido: celular (9…) o fijo con código de ciudad (01…, 044…), 9 dígitos */
const telefonoValido = (t: string) => /^[90]\d{8}$/.test(t);

/** Hasta 2 contactos: el 1 es el representante legal (SUNAT) y el 2 es opcional */
export function EditorContactos({ contactos, onChange }: { contactos: Contacto[]; onChange: (c: Contacto[]) => void }) {
  const cambiar = (i: number, campo: keyof Contacto, valor: string) =>
    onChange(contactos.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {contactos.map((c, i) => (
        <div key={i} className="bloque">
          <div className="fila-acciones">
            <b style={{ fontSize: 14 }}>{i === 0 ? 'Representante legal (SUNAT)' : 'Otro contacto'}</b>
            {i === 1 && <button type="button" className="boton-texto" onClick={() => onChange(contactos.slice(0, 1))}>Quitar</button>}
          </div>
          <div className={i === 0 ? 'rejilla-contacto' : 'rejilla-3'}>
            <div className="campo">
              <label htmlFor={`cn${i}`} className="etiqueta">{i === 0 ? 'Nombre completo' : 'Nombre'}</label>
              <input id={`cn${i}`} className="entrada" value={c.nombre} maxLength={100} placeholder={i === 0 ? 'Como figura en SUNAT' : 'Ej. Sr. Pérez'} onChange={(e) => cambiar(i, 'nombre', e.target.value)} />
            </div>
            {i === 0 && (
              <div className="campo">
                <label htmlFor={`cd${i}`} className="etiqueta">DNI</label>
                <input id={`cd${i}`} className="entrada numeros" inputMode="numeric" maxLength={8} value={c.dni ?? ''} placeholder="8 dígitos"
                  onChange={(e) => cambiar(i, 'dni', e.target.value.replace(/\D/g, '').slice(0, 8))} />
              </div>
            )}
            <div className="campo">
              <label htmlFor={`cc${i}`} className="etiqueta">Teléfono</label>
              <input id={`cc${i}`} className="entrada numeros" inputMode="numeric" maxLength={9} value={c.celular} placeholder="Celular o fijo con código (01…)"
                onChange={(e) => cambiar(i, 'celular', e.target.value.replace(/\D/g, '').slice(0, 9))} />
            </div>
            <div className="campo">
              <label htmlFor={`ce${i}`} className="etiqueta">Correo (opcional)</label>
              <input id={`ce${i}`} className="entrada" type="email" value={c.correo ?? ''} placeholder="nombre@empresa.pe" onChange={(e) => cambiar(i, 'correo', e.target.value)} />
            </div>
          </div>
        </div>
      ))}
      {contactos.length < 2 && (
        <button type="button" className="boton-secundario" style={{ alignSelf: 'flex-start', borderStyle: 'dashed' }}
          onClick={() => onChange([...contactos, { nombre: '', celular: '', correo: '' }])}>
          + Agregar otro contacto
        </button>
      )}
    </div>
  );
}

/** Quita los campos vacíos opcionales antes de enviar */
export const limpiarContactos = (cs: Contacto[]) =>
  cs.map((c, i) => ({
    nombre: c.nombre.trim(), celular: c.celular,
    ...(c.correo?.trim() ? { correo: c.correo.trim() } : {}),
    ...(i === 0 && c.dni ? { dni: c.dni } : {}),
  }));

export const contactosCompletos = (cs: Contacto[]) =>
  cs.length >= 1 && cs.every((c) => c.nombre.trim().length >= 2 && telefonoValido(c.celular))
  && (!cs[0].dni || /^\d{8}$/.test(cs[0].dni));