import { Module } from '@nestjs/common';
import { AccesosMovilController } from './accesos-movil.controller';
import { AccesosMovilService } from './accesos-movil.service';

@Module({
  controllers: [AccesosMovilController],
  providers: [AccesosMovilService],
})
export class AccesosMovilModule {}
