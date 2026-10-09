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
}

export type RespuestaLogin =
  | { requiereCodigo: true; desafio: string; correo: string }
  | { requiereCodigo: false; token: string; usuario: Usuario };
