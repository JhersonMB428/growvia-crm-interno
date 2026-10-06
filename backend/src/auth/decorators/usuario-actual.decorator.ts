import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Datos de la sesión que viajan en el token */
export interface SesionUsuario {
  sub: string;
  rol: string;
  equipoId: string | null;
  permisos: string[];
}

/** Ej.: perfil(@UsuarioActual() u: SesionUsuario) */
export const UsuarioActual = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SesionUsuario => ctx.switchToHttp().getRequest().usuario,
);
