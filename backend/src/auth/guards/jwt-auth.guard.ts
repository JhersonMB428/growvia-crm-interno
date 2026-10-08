import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { BitacoraService } from '../../bitacora/bitacora.service';
import { ES_PUBLICO } from '../decorators/publico.decorator';

const ES_CELULAR = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i;

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

    let payload: { sub: string; tipo: string; iat: number };
    try {
      payload = await this.jwt.verifyAsync(token);
      if (payload.tipo !== 'acceso') throw new Error('token no es de sesión');
    } catch {
      throw new UnauthorizedException('Tu sesión venció. Vuelve a iniciar sesión');
    }

    // En cada acción: el usuario sigue activo, la sesión es posterior al último cambio de contraseña
    // y, si es un celular, su acceso sigue vigente (si venció o lo revocaron, se corta ya)
    const esCelular = ES_CELULAR.test(req.headers['user-agent'] ?? '');
    const [u] = await this.db.query(
      `SELECT u.activo, floor(extract(epoch FROM u.credenciales_at))::bigint AS credenciales,
              ($2 AND NOT EXISTS (SELECT 1 FROM accesos_moviles a WHERE a.usuario_id = u.id AND a.estado = 'APROBADA'
                                   AND a.desde <= now() AND a.hasta > now())) AS "celularBloqueado"
       FROM usuarios u WHERE u.id = $1`, [payload.sub, esCelular],
    );
    if (!u?.activo) throw new UnauthorizedException('Tu usuario fue desactivado. Habla con tu supervisor.');
    if (u.credenciales && payload.iat < Number(u.credenciales)) {
      throw new UnauthorizedException('Tu contraseña, rol o equipo cambió. Vuelve a iniciar sesión.');
    }
    if (u.celularBloqueado) {
      await this.bitacora.registrar(payload.sub, 'SESION_MOVIL_CORTADA', { ip: req.ip }).catch(() => undefined);
      throw new UnauthorizedException({ codigo: 'MOVIL_VENCIDO', message: 'Tu acceso desde el celular venció o fue retirado. Úsalo desde la computadora o pide uno nuevo.' });
    }

    req.usuario = payload;
    return true;
  }
}