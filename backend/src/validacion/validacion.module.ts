import { Module } from '@nestjs/common';
import { ValidacionController } from './validacion.controller';
import { ValidacionService } from './validacion.service';

@Module({
  controllers: [ValidacionController],
  providers: [ValidacionService],
  exports: [ValidacionService],
})
export class ValidacionModule {}