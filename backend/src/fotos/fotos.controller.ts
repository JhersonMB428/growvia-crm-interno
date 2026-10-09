import { Controller, Delete, Get, Param, ParseUUIDPipe, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { FotosService, MAX_FOTO_MB, type FotoSubida } from './fotos.service';

@Controller()
export class FotosController {
  constructor(private readonly fotos: FotosService) {}

  /** Cambiar mi foto */
  @Put('perfil/foto')
  @UseInterceptors(FileInterceptor('foto', { limits: { fileSize: MAX_FOTO_MB * 1024 * 1024, files: 1 } }))
  subir(@UploadedFile() archivo: FotoSubida, @UsuarioActual() s: SesionUsuario) {
    return this.fotos.subir(s, archivo);
  }

  /** Quitar mi foto (vuelven las iniciales) */
  @Delete('perfil/foto')
  quitarMia(@UsuarioActual() s: SesionUsuario) {
    return this.fotos.quitarMia(s);
  }

  /** Ver la foto de un usuario (con sesión iniciada) */
  @Get('usuarios/:id/foto')
  async ver(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { datos, mime } = await this.fotos.leer(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(datos);
  }

  /** Back office y administración: quitar una foto inapropiada */
  @Delete('admin/usuarios/:id/foto')
  @RequierePermisos('USUARIO_CREAR')
  quitarDeOtro(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.fotos.quitarDeOtro(id, s);
  }
}