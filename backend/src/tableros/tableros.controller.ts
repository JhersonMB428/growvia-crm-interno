import { Body, Controller, ForbiddenException, Get, Put, Query } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { GuardarMetaDto, MesDto } from './dto/metas.dto';
import { TablerosService } from './tableros.service';

@Controller()
export class TablerosController {
  constructor(private readonly tableros: TablerosService) {}

  /** Inicio del asesor */
  @Get('tableros/asesor')
  @RequierePermisos('NEGOCIACION_GESTIONAR')
  asesor(@UsuarioActual() s: SesionUsuario) {
    return this.tableros.asesor(s);
  }

  /** Mi equipo (supervisor) */
  @Get('tableros/equipo')
  @RequierePermisos('VENTA_APROBAR')
  equipo(@UsuarioActual() s: SesionUsuario) {
    return this.tableros.equipo(s);
  }

  /** Resumen general (gerencia; back office y admin solo lectura) */
  @Get('tableros/gerencia')
  @RequierePermisos('REPORTE_VER')
  gerencia(@Query() f: MesDto, @UsuarioActual() s: SesionUsuario) {
    if (!['GERENTE', 'BACKOFFICE', 'ADMIN'].includes(s.rol)) throw new ForbiddenException('El resumen general es solo para gerencia');
    return this.tableros.gerencia(f.mes);
  }

  /** Metas del mes (supervisor: su equipo · gerencia: todos) */
  @Get('metas')
  @RequierePermisos('META_DEFINIR')
  metas(@Query() f: MesDto, @UsuarioActual() s: SesionUsuario) {
    return this.tableros.metas(f.mes, s);
  }

  @Put('metas')
  @RequierePermisos('META_DEFINIR')
  guardar(@Body() dto: GuardarMetaDto, @UsuarioActual() s: SesionUsuario) {
    return this.tableros.guardarMeta(dto, s);
  }
}