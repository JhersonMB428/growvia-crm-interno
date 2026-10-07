import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AgendaDto } from './dto/agenda.dto';
import { CrearGestionDto } from './dto/crear-gestion.dto';
import { ReprogramarDto } from './dto/reprogramar.dto';
import { GestionesService } from './gestiones.service';

@Controller()
export class GestionesController {
  constructor(private readonly gestiones: GestionesService) {}

  /** Registrar llamada, WhatsApp, correo o visita (el asesor a cargo) */
  @Post('gestiones')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  crear(@Body() dto: CrearGestionDto, @UsuarioActual() s: SesionUsuario) {
    return this.gestiones.crear(dto, s);
  }

  /** Línea de tiempo de la empresa (según el alcance del rol) */
  @Get('empresas/:id/gestiones')
  @RequierePermisos('INFO_COMERCIAL_VER')
  deEmpresa(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.gestiones.deEmpresa(id, s);
  }

  @Put('gestiones/:id/reprogramar')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  reprogramar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReprogramarDto, @UsuarioActual() s: SesionUsuario) {
    return this.gestiones.reprogramar(id, dto, s);
  }

  /** Agenda propia: ?desde=2026-10-01&hasta=2026-10-31 */
  @Get('agenda')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  agenda(@Query() f: AgendaDto, @UsuarioActual() s: SesionUsuario) {
    return this.gestiones.agenda(f, s);
  }
}