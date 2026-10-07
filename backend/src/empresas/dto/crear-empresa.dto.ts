import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length, Matches, ValidateNested } from 'class-validator';
import { ContactoDto } from './contacto.dto';

export class CrearEmpresaDto {
  @Matches(/^(10|20)\d{9}$/, { message: 'El RUC debe tener 11 dígitos y empezar con 10 o 20' })
  ruc: string;

  @IsString()
  @Length(3, 200, { message: 'Ingresa la razón social' })
  razonSocial: string;

  @Matches(/^\d{6}$/, { message: 'Elige el distrito' })
  distritoId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Registra al menos un contacto' })
  @ArrayMaxSize(2, { message: 'Máximo 2 contactos por empresa' })
  @ValidateNested({ each: true })
  @Type(() => ContactoDto)
  contactos: ContactoDto[];
}

export class GuardarContactosDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Registra al menos un contacto' })
  @ArrayMaxSize(2, { message: 'Máximo 2 contactos por empresa' })
  @ValidateNested({ each: true })
  @Type(() => ContactoDto)
  contactos: ContactoDto[];
}

/** Back office corrige datos de la empresa (el RUC no se cambia) */
export class CorregirEmpresaDto {
  @IsString()
  @Length(3, 200, { message: 'Ingresa la razón social' })
  razonSocial: string;

  @Matches(/^\d{6}$/, { message: 'Elige el distrito' })
  distritoId: string;
}