import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { Cliente } from './entities/cliente.entity';
import { Contacto } from './entities/contacto.entity';
import { LiberacionService } from './liberacion.service';
import { RetencionService } from './retencion';
import { SunatModule } from '../sunat/sunat.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Contacto]), SunatModule],
  controllers: [EmpresasController],
  providers: [EmpresasService, LiberacionService, RetencionService],
  exports: [EmpresasService, LiberacionService, RetencionService],
})
export class EmpresasModule {}