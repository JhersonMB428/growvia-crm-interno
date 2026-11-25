import type { Contacto } from '../api/empresas';
import { problemaCorreo, problemaDni, problemaTelefono } from '../utilidades/validacion';
import { AyudaCampo } from './Faltantes';

/** Problemas de un contacto, campo por campo ('' = bien) */
function problemasDe(c: Contacto, i: number, telefonoRepOpcional = false) {
  const tel = c.celular ?? '';
  return {
    nombre: c.nombre.trim().length >= 2 ? '' : c.nombre.trim() ? 'El nombre es muy corto' : 'Escribe el nombre',
    dni: i === 0 ? problemaDni(c.dni ?? '') : '',
    // El representante puede quedar sin teléfono al editar (llegó desde SUNAT); aparece como "Falta: teléfono"
    celular: i === 0 && telefonoRepOpcional && !tel ? '' : problemaTelefono(tel),
    correo: problemaCorreo(c.correo ?? ''),
  };
}

const NOMBRE_CAMPO = { nombre: 'nombre', dni: 'DNI', celular: 'teléfono', correo: 'correo' } as const;

/** Lista legible de lo que falta o está mal en los contactos */
export function problemasContactos(cs: Contacto[], telefonoRepOpcional = false): string[] {
  if (!cs.length) return ['Agrega al representante legal'];
  return cs.flatMap((c, i) => {
    const quien = i === 0 ? 'Representante legal' : 'Otro contacto';
    return Object.entries(problemasDe(c, i, telefonoRepOpcional)).filter(([, p]) => p).map(([k, p]) => `${quien} – ${NOMBRE_CAMPO[k as keyof typeof NOMBRE_CAMPO]}: ${p}`);
  });
}

/** Hasta 2 contactos: el 1 es el representante legal (SUNAT) y el 2 es opcional */
export function EditorContactos({ contactos, onChange, mostrarErrores = false, telefonoRepOpcional = false }: {
  contactos: Contacto[]; onChange: (c: Contacto[]) => void; mostrarErrores?: boolean;
  /** Al editar una empresa que ya existe, el teléfono del representante es opcional */
  telefonoRepOpcional?: boolean;
}) {
  const cambiar = (i: number, campo: keyof Contacto, valor: string) =>
    onChange(contactos.map((c, k) => (k === i ? { ...c, [campo]: valor } : c)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {contactos.map((c, i) => {
        const p = problemasDe(c, i, telefonoRepOpcional);
        const celular = c.celular ?? '';
        // Se avisa al intentar guardar, o apenas el campo tiene algo escrito y está mal
        const ver = (campo: keyof typeof p, valor: string) => (mostrarErrores || (valor.length > 0 && campo !== 'nombre' && (campo !== 'celular' || valor.length >= 9 || !/^[90]/.test(valor)) && (campo !== 'dni' || valor.length >= 8)) ? p[campo] : '');
        return (
        <div key={i} className="bloque">
          <div className="fila-acciones">
            <b style={{ fontSize: 14 }}>{i === 0 ? 'Representante legal (SUNAT)' : 'Otro contacto'}</b>
            {i === 1 && <button type="button" className="boton-texto" onClick={() => onChange(contactos.slice(0, 1))}>Quitar</button>}
          </div>
          <div className={i === 0 ? 'rejilla-contacto' : 'rejilla-3'}>
            <div className="campo">
              <label htmlFor={`cn${i}`} className="etiqueta obligatorio">{i === 0 ? 'Nombre completo' : 'Nombre'}</label>
              <input id={`cn${i}`} className="entrada" value={c.nombre} maxLength={100} placeholder={i === 0 ? 'Como figura en SUNAT' : 'Ej. Sr. Pérez'} onChange={(e) => cambiar(i, 'nombre', e.target.value)}
                aria-invalid={!!ver('nombre', c.nombre)} />
              <AyudaCampo id={`cn${i}-a`} problema={ver('nombre', c.nombre)} />
            </div>
            {i === 0 && (
              <div className="campo">
                <label htmlFor={`cd${i}`} className="etiqueta">DNI</label>
                <input id={`cd${i}`} className="entrada numeros" inputMode="numeric" maxLength={8} value={c.dni ?? ''} placeholder="8 dígitos"
                  onChange={(e) => cambiar(i, 'dni', e.target.value.replace(/\D/g, '').slice(0, 8))} aria-invalid={!!ver('dni', c.dni ?? '')} />
                <AyudaCampo id={`cd${i}-a`} problema={ver('dni', c.dni ?? '')} />
              </div>
            )}
            <div className="campo">
              <label htmlFor={`cc${i}`} className={`etiqueta${i === 0 && telefonoRepOpcional ? '' : ' obligatorio'}`}>Teléfono</label>
              <input id={`cc${i}`} className="entrada numeros" inputMode="numeric" maxLength={9} value={celular} placeholder="Celular o fijo con código (01…)"
                onChange={(e) => cambiar(i, 'celular', e.target.value.replace(/\D/g, '').slice(0, 9))} aria-invalid={!!ver('celular', celular)} />
              <AyudaCampo id={`cc${i}-a`} problema={ver('celular', celular)} />
            </div>
            <div className="campo">
              <label htmlFor={`ce${i}`} className="etiqueta">Correo (opcional)</label>
              <input id={`ce${i}`} className="entrada" type="email" value={c.correo ?? ''} placeholder="nombre@empresa.pe" onChange={(e) => cambiar(i, 'correo', e.target.value)}
                aria-invalid={!!ver('correo', c.correo ?? '')} />
              <AyudaCampo id={`ce${i}-a`} problema={ver('correo', c.correo ?? '')} />
            </div>
          </div>
        </div>
        );
      })}
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
    nombre: c.nombre.trim(),
    ...(c.celular ? { celular: c.celular } : {}),
    ...(c.correo?.trim() ? { correo: c.correo.trim() } : {}),
    ...(i === 0 && c.dni ? { dni: c.dni } : {}),
  }));

export const contactosCompletos = (cs: Contacto[], telefonoRepOpcional = false) => problemasContactos(cs, telefonoRepOpcional).length === 0;