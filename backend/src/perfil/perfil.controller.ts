import { Body, Controller, Delete, Get, Headers, Ip, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { PerfilService } from './perfil.service';

class CambiarClaveDto {
  @IsString() @Length(1, 72, { message: 'Escribe tu contraseña actual' }) actual: string;
  @IsString() @Length(1, 72) nueva: string;
  /** Identificador de este navegador: este equipo sigue siendo de confianza */
  @IsOptional() @IsString() @Length(16, 100) huella?: string;
}

class AvisosDto {
  @IsBoolean() avisoCorreo: boolean;
  @IsIn([0, 10, 15, 30, 60], { message: 'Elige cuántos minutos antes' }) minutosRecordatorio: number;
}

/** Cada usuario, sobre su propia cuenta (no requiere permisos especiales) */
@Controller('perfil')
export class PerfilController {
  constructor(private readonly perfil: PerfilService) {}

  @Get()
  datos(@UsuarioActual() s: SesionUsuario, @Headers('x-huella') huella?: string) {
    return this.perfil.datos(s, huella);
  }

  @Put('clave')
  cambiarClave(@Body() dto: CambiarClaveDto, @UsuarioActual() s: SesionUsuario, @Ip() ip: string) {
    return this.perfil.cambiarClave(s, dto.actual, dto.nueva, dto.huella, ip);
  }

  @Put('avisos')
  avisos(@Body() dto: AvisosDto, @UsuarioActual() s: SesionUsuario) {
    return this.perfil.guardarAvisos(s, dto.avisoCorreo, dto.minutosRecordatorio);
  }

  @Put('guia')
  guia(@UsuarioActual() s: SesionUsuario) {
    return this.perfil.marcarGuiaVista(s);
  }

  @Delete('dispositivos/:id')
  quitar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.perfil.quitarDispositivo(s, id);
  }

  @Delete('dispositivos')
  quitarTodos(@UsuarioActual() s: SesionUsuario) {
    return this.perfil.quitarTodos(s);
  }
}