import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { ExpedienteService, MAX_MB, type ArchivoSubido, type TipoDocumento } from './expediente.service';

class SubirDocumentoDto {
  @IsIn(['CONTRATO', 'DNI', 'FICHA_RUC', 'CARTA_PORTABILIDAD', 'OTRO'], { message: 'Elige qué documento es' })
  tipo: TipoDocumento;
}

@Controller()
export class ExpedienteController {
  constructor(private readonly expediente: ExpedienteService) {}

  @Get('negociaciones/:id/documentos')
  @RequierePermisos('INFO_COMERCIAL_VER')
  listar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.expediente.listar(id, s);
  }

  /** Campo "archivo" (PDF o foto, máx. 10 MB) y campo "tipo" */
  @Post('negociaciones/:id/documentos')
  @RequierePermisos('INFO_COMERCIAL_VER')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 } }))
  subir(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() archivo: ArchivoSubido, @Body() dto: SubirDocumentoDto, @UsuarioActual() s: SesionUsuario) {
    return this.expediente.subir(id, dto.tipo, archivo, s);
  }

  /** Se muestra en el navegador; no se guarda en caché */
  @Get('documentos/:id/archivo')
  @RequierePermisos('INFO_COMERCIAL_VER')
  async archivo(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario, @Res() res: Response) {
    const a = await this.expediente.archivo(id, s);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nombre)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(a.datos);
  }

  @Delete('documentos/:id')
  @RequierePermisos('INFO_COMERCIAL_VER')
  eliminar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.expediente.eliminar(id, s);
  }
}