export interface Usuario {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  rol: { codigo: 'ASESOR' | 'SUPERVISOR' | 'GERENTE' | 'BACKOFFICE' | 'ADMIN'; nombre: string };
  equipo: { id: string; nombre: string } | null;
  permisos: string[];
}

export type RespuestaLogin =
  | { requiereCodigo: true; desafio: string; correo: string }
  | { requiereCodigo: false; token: string; usuario: Usuario };
