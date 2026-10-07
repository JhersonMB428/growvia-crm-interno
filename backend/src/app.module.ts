import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CorreoModule } from './correo/correo.module';
import { EmpresasModule } from './empresas/empresas.module';
import { GestionesModule } from './gestiones/gestiones.module';
import { NegociacionesModule } from './negociaciones/negociaciones.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';import { SaludController } from './salud.controller';
import { SistemaModule } from './sistema/sistema.module';
import { TablerosModule } from './tableros/tableros.module';
import { UbigeoModule } from './ubigeo/ubigeo.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { BasesModule } from './bases/bases.module';
import { ValidacionModule } from './validacion/validacion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../.env', '.env'] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false, // las tablas solo se crean con migraciones
      }),
    }),
    ScheduleModule.forRoot(), // tareas programadas (liberación diaria, avisos)
    SistemaModule,
    CorreoModule,
    UsuariosModule,
    AuthModule,
    UbigeoModule,
    EmpresasModule,
    NegociacionesModule,
    NotificacionesModule,
    GestionesModule,
    ValidacionModule,
    TablerosModule,
    BasesModule,  
  ],
  controllers: [SaludController],
})
export class AppModule {}