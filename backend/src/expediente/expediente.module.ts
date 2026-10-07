import { Module } from '@nestjs/common';
import { ExpedienteController } from './expediente.controller';
import { ExpedienteService } from './expediente.service';

@Module({
  controllers: [ExpedienteController],
  providers: [ExpedienteService],
})
export class ExpedienteModule {}