import { Module } from '@nestjs/common';
import { EmpresasModule } from '../empresas/empresas.module';
import { AdminSistemaController, AdminUsuariosController } from './admin.controller';
import { AdminSistemaService } from './admin-sistema.service';
import { AdminUsuariosService } from './admin-usuarios.service';

@Module({
  imports: [EmpresasModule],
  controllers: [AdminUsuariosController, AdminSistemaController],
  providers: [AdminUsuariosService, AdminSistemaService],
})
export class AdministracionModule {}