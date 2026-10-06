import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresasController } from './empresas.controller';
import { EmpresasService } from './empresas.service';
import { Cliente } from './entities/cliente.entity';
import { Contacto } from './entities/contacto.entity';
import { LiberacionService } from './liberacion.service';

@Module({
  imports: [TypeOrmModule.forFeature([Cliente, Contacto])],
  controllers: [EmpresasController],
  providers: [EmpresasService, LiberacionService],
  exports: [EmpresasService, LiberacionService],
})
export class EmpresasModule {}