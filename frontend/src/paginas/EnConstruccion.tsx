/** Pantalla temporal para las secciones que aún no se construyen */
export function EnConstruccion({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <>
      <div className="encabezado">
        <span className="encabezado__antetitulo">Growvia CRM</span>
        <h1>{titulo}</h1>
        <p>{descripcion}</p>
      </div>
      <section className="panel vidrio" style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <b style={{ fontFamily: 'var(--fuente-titulos)', fontSize: 22 }}>En construcción</b>
          <span style={{ color: 'var(--texto-suave)', lineHeight: 1.5 }}>
            Esta sección se conecta en los siguientes pasos. El menú, la barra superior y los permisos ya funcionan.
          </span>
        </div>
      </section>
    </>
  );
}