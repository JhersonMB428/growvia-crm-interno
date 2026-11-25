import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Datos de la sesión que viajan en el token */
export interface SesionUsuario {
  sub: string;
  rol: string;
  equipoId: string | null;
  permisos: string[];
  /** Solo en el modo "ver como": id del administrador de soporte que está mirando (solo lectura) */
  vistaDe?: string;
  /** Cuenta de soporte que ya eligió con qué rol entrar (puede ser distinto de su rol real) */
  rolElegido?: boolean;
}

/** Ej.: perfil(@UsuarioActual() u: SesionUsuario) */
export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SesionUsuario => ctx.switchToHttp().getRequest().usuario,
);
