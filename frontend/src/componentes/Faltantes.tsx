/** Lista de lo que falta o está mal antes de guardar un formulario (en vez de solo bloquear el botón) */
export function Faltantes({ items, titulo = 'Para guardar, revisa esto:' }: { items: string[]; titulo?: string }) {
  if (!items.length) return null;
  return (
    <div className="faltantes" role="alert">
      <b>{titulo}</b>
      <ul>{items.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

/** Mensaje bajo un campo: en rojo si hay un problema, si no la ayuda normal */
export function AyudaCampo({ id, problema, ayuda }: { id: string; problema?: string; ayuda?: string }) {
  if (!problema && !ayuda) return null;
  return <span id={id} className={problema ? 'campo-error' : 'campo-ayuda'}>{problema || ayuda}</span>;
}
