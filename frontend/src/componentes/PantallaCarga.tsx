/**
 * Pantalla de carga con el logo de Growvia.
 * Es idéntica a la que está en index.html (usa sus mismos estilos), así que
 * cuando React toma el control no se nota ningún salto: se ve una sola pantalla.
 */
export function PantallaCarga({ texto = 'Preparando tu CRM…' }: { texto?: string }) {
  return (
    <div className="gv-carga" role="status" aria-live="polite">
      <img className="gv-carga__logo" src="/img/logo-growvia.webp" alt="Growvia" />
      <div className="gv-carga__barra"><span /></div>
      <p className="gv-carga__texto">{texto}</p>
    </div>
  );
}