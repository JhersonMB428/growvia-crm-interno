import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, Length } from 'class-validator';
import type { Response } from 'express';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { BasesService, type ArchivoSubido } from './bases.service';

class SubirBaseDto {
  /** "repositorio" o el id de un asesor (el asesor siempre se la asigna a sí mismo) */
  @IsOptional()
  @IsString()
  asignarA?: string;
}

class RechazarDto {
  @IsString({ message: 'Escribe el motivo del rechazo' })
  @Length(3, 300, { message: 'Escribe el motivo del rechazo' })
  motivo: string;
}

@Controller('bases')
export class BasesController {
  constructor(private readonly bases: BasesService) {}

  /** Plantilla vacía para llenar */
  @Get('plantilla')
  @RequierePermisos('BASE_CARGAR')
  async plantilla(@Res() res: Response) {
    const archivo = await this.bases.plantilla();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-base-empresas.xlsx"');
    res.send(archivo);
  }

  @Get('destinos')
  @RequierePermisos('BASE_CARGAR')
  destinos(@UsuarioActual() s: SesionUsuario) {
    return this.bases.destinos(s);
  }

  @Get()
  @RequierePermisos('BASE_CARGAR')
  listar(@UsuarioActual() s: SesionUsuario) {
    return this.bases.listar(s);
  }

  /** Sube el Excel (campo "archivo", máx. 5 MB) y lo deja pendiente de aprobación */
  @Post()
  @RequierePermisos('BASE_CARGAR')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  subir(@UploadedFile() archivo: ArchivoSubido, @Body() dto: SubirBaseDto, @UsuarioActual() s: SesionUsuario) {
    return this.bases.subir(archivo, dto.asignarA, s);
  }

  @Get(':id')
  @RequierePermisos('BASE_CARGAR')
  detalle(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.bases.detalle(id, s);
  }

  @Post(':id/aprobar')
  @RequierePermisos('BASE_APROBAR')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.bases.aprobar(id, s);
  }

  @Post(':id/rechazar')
  @RequierePermisos('BASE_APROBAR')
  rechazar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RechazarDto, @UsuarioActual() s: SesionUsuario) {
    return this.bases.rechazar(id, dto.motivo, s);
  }
}