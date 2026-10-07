import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { BitacoraService } from './bitacora.service';

/**
 * Mira cada petición cuando ya terminó (después de los guardias de permisos y del controlador)
 * y la deja en la bitácora si corresponde. Así no hay que tocar cada módulo.
 */
@Injectable()
export class BitacoraMiddleware implements NestMiddleware {
  constructor(private readonly bitacora: BitacoraService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // En el login hace falta la respuesta para saber quién entró
    let respuesta: unknown;
    if (req.originalUrl.startsWith('/api/auth/')) {
      const json = res.json.bind(res);
      res.json = (cuerpo: unknown) => { respuesta = cuerpo; return json(cuerpo); };
    }
    res.on('finish', () => { void this.bitacora.desdePeticion(req, res, respuesta); });
    next();
  }
}