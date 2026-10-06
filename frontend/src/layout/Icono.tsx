import { ICONOS } from './menu';

export function Icono({ nombre, tam = 22 }: { nombre: keyof typeof ICONOS; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={ICONOS[nombre]} />
    </svg>
  );
}