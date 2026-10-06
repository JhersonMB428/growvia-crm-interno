import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsUUID, ValidateNested } from 'class-validator';
import { ItemDto } from './item.dto';

export class GuardarNegociacionDto {
  @IsIn(['NUEVA', 'AMPLIACION'], { message: 'Elige el tipo de negociación' })
  tipo: 'NUEVA' | 'AMPLIACION';

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