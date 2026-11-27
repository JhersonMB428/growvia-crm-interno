import type { Contacto, Medio } from '../api/empresas';
import { etiquetaPersona, opcionesMedio, type Objetivo } from '../utilidades/personas';
import './personas.css';

interface Props {
  idBase: string;
  personas: Contacto[];
  medios: Medio[];
  valor: Objetivo;
  onChange: (o: Objetivo) => void;
}

/** "¿Con quién hablaste y a qué número?" — queda en cada gestión y marca solo si el número funciona */
export function ConQuien({ idBase, personas, medios, valor, onChange }: Props) {
  const opciones = opcionesMedio(personas, medios, valor.contactoId);
  function cambiarPersona(contactoId: string) {
    const p = personas.find((c) => c.id === contactoId);
    // Si la persona tiene teléfono propio, se usa ese
    onChange({ contactoId, medio: p?.celular || valor.medio });
  }
  return (
    <div className="con-quien">
      <div className="campo">
        <label htmlFor={`${idBase}-persona`} className="etiqueta">¿Con quién?</label>
        <select id={`${idBase}-persona`} className="entrada" value={valor.contactoId} onChange={(e) => cambiarPersona(e.target.value)}>
          <option value="">No sé / nadie en particular</option>
          {personas.map((c) => (
            <option key={c.id} value={c.id}>{c.decisor ? '★ ' : ''}{c.nombre} · {etiquetaPersona(c)}</option>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`${idBase}-medio`} className="etiqueta">¿A qué número o correo?</label>
        <select id={`${idBase}-medio`} className="entrada numeros" value={valor.medio} onChange={(e) => onChange({ ...valor, medio: e.target.value })}>
          <option value="">Ninguno en particular</option>
          {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
        </select>
      </div>
    </div>
  );
}
