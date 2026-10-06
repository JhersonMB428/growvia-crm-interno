import { IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Ingresa un correo válido' })
  @MaxLength(150)
  email: string;

  @IsString()
  @Length(1, 100, { message: 'Ingresa tu contraseña' })
  password: string;

  /** Identificador aleatorio que el navegador guarda para "Recordar este equipo" */
  @IsOptional()
  @IsString()
  @Length(16, 100)
  huella?: string;
}
