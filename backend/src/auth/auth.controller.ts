import { Body, Controller, Get, HttpCode, Ip, Post, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Publico } from './decorators/publico.decorator';
import { SesionUsuario, UsuarioActual } from './decorators/usuario-actual.decorator';
import { LoginDto } from './dto/login.dto';
import { ReenviarDto } from './dto/reenviar.dto';
import { VerificarDto } from './dto/verificar.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Paso 1: correo y contraseña. Responde con la sesión o pide el código del correo. */
  @Publico()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Headers('user-agent') ua = '', @Ip() ip: string) {
    return this.auth.login(dto, ua, ip);
  }

  /** Paso 2: código de 6 dígitos que llegó al correo */
  @Publico()
  @Post('verificar')
  @HttpCode(200)
  verificar(@Body() dto: VerificarDto, @Headers('user-agent') ua = '') {
    return this.auth.verificar(dto, ua);
  }

  /** Pedir otro código (máximo uno por minuto) */
  @Publico()
  @Post('reenviar')
  @HttpCode(200)
  reenviar(@Body() dto: ReenviarDto, @Ip() ip: string) {
    return this.auth.reenviar(dto.desafio, ip);
  }

  /** Datos del usuario con sesión: nombre, rol, equipo y permisos */
  @Get('yo')
  yo(@UsuarioActual() usuario: SesionUsuario) {
    return this.auth.perfil(usuario.sub);
  }
}
