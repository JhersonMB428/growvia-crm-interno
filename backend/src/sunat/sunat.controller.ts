import { Controller, Get, Param } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SunatService } from './sunat.service';

@Controller('sunat')
export class SunatController {
  constructor(private readonly sunat: SunatService) {}

  /** ¿Está configurada la consulta? (si no, el botón "Traer de SUNAT" no aparece) */
  @Get('estado')
  estado() {
    return { activo: this.sunat.activo };
  }

  /** Datos de SUNAT de un RUC: razón social, estado, condición, ubicación y representantes legales */
  @Get('ruc/:ruc')
  @RequierePermisos('REPOSITORIO_VER')
  consultar(@Param('ruc') ruc: string) {
    return this.sunat.consultar(ruc.replace(/\D/g, ''));
  }
}
