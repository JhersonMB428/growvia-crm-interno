import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/** Contrato del prospecto con su operador actual. Ambos en null = no se sabe. */
export class ContratoActualDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt({ message: 'Operador no válido' })
  operadorId: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsDateString({ strict: true }, { message: 'Escribe la fecha de fin de contrato' })
  finContrato: string | null;

  /** Cantidad de líneas que tiene hoy con su operador */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt({ message: 'La cantidad de líneas debe ser un número entero' })
  @Min(0, { message: 'La cantidad de líneas no puede ser negativa' })
  @Max(10000, { message: 'La cantidad de líneas no puede pasar de 10 000' })
  lineas?: number | null;
}