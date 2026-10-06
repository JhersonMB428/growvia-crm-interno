import type { ReactNode } from 'react';
import './PantallaAcceso.css';

/** Fondo, logo y mensaje de bienvenida compartidos por el login y la verificación. */
export function PantallaAcceso({ children }: { children: ReactNode }) {
  return (
    <div className="acceso">
      <img className="acceso__fondo" src="/img/fondo-login.jpg" alt="" />
      <div className="acceso__velo" />
      <div className="acceso__contenido">
        <header className="acceso__cabecera">
          <img src="/img/logo-growvia.webp" alt="Growvia" className="acceso__logo" />
          <span className="acceso__etiqueta">CRM interno · Ventas corporativas</span>
        </header>
        <main className="acceso__cuerpo">
          <section className="acceso__bienvenida">
            <h1>Bienvenido <span>de vuelta</span></h1>
            <p>Gestiona tus prospectos, negociaciones y ventas corporativas en un solo lugar.</p>
            <ul>
              <li>Prospectos y clientes por RUC, sin duplicados</li>
              <li>Feedback de cada llamada, WhatsApp o visita</li>
              <li>Avance de tu equipo y metas en tiempo real</li>
            </ul>
          </section>
          {children}
        </main>
        <footer className="acceso__pie">© {new Date().getFullYear()} Growvia · Uso interno</footer>
      </div>
    </div>
  );
}
