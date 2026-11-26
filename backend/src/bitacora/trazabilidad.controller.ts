import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { TrazabilidadService } from './trazabilidad.service';

class PeriodoDto {
  @IsOptional() @Type(() => Number) @IsIn([7, 30, 90], { message: 'Periodo no válido' }) dias = 30;
}
class BuscarDto {
  @IsString() @MaxLength(100) q: string;
}

/** Trazabilidad: solo quienes pueden ver la bitácora (administración y gerencia) */
@Controller('trazabilidad')
@RequierePermisos('BITACORA_VER')
export class TrazabilidadController {
  constructor(private readonly traza: TrazabilidadService) {}

  @Get('resumen')
  resumen(@Query() f: PeriodoDto) {
    return this.traza.resumen(f.dias);
  }

  @Get('empresas')
  buscar(@Query() f: BuscarDto) {
    return this.traza.buscarEmpresas(f.q);
  }

  @Get('empresas/:id')
  empresa(@Param('id', ParseUUIDPipe) id: string) {
    return this.traza.empresa(id);
  }

  @Get('usuarios/:id')
  usuario(@Param('id', ParseUUIDPipe) id: string, @Query() f: PeriodoDto) {
    return this.traza.usuario(id, f.dias);
  }
}
