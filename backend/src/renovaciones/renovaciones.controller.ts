import { Controller, Get, Query } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { ListarRenovacionesDto } from './dto/listar.dto';
import { RenovacionesService } from './renovaciones.service';

@Controller('renovaciones')
export class RenovacionesController {
  constructor(private readonly renovaciones: RenovacionesService) {}

  /** Nuestros contratos que vencen (según quién tiene hoy la empresa) */
  @Get('contratos')
  @RequierePermisos('INFO_COMERCIAL_VER')
  contratos(@Query() f: ListarRenovacionesDto, @UsuarioActual() s: SesionUsuario) {
    return this.renovaciones.contratos(f, s);
  }

  /** Prospectos cuyo contrato con su operador actual termina */
  @Get('competencia')
  @RequierePermisos('INFO_COMERCIAL_VER')
  competencia(@Query() f: ListarRenovacionesDto, @UsuarioActual() s: SesionUsuario) {
    return this.renovaciones.competencia(f, s);
  }
}