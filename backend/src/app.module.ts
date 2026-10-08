import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { AccesosMovilModule } from './accesos-movil/accesos-movil.module';
import { AdministracionModule } from './administracion/administracion.module';
import { AlmacenamientoModule } from './almacenamiento/almacenamiento.module';
import { AuthModule } from './auth/auth.module';
import { CorreoModule } from './correo/correo.module';
import { EmbudoModule } from './embudo/embudo.module';
import { EmpresasModule } from './empresas/empresas.module';
import { ExpedienteModule } from './expediente/expediente.module';
import { ExportacionModule } from './exportacion/exportacion.module';
import { GestionesModule } from './gestiones/gestiones.module';
import { NegociacionesModule } from './negociaciones/negociaciones.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';
import { PerfilModule } from './perfil/perfil.module';
import { RenovacionesModule } from './renovaciones/renovaciones.module';
import { SaludController } from './salud.controller';
import { SistemaModule } from './sistema/sistema.module';
import { TablerosModule } from './tableros/tableros.module';
import { UbigeoModule } from './ubigeo/ubigeo.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { BasesModule } from './bases/bases.module';
import { BitacoraModule } from './bitacora/bitacora.module';
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
        // En Azure (MIGRAR_AL_INICIAR=true) las migraciones pendientes se aplican solas al arrancar
        migrations: [join(__dirname, 'database', 'migrations', '*.js')],
        migrationsRun: config.get<string>('MIGRAR_AL_INICIAR') === 'true',
        // Fechas siempre en hora de Lima, aunque el servidor de Azure esté en UTC
        extra: { options: '-c timezone=America/Lima' },
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
    AlmacenamientoModule,
    ExpedienteModule,
    BitacoraModule,
    ExportacionModule,
    AccesosMovilModule,
    AdministracionModule,
    RenovacionesModule,
    EmbudoModule,
    PerfilModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}