import { Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf } from 'class-validator';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { AdminSistemaService } from './admin-sistema.service';
import { AdminUsuariosService } from './admin-usuarios.service';

const ROLES = ['ASESOR', 'SUPERVISOR', 'GERENTE', 'BACKOFFICE', 'ADMIN'];

class UsuarioDto {
  @IsString() @Length(2, 80, { message: 'Escribe los nombres' }) nombres: string;
  @IsString() @Length(2, 80, { message: 'Escribe los apellidos' }) apellidos: string;
  @IsEmail({}, { message: 'Correo no válido' }) @Length(5, 150) email: string;
  @IsIn(ROLES, { message: 'Elige el rol' }) rol: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('all', { message: 'Equipo no válido' }) equipoId?: string | null;
}
class ListarUsuariosDto {
  @IsOptional() @IsString() @Length(0, 100) q?: string;
  @IsOptional() @IsIn(ROLES) rol?: string;
  @IsOptional() @IsUUID() equipoId?: string;
  @IsOptional() @IsIn(['activos', 'inactivos', 'todos']) estado?: string;
}
class DesactivarDto {
  /** "repositorio" o el id del asesor que recibe sus empresas */
  @IsOptional() @IsString() destino?: string;
}
class EquipoDto {
  @IsString() @Length(2, 60, { message: 'Escribe el nombre del equipo' }) nombre: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID('all', { message: 'Supervisor no válido' }) supervisorId?: string | null;
  @IsOptional() @IsBoolean() activo?: boolean;
}
class PlanDto {
  @IsIn(['MOVIL', 'FIJA'], { message: 'Elige si es móvil o fija' }) tipo: 'MOVIL' | 'FIJA';
  @IsString() @Length(2, 60, { message: 'Escribe el nombre del plan' }) nombre: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Cargo fijo no válido' }) @Min(0) @Max(99999) cargoRef: number;
  @IsOptional() @IsBoolean() activo?: boolean;
}
class OperadorDto {
  @IsString() @Length(2, 40, { message: 'Escribe el nombre del operador' }) nombre: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
class ParametroDto {
  @IsString() @Length(1, 20) valor: string;
}

/** Usuarios y equipos: administración y back office (back office solo asesores y supervisores) */
@Controller('admin')
export class AdminUsuariosController {
  constructor(private readonly usuarios: AdminUsuariosService) {}

  @Get('usuarios/catalogos')
  @RequierePermisos('USUARIO_CREAR')
  catalogos(@UsuarioActual() s: SesionUsuario) { return this.usuarios.catalogos(s); }

  @Get('usuarios')
  @RequierePermisos('USUARIO_CREAR')
  listar(@Query() f: ListarUsuariosDto, @UsuarioActual() s: SesionUsuario) { return this.usuarios.listar(f, s); }

  @Post('usuarios')
  @RequierePermisos('USUARIO_CREAR')
  crear(@Body() dto: UsuarioDto, @UsuarioActual() s: SesionUsuario) { return this.usuarios.crear(dto, s); }

  @Put('usuarios/:id')
  @RequierePermisos('USUARIO_CREAR')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UsuarioDto, @UsuarioActual() s: SesionUsuario) { return this.usuarios.editar(id, dto, s); }

  @Post('usuarios/:id/clave')
  @RequierePermisos('USUARIO_CREAR')
  clave(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) { return this.usuarios.restablecerClave(id, s); }

  @Post('usuarios/:id/desactivar')
  @RequierePermisos('USUARIO_CREAR')
  desactivar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DesactivarDto, @UsuarioActual() s: SesionUsuario) {
    return this.usuarios.desactivar(id, dto.destino, s);
  }

  @Post('usuarios/:id/reactivar')
  @RequierePermisos('USUARIO_CREAR')
  reactivar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) { return this.usuarios.reactivar(id, s); }

  @Get('equipos')
  @RequierePermisos('USUARIO_CREAR')
  equipos() { return this.usuarios.listarEquipos(); }

  @Post('equipos')
  @RequierePermisos('USUARIO_CREAR')
  crearEquipo(@Body() dto: EquipoDto, @UsuarioActual() s: SesionUsuario) {
    return this.usuarios.guardarEquipo(null, dto.nombre, dto.supervisorId ?? null, true, s);
  }

  @Put('equipos/:id')
  @RequierePermisos('USUARIO_CREAR')
  editarEquipo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EquipoDto, @UsuarioActual() s: SesionUsuario) {
    return this.usuarios.guardarEquipo(id, dto.nombre, dto.supervisorId ?? null, dto.activo ?? true, s);
  }
}

/** Planes, operadores y parámetros: solo administración */
@Controller('admin')
export class AdminSistemaController {
  constructor(private readonly sistema: AdminSistemaService) {}

  @Get('catalogo')
  @RequierePermisos('SISTEMA_CONFIGURAR')
  catalogo() { return this.sistema.catalogo(); }

  @Post('planes')
  @RequierePermisos('SISTEMA_CONFIGURAR')
  crearPlan(@Body() dto: PlanDto) { return this.sistema.guardarPlan(null, dto.tipo, dto.nombre, dto.cargoRef, true); }

  @Put('planes/:id')
  @RequierePermisos('SISTEMA_CONFIGURAR')
  editarPlan(@Param('id', ParseIntPipe) id: number, @Body() dto: PlanDto) {
    return this.sistema.guardarPlan(id, dto.tipo, dto.nombre, dto.cargoRef, dto.activo ?? true);
  }

  @Post('operadores')
  @RequierePermisos('SISTEMA_CONFIGURAR')
  crearOperador(@Body() dto: OperadorDto) { return this.sistema.guardarOperador(null, dto.nombre, true); }

  @Put('operadores/:id')
  @RequierePermisos('SISTEMA_CONFIGURAR')
  editarOperador(@Param('id', ParseIntPipe) id: number, @Body() dto: OperadorDto) {
    return this.sistema.guardarOperador(id, dto.nombre, dto.activo ?? true);
  }

  @Get('parametros')
  @RequierePermisos('SISTEMA_CONFIGURAR')
  parametros() { return this.sistema.listarParametros(); }

  @Put('parametros/:clave')
  @RequierePermisos('SISTEMA_CONFIGURAR')
  guardarParametro(@Param('clave') clave: string, @Body() dto: ParametroDto, @UsuarioActual() s: SesionUsuario) {
    return this.sistema.guardarParametro(clave, dto.valor, s);
  }
}