import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ItemDto {
  @Type(() => Number)
  @IsInt({ message: 'Elige el plan' })
  planId: number;

  @IsIn(['NUEVA', 'PORTABILIDAD'], { message: 'Elige si es línea nueva o portabilidad' })
  modalidad: 'NUEVA' | 'PORTABILIDAD';

  /** Solo en portabilidad: de qué operador viene */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Elige el operador de origen' })
  operadorOrigenId?: number | null;

  @Type(() => Number)
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor a 0' })
  @Max(5000, { message: 'La cantidad máxima por plan es 5000' })
  cantidad: number;

  /** Cargo fijo mensual por unidad (S/) */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El cargo fijo debe tener como máximo 2 decimales' })
  @Min(0, { message: 'El cargo fijo no puede ser negativo' })
  @Max(99999, { message: 'El cargo fijo es demasiado alto' })
  cargoFijoUnit: number;
}