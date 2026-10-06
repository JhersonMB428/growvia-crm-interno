import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { CorreoModule } from './correo/correo.module';
import { SaludController } from './salud.controller';
import { SistemaModule } from './sistema/sistema.module';
import { UsuariosModule } from './usuarios/usuarios.module';

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
    SistemaModule,
    CorreoModule,
    UsuariosModule,
    AuthModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
