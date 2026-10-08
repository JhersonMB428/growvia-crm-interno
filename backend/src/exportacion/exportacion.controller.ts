import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, Matches } from 'class-validator';
import type { Response } from 'express';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { ExportacionService, REPORTES, type Reporte } from './exportacion.service';

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

class ExportarDto {
  @IsOptional() @Matches(MES, { message: 'Mes no válido (AAAA-MM)' }) desde?: string;
  @IsOptional() @Matches(MES, { message: 'Mes no válido (AAAA-MM)' }) hasta?: string;
  /** Solo para la cartera: incluir nombres, celulares y correos */
  @IsOptional() @Transform(({ value }) => value === 'true' || value === '1' || value === true) @IsBoolean() contactos?: boolean;
}

/** Solo gerencia exporta. Asesores, supervisores y back office no pueden descargar datos. */
@Controller('exportar')
export class ExportacionController {
  constructor(private readonly exportacion: ExportacionService) {}

  @Get(':tipo')
  @RequierePermisos('DATOS_EXPORTAR')
  async exportar(@Param('tipo') tipo: string, @Query() f: ExportarDto, @UsuarioActual() s: SesionUsuario, @Res() res: Response) {
    if (!REPORTES.includes(tipo as Reporte)) throw new BadRequestException('Reporte no válido');
    const r = await this.exportacion.generar(tipo as Reporte, f, s);
    res.locals.bitacora = { filas: r.filas, periodo: r.periodo }; // queda en la bitácora
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${r.nombre}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Filas', String(r.filas));
    res.send(r.archivo);
  }
}