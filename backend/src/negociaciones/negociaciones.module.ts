import { Module } from '@nestjs/common';
import { EmpresasModule } from '../empresas/empresas.module';
import { NegociacionesController } from './negociaciones.controller';
import { NegociacionesService } from './negociaciones.service';

@Module({
  imports: [EmpresasModule],
  controllers: [NegociacionesController],
  providers: [NegociacionesService],
  exports: [NegociacionesService],
})
export class NegociacionesModule {}