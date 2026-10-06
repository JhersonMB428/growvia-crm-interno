import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class MesDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mes no válido (AAAA-MM)' })
  mes?: string;
}

export class GuardarMetaDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mes no válido (AAAA-MM)' })
  mes: string;

  @IsIn(['ASESOR', 'EQUIPO'])
  alcance: 'ASESOR' | 'EQUIPO';

  /** id del asesor o del equipo */
  @IsUUID('4')
  id: string;

  @Type(() => Number)
  @IsInt({ message: 'La meta debe ser un número entero de líneas' })
  @Min(0)
  @Max(100000)
  metaLineas: number;
}