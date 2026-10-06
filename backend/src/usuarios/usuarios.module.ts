import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Equipo } from './entities/equipo.entity';
import { Permiso } from './entities/permiso.entity';
import { Rol } from './entities/rol.entity';
import { Usuario } from './entities/usuario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Usuario, Rol, Permiso, Equipo])],
  exports: [TypeOrmModule],
})
export class UsuariosModule {}
