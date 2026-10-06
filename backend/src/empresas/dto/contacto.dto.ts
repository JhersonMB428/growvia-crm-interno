import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class ContactoDto {
  @IsString()
  @Length(2, 100, { message: 'El nombre del contacto debe tener entre 2 y 100 caracteres' })
  nombre: string;

  @Matches(/^9\d{8}$/, { message: 'El celular debe tener 9 dígitos y empezar con 9' })
  celular: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo del contacto no es válido' })
  correo?: string;
}