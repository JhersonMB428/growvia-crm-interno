import { Module } from '@nestjs/common';
import { EmpresasModule } from '../empresas/empresas.module';
import { BasesController } from './bases.controller';
import { BasesService } from './bases.service';

@Module({
  imports: [EmpresasModule],
  controllers: [BasesController],
  providers: [BasesService],
})
export class BasesModule {}