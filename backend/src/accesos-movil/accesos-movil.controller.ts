import { Body, Controller, Get, Ip, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { Publico } from '../auth/decorators/publico.decorator';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AccesosMovilService, MAX_DIAS } from './accesos-movil.service';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

class SolicitarDto {
  @IsString() @Length(5, 300, { message: 'Cuéntale a gerencia para qué lo necesitas (mínimo 5 caracteres)' }) motivo: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(MAX_DIAS, { message: `Máximo ${MAX_DIAS} días` }) dias: number;
}
class SolicitarCelularDto extends SolicitarDto {
  /** Permiso temporal que entregó el login al bloquear el celular */
  @IsString() permiso: string;
}
class AprobarDto {
  @Matches(FECHA, { message: 'Elige hasta qué día' }) hasta: string;
  @IsOptional() @IsString() @Length(0, 300) respuesta?: string;
}
class RechazarDto {
  @IsString() @Length(3, 300, { message: 'Escribe el motivo (mínimo 3 caracteres)' }) respuesta: string;
}
class RevocarDto {
  @IsOptional() @IsString() @Length(0, 300) respuesta?: string;
}
class OtorgarDto {
  @IsUUID('all', { message: 'Elige a quién' }) usuarioId: string;
  @Matches(FECHA, { message: 'Elige hasta qué día' }) hasta: string;
  @IsString() @Length(3, 300, { message: 'Escribe el motivo (mínimo 3 caracteres)' }) motivo: string;
}
class ListarDto {
  @IsOptional() @IsIn(['pendientes', 'vigentes', 'historial']) vista: 'pendientes' | 'vigentes' | 'historial' = 'pendientes';
}

@Controller('accesos-moviles')
export class AccesosMovilController {
  constructor(private readonly accesos: AccesosMovilService) {}

  /** Desde el celular bloqueado (sin sesión: usa el permiso temporal del login) */
  @Publico()
  @Post('solicitar-celular')
  solicitarCelular(@Body() dto: SolicitarCelularDto, @Ip() ip: string) {
    return this.accesos.solicitarDesdeCelular(dto.permiso, dto.motivo, dto.dias, ip);
  }

  /** Cualquier usuario, desde su perfil */
  @Get('mio')
  mio(@UsuarioActual() s: SesionUsuario) {
    return this.accesos.mio(s);
  }

  @Post()
  solicitar(@Body() dto: SolicitarDto, @UsuarioActual() s: SesionUsuario) {
    return this.accesos.solicitar(dto.motivo, dto.dias, s);
  }

  // ───── Gerencia ─────
  @Get()
  @RequierePermisos('ACCESO_MOVIL_APROBAR')
  listar(@Query() f: ListarDto) {
    return this.accesos.listar(f.vista);
  }

  @Get('usuarios')
  @RequierePermisos('ACCESO_MOVIL_APROBAR')
  usuarios() {
    return this.accesos.usuarios();
  }

  @Post('otorgar')
  @RequierePermisos('ACCESO_MOVIL_APROBAR')
  otorgar(@Body() dto: OtorgarDto, @UsuarioActual() s: SesionUsuario) {
    return this.accesos.otorgar(dto.usuarioId, dto.hasta, dto.motivo, s);
  }

  @Post(':id/aprobar')
  @RequierePermisos('ACCESO_MOVIL_APROBAR')
  aprobar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AprobarDto, @UsuarioActual() s: SesionUsuario) {
    return this.accesos.aprobar(id, dto.hasta, dto.respuesta, s);
  }

  @Post(':id/rechazar')
  @RequierePermisos('ACCESO_MOVIL_APROBAR')
  rechazar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RechazarDto, @UsuarioActual() s: SesionUsuario) {
    return this.accesos.rechazar(id, dto.respuesta, s);
  }

  @Post(':id/revocar')
  @RequierePermisos('ACCESO_MOVIL_APROBAR')
  revocar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevocarDto, @UsuarioActual() s: SesionUsuario) {
    return this.accesos.revocar(id, dto.respuesta, s);
  }
}