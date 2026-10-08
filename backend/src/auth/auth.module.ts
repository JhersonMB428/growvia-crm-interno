import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccesoMovil } from './entities/acceso-movil.entity';
import { CodigoVerificacion } from './entities/codigo-verificacion.entity';
import { DispositivoConfiable } from './entities/dispositivo-confiable.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermisosGuard } from './guards/permisos.guard';

@Module({
  imports: [
    UsuariosModule,
    TypeOrmModule.forFeature([CodigoVerificacion, DispositivoConfiable, AccesoMovil]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET debe tener al menos 32 caracteres en el .env');
        }
        return { secret };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Toda la API exige sesión y revisa permisos, salvo rutas @Publico()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermisosGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
