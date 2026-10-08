import { Controller, Get, Query } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { EmbudoDto } from './dto/embudo.dto';
import { EmbudoService } from './embudo.service';

@Controller('embudo')
export class EmbudoController {
  constructor(private readonly embudo: EmbudoService) {}

  /** Embudo, cierres, motivos de pérdida y estancadas (supervisor: su equipo · gerencia: todo) */
  @Get()
  @RequierePermisos('REPORTE_VER')
  reporte(@Query() f: EmbudoDto, @UsuarioActual() s: SesionUsuario) {
    return this.embudo.reporte(f, s);
  }
}