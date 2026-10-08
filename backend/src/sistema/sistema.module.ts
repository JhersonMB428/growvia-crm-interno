import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArranqueService } from './arranque.service';
import { Parametro } from './parametro.entity';
import { ParametrosService } from './parametros.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Parametro])],
  providers: [ParametrosService, ArranqueService],
  exports: [ParametrosService],
})
export class SistemaModule {}
