import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, ValidateIf } from 'class-validator';

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
}