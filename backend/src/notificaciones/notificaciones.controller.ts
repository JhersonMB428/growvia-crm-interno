import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { NotificacionesService } from './notificaciones.service';

/** Cada usuario solo ve y marca sus propias notificaciones */
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly notificaciones: NotificacionesService) {}

  @Get()
  listar(@UsuarioActual() s: SesionUsuario, @Query('filtro') filtro?: string) {
    return this.notificaciones.listar(s.sub, filtro === 'sin-leer');
  }

  /** Lo consulta la campanita cada minuto */
  @Get('contador')
  async contador(@UsuarioActual() s: SesionUsuario) {
    return { sinLeer: await this.notificaciones.contador(s.sub) };
  }

  @Post('leer-todas')
  leerTodas(@UsuarioActual() s: SesionUsuario) {
    return this.notificaciones.marcarTodas(s.sub);
  }

  @Post(':id/leida')
  leida(@Param('id', ParseIntPipe) id: number, @UsuarioActual() s: SesionUsuario) {
    return this.notificaciones.marcarLeida(String(id), s.sub);
  }
}