import { Module } from '@nestjs/common';
import { SunatModule } from '../sunat/sunat.module';
import { EmpresasModule } from '../empresas/empresas.module';
import { BasesController } from './bases.controller';
import { BasesService } from './bases.service';

@Module({
  imports: [EmpresasModule, SunatModule],
  controllers: [BasesController],
  providers: [BasesService],
})
export class BasesModule {}