import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { RequierePermisos } from '../auth/decorators/requiere-permisos.decorator';
import { SesionUsuario, UsuarioActual } from '../auth/decorators/usuario-actual.decorator';
import { ContratoActualDto } from './dto/contrato-actual.dto';
import { CorregirEmpresaDto, CrearEmpresaDto, GuardarContactosDto } from './dto/crear-empresa.dto';
import { ListarEmpresasDto } from './dto/listar.dto';
import { ReasignarDto } from './dto/reasignar.dto';
import { EmpresasService } from './empresas.service';
import { LiberacionService } from './liberacion.service';

@Controller('empresas')
export class EmpresasController {
  constructor(private readonly empresas: EmpresasService, private readonly liberacion: LiberacionService) {}

  /** ¿Existe el RUC? Se llama mientras el asesor escribe, para la alerta roja */
  @Get('ruc/:ruc')
  @RequierePermisos('REPOSITORIO_VER')
  verificarRuc(@Param('ruc') ruc: string) {
    return this.empresas.verificarRuc(ruc);
  }

  /** Cartera del asesor */
  @Get('mias')
  @RequierePermisos('PROSPECTO_CREAR')
  mias(@Query() f: ListarEmpresasDto, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.misEmpresas(f, s);
  }

  /** Repositorio: todas las empresas, solo datos generales */
  @Get('repositorio')
  @RequierePermisos('REPOSITORIO_VER')
  repositorio(@Query() f: ListarEmpresasDto, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.repositorio(f, s);
  }

  /** Asesores activos a los que se puede reasignar una empresa (gerencia y admin) */
  @Get('asesores')
  @RequierePermisos('EMPRESA_REASIGNAR')
  asesores() {
    return this.empresas.asesoresActivos();
  }

  @Post()
  @RequierePermisos('PROSPECTO_CREAR')
  crear(@Body() dto: CrearEmpresaDto, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.crear(dto, s);
  }

  @Get(':id')
  @RequierePermisos('REPOSITORIO_VER')
  detalle(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.detalle(id, s);
  }

  @Post(':id/tomar')
  @RequierePermisos('EMPRESA_TOMAR')
  tomar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.tomar(id, s);
  }

  /** El asesor a cargo o back office (el servicio revisa quién puede) */
  @Put(':id/contactos')
  @RequierePermisos('INFO_COMERCIAL_VER')
  contactos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: GuardarContactosDto, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.guardarContactos(id, dto.contactos, s);
  }

  /** Operador y fin de contrato actuales del prospecto (el servicio revisa quién puede) */
  @Put(':id/contrato-actual')
  @RequierePermisos('INFO_COMERCIAL_VER')
  contratoActual(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ContratoActualDto, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.guardarContratoActual(id, dto.operadorId ?? null, dto.finContrato ?? null, s);
  }

  @Put(':id')
  @RequierePermisos('EMPRESA_EDITAR')
  corregir(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorregirEmpresaDto, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.corregirDatos(id, dto.razonSocial, dto.distritoId, s);
  }

  /** El asesor a cargo suma 24 h al plazo de liberación (una vez hasta su siguiente gestión) */
  @Post(':id/mantener')
  @RequierePermisos('PROSPECTO_CREAR')
  mantener(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.liberacion.mantener(id, s);
  }

  /** El asesor a cargo devuelve la empresa al repositorio */
  @Post(':id/liberar')
  @RequierePermisos('PROSPECTO_CREAR')
  liberar(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.liberacion.devolver(id, s);
  }

  /** Tiempo en la ficha: al abrirla */
  @Post(':id/visitas')
  @RequierePermisos('REPOSITORIO_VER')
  iniciarVisita(@Param('id', ParseUUIDPipe) id: string, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.iniciarVisita(id, s);
  }

  /** Tiempo en la ficha: cada 20 s mientras está visible */
  @Put('visitas/:visitaId')
  @RequierePermisos('REPOSITORIO_VER')
  pulsoVisita(@Param('visitaId', ParseUUIDPipe) visitaId: string, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.pulsoVisita(visitaId, s);
  }

  @Post(':id/reasignar')
  @RequierePermisos('EMPRESA_REASIGNAR')
  reasignar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasignarDto, @UsuarioActual() s: SesionUsuario) {
    return this.empresas.reasignar(id, dto.asesorId, s);
  }
}