import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ES_PUBLICO } from '../decorators/publico.decorator';

/** Exige un token de sesión válido en todas las rutas, salvo las marcadas con @Publico() */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
    if (esPublico) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Inicia sesión para continuar');

    try {
      const payload = await this.jwt.verifyAsync(token);
      if (payload.tipo !== 'acceso') throw new Error('token no es de sesión');
      req.usuario = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Tu sesión venció. Vuelve a iniciar sesión');
    }
  }
}
