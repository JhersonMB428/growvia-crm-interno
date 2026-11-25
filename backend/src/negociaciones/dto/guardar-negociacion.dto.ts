import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { ItemDto } from './item.dto';

/** Servicios negociados (ya no se elige tipo ni plazo del contrato) */
export class GuardarNegociacionDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Agrega al menos un servicio' })
  @ArrayMaxSize(20, { message: 'Máximo 20 servicios por negociación' })
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}

export class CrearNegociacionDto extends GuardarNegociacionDto {
  @IsUUID('4', { message: 'Empresa no válida' })
  clienteId: string;
}