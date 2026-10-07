import { Module } from '@nestjs/common';
import { GestionesController } from './gestiones.controller';
import { GestionesService } from './gestiones.service';
import { RecordatoriosService } from './recordatorios.service';

@Module({
  controllers: [GestionesController],
  providers: [GestionesService, RecordatoriosService],
  exports: [GestionesService, RecordatoriosService],
})
export class GestionesModule {}