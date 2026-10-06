import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISOS_REQUERIDOS } from '../decorators/requiere-permisos.decorator';

/** Revisa los permisos pedidos con @RequierePermisos() contra los del usuario */
@Injectable()
export class PermisosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<string[]>(PERMISOS_REQUERIDOS, [ctx.getHandler(), ctx.getClass()]);
    if (!requeridos?.length) return true;

    const permisos: string[] = ctx.switchToHttp().getRequest().usuario?.permisos ?? [];
    if (requeridos.every((p) => permisos.includes(p))) return true;
    throw new ForbiddenException('No tienes permiso para esta acción');
  }
}
