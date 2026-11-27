import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';

/** Una persona de la empresa (representante, otro contacto o alguien que agrega la asesora) */
export class PersonaDto {
  @IsString()
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres' })
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'El cargo tiene máximo 80 caracteres' })
  cargo?: string;

  @IsOptional()
  @ValidateIf((o: PersonaDto) => !!o.celular)
  @Matches(/^[90]\d{8}$/, { message: 'El teléfono debe tener 9 dígitos: celular (9…) o fijo con código de ciudad (01…, 044…)' })
  celular?: string;

  @IsOptional()
  @ValidateIf((o: PersonaDto) => !!o.dni)
  @Matches(/^\d{8}$/, { message: 'El DNI debe tener 8 dígitos' })
  dni?: string;

  @IsOptional()
  @ValidateIf((o: PersonaDto) => !!o.correo)
  @IsEmail({}, { message: 'El correo no es válido' })
  correo?: string;

  @IsOptional()
  @IsBoolean()
  decisor?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La nota tiene máximo 200 caracteres' })
  nota?: string;
}

export const ESTADOS_MEDIO = ['SIN_PROBAR', 'FUNCIONA', 'NO_CONTESTA', 'NO_EXISTE', 'EQUIVOCADO'] as const;

export class EstadoMedioDto {
  @IsIn(ESTADOS_MEDIO, { message: 'Estado no válido' })
  estado: (typeof ESTADOS_MEDIO)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La nota tiene máximo 200 caracteres' })
  nota?: string;
}

export class NuevoMedioDto {
  @IsIn(['TELEFONO', 'CORREO'], { message: 'Elige teléfono o correo' })
  tipo: 'TELEFONO' | 'CORREO';

  @IsString()
  @Length(5, 150, { message: 'Escribe el teléfono o correo' })
  valor: string;
}
