import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Parametro } from './parametro.entity';
import { ParametrosService } from './parametros.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Parametro])],
  providers: [ParametrosService],
  exports: [ParametrosService],
})
export class SistemaModule {}
