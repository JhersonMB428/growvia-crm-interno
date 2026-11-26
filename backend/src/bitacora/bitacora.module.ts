import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller';
import { BitacoraMiddleware } from './bitacora.middleware';
import { BitacoraService } from './bitacora.service';
import { TrazabilidadController } from './trazabilidad.controller';
import { TrazabilidadService } from './trazabilidad.service';

/** Global: cualquier módulo puede registrar algo a mano con BitacoraService.registrar() */
@Global()
@Module({
  controllers: [BitacoraController, TrazabilidadController],
  providers: [BitacoraService, TrazabilidadService],
  exports: [BitacoraService],
})
export class BitacoraModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(BitacoraMiddleware).forRoutes('*path');
  }
}