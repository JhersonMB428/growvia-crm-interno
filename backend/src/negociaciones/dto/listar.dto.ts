import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListarNegociacionesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID('4')
  clienteId?: string;

  @IsOptional()
  @IsIn(['EN_CURSO', 'GANADA', 'PERDIDA'])
  resultado?: 'EN_CURSO' | 'GANADA' | 'PERDIDA';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(50, { message: 'Se pueden ver como máximo 50 negociaciones por página' })
  porPagina = 20;
}