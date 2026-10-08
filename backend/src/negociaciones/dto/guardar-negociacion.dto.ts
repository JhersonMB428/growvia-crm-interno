import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { ItemDto } from './item.dto';

export const PLAZOS = [0, 6, 12, 18, 24, 36];

export class GuardarNegociacionDto {
  /** RENOVACION solo se crea desde Renovaciones (queda unida al contrato que renueva) */
  @IsIn(['NUEVA', 'AMPLIACION', 'RENOVACION'], { message: 'Elige el tipo de negociación' })
  tipo: 'NUEVA' | 'AMPLIACION' | 'RENOVACION';

  /** Meses de contrato (0 = sin plazo forzoso). Si no se envía, 18. */
  @IsOptional()
  @Type(() => Number)
  @IsIn(PLAZOS, { message: 'Elige el plazo del contrato' })
  plazoMeses?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un plan' })
  @ArrayMaxSize(20, { message: 'Máximo 20 planes por negociación' })
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}

export class CrearNegociacionDto extends GuardarNegociacionDto {
  @IsUUID('4', { message: 'Empresa no válida' })
  clienteId: string;
}