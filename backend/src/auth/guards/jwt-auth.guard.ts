import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { BitacoraService } from '../../bitacora/bitacora.service';
import { ES_PUBLICO } from '../decorators/publico.decorator';

const ES_CELULAR = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i;
/** La pantalla hace varias consultas a la vez: el corte del celular se registra una sola vez por minuto */
const ultimoCorte = new Map<string, number>();
/** Exige un token de sesión válido en todas las rutas, salvo las marcadas con @Publico() */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: DataSource,
    private readonly bitacora: BitacoraService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [ctx.getHandler(), ctx.getClass()]);
    if (esPublico) return true;

    const req = ctx.switchToHttp().getRequest();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) throw new UnauthorizedException('Inicia sesión para continuar');

    let payload: { sub: string; tipo: string };
    try {
      payload = await this.jwt.verifyAsync(token);
      if (payload.tipo !== 'acceso') throw new Error('token no es de sesión');
    } catch {
      throw new UnauthorizedException('Tu sesión venció. Vuelve a iniciar sesión');
    }

    // Desde el celular, el acceso tiene que seguir vigente en cada acción (si venció o lo revocaron, se corta ya)
    if (ES_CELULAR.test(req.headers['user-agent'] ?? '')) {
      const [vigente] = await this.db.query(
        `SELECT 1 FROM accesos_moviles WHERE usuario_id = $1 AND estado = 'APROBADA' AND desde <= now() AND hasta > now()`, [payload.sub],
      );
      if (!vigente) {
      if (Date.now() - (ultimoCorte.get(payload.sub) ?? 0) > 60_000) {
        ultimoCorte.set(payload.sub, Date.now());
        await this.bitacora.registrar(payload.sub, 'SESION_MOVIL_CORTADA', { ip: req.ip }).catch(() => undefined);
      }
        throw new UnauthorizedException({ codigo: 'MOVIL_VENCIDO', message: 'Tu acceso desde el celular venció o fue retirado. Úsalo desde la computadora o pide uno nuevo.' });
      }
    }

    req.usuario = payload;
    return true;
  }
}