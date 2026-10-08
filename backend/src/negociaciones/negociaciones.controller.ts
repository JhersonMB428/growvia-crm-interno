import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { CambiarEtapaDto, CerrarNegociacionDto } from './dto/etapa.dto';
import { CrearNegociacionDto, GuardarNegociacionDto } from './dto/guardar-negociacion.dto';
import { ListarNegociacionesDto } from './dto/listar.dto';
import { NegociacionesService } from './negociaciones.service';

@Controller('negociaciones')
export class NegociacionesController {
  constructor(private readonly negociaciones: NegociacionesService) {}

  /** Planes, operadores y motivos de pérdida para los desplegables */
  @Get('catalogos')
  @RequierePermisos('INFO_COMERCIAL_VER')
  catalogos() {
    return this.negociaciones.catalogos();
  }

  /** Embudo: negociaciones abiertas y las cerradas este mes (según el alcance del rol) */
  @Get('embudo')
  @RequierePermisos('INFO_COMERCIAL_VER')
  embudo(@UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.embudo(s);
  }

  @Get()
  @RequierePermisos('INFO_COMERCIAL_VER')
  listar(@Query() f: ListarNegociacionesDto, @UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.listar(f, s);
  }

  @Get(':id')
  @RequierePermisos('INFO_COMERCIAL_VER')
  detalle(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.detalle(id, s);
  }

  @Post()
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  crear(@Body() dto: CrearNegociacionDto, @UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.crear(dto, s);
  }

  @Put(':id')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  actualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarNegociacionDto, @UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.actualizar(id, dto, s);
  }

  @Post(':id/etapa')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  etapa(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CambiarEtapaDto, @UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.cambiarEtapa(id, dto, s);
  }

  /** Abre la renovación de un contrato activo (el :id es la venta que se renueva) */
  @Post(':id/renovar')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  renovar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.iniciarRenovacion(id, s);
  }

  @Post(':id/cerrar')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  cerrar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CerrarNegociacionDto, @UsuarioActual() s: SesionUsuario) {
    return this.negociaciones.cerrar(id, dto, s);
  }
}