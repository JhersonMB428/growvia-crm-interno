import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class ContactoDto {
  @IsString()
  @Length(2, 100, { message: 'El nombre del contacto debe tener entre 2 y 100 caracteres' })
  nombre: string;

  /** Celular (9…) o fijo con código de ciudad (01…, 044…): siempre 9 dígitos */
  @Matches(/^[90]\d{8}$/, { message: 'El teléfono debe tener 9 dígitos: celular (9…) o fijo con código de ciudad (01…, 044…)' })
  celular: string;

  /** DNI del representante legal (solo en el contacto 1) */
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni?: string;

  @IsOptional()
  @IsEmail({}, { message: 'El correo del contacto no es válido' })
  correo?: string;
}