import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Matches, Min } from 'class-validator';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { BitacoraService, CATEGORIAS } from './bitacora.service';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

class ListarBitacoraDto {
  @IsOptional() @Matches(FECHA, { message: 'Fecha no válida' }) desde?: string;
  @IsOptional() @Matches(FECHA, { message: 'Fecha no válida' }) hasta?: string;
  @IsOptional() @IsUUID() usuarioId?: string;
  @IsOptional() @IsIn(Object.keys(CATEGORIAS)) categoria?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina = 1;
}

/** Solo gerencia y administración */
@Controller('bitacora')
export class BitacoraController {
  constructor(private readonly bitacora: BitacoraService) {}

  @Get()
  @RequierePermisos('BITACORA_VER')
  listar(@Query() f: ListarBitacoraDto) {
    return this.bitacora.listar(f);
  }

  @Get('usuarios')
  @RequierePermisos('BITACORA_VER')
  usuarios() {
    return this.bitacora.usuarios();
  }
}