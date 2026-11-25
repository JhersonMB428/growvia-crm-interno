export interface Usuario {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: { codigo: 'ASESOR' | 'SUPERVISOR' | 'GERENTE' | 'BACKOFFICE' | 'ADMIN'; nombre: string };
  equipo: { id: string; nombre: string } | null;
  permisos: string[];
  /** Entró con una contraseña temporal: debe elegir una propia antes de usar el CRM */
  debeCambiarClave?: boolean;
  /** Ya vio el recorrido de bienvenida */
  guiaVista?: boolean;
  /** Cambia cada vez que cambia su foto (null = sin foto, se muestran las iniciales) */
  fotoVersion?: number | null;
  /** Modo "ver como" del soporte: quién está mirando (solo lectura) */
  vista?: { de: string } | null;
  /** Puede abrir el modo "ver como" (correos de soporte) */
  puedeVerComo?: boolean;
}

export type RespuestaLogin =
  | { requiereCodigo: true; desafio: string; correo: string }
  | { requiereCodigo: false; token: string; usuario: Usuario };
