import { Module } from '@nestjs/common';
import { AdminSistemaController, AdminUsuariosController } from './admin.controller';
import { AdminSistemaService } from './admin-sistema.service';
import { AdminUsuariosService } from './admin-usuarios.service';

@Module({
  controllers: [AdminUsuariosController, AdminSistemaController],
  providers: [AdminUsuariosService, AdminSistemaService],
})
export class AdministracionModule {}