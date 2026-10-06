import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { DecisionDto, MotivoDto, PosventaDto } from './dto/decision.dto';
import { ValidacionService, type Bandeja } from './validacion.service';

/** Permiso que necesita cada bandeja */
const PERMISO_BANDEJA: Record<Bandeja, string> = {
  aprobar: 'VENTA_APROBAR', revisar: 'VENTA_REVISAR', validar: 'VENTA_VALIDAR', posventa: 'VENTA_VALIDAR',
};

@Controller()
export class ValidacionController {
  constructor(private readonly validacion: ValidacionService) {}

  /** /validacion/bandeja/aprobar | revisar | validar | posventa */
  @Get('validacion/bandeja/:tipo')
  bandeja(@Param('tipo') tipo: string, @UsuarioActual() s: SesionUsuario) {
    const permiso = PERMISO_BANDEJA[tipo as Bandeja];
    if (!permiso) throw new ForbiddenException('Bandeja no válida');
    if (!s.permisos.includes(permiso)) throw new ForbiddenException('No tienes permiso para esta bandeja');
    return this.validacion.bandeja(tipo as Bandeja, s);
  }

  @Get('validacion/contadores')
  contadores(@UsuarioActual() s: SesionUsuario) {
    return this.validacion.contadores(s);
  }

  @Post('validacion/:id/aprobar')
  @RequierePermisos('VENTA_APROBAR')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @UsuarioActual() s: SesionUsuario) {
    return this.validacion.aprobar(id, dto.comentario, s);
  }

  @Post('validacion/:id/revisar')
  @RequierePermisos('VENTA_REVISAR')
  revisar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @UsuarioActual() s: SesionUsuario) {
    return this.validacion.revisar(id, dto.comentario, s);
  }

  /** Lo pueden hacer supervisor (paso 1), gerencia (en cualquier momento) y back office (paso 3) */
  @Post('validacion/:id/observar')
  observar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MotivoDto, @UsuarioActual() s: SesionUsuario) {
    if (!['VENTA_APROBAR', 'VENTA_REVISAR', 'VENTA_VALIDAR'].some((p) => s.permisos.includes(p))) {
      throw new ForbiddenException('No tienes permiso para observar ventas');
    }
    return this.validacion.observar(id, dto.comentario, s);
  }

  @Post('validacion/:id/detener')
  @RequierePermisos('VENTA_REVISAR')
  detener(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MotivoDto, @UsuarioActual() s: SesionUsuario) {
    return this.validacion.detener(id, dto.comentario, s);
  }

  @Post('validacion/:id/validar')
  @RequierePermisos('VENTA_VALIDAR')
  validar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto, @UsuarioActual() s: SesionUsuario) {
    return this.validacion.validar(id, dto.comentario, s);
  }

  @Post('validacion/:id/posventa')
  @RequierePermisos('VENTA_VALIDAR')
  posventa(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PosventaDto, @UsuarioActual() s: SesionUsuario) {
    return this.validacion.posventa(id, dto.evento, dto.comentario, s);
  }

  /** El asesor reenvía una venta observada después de corregirla */
  @Post('negociaciones/:id/reenviar')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  reenviar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.validacion.reenviar(id, s);
  }
}