import { Module } from '@nestjs/common';
import { NegociacionesController } from './negociaciones.controller';
import { NegociacionesService } from './negociaciones.service';

@Module({
  controllers: [NegociacionesController],
  providers: [NegociacionesService],
  exports: [NegociacionesService],
})
export class NegociacionesModule {}