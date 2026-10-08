import { Global, Module } from '@nestjs/common';
import { AlmacenamientoService } from './almacenamiento.service';

/** Global: cualquier módulo puede guardar y leer archivos */
@Global()
@Module({
  providers: [AlmacenamientoService],
  exports: [AlmacenamientoService],
})
export class AlmacenamientoModule {}