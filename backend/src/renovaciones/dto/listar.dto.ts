import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListarRenovacionesDto {
  /** proximas: vencen dentro de la ventana · vencidas · renovadas (solo nuestros contratos) · todas */
  @IsOptional()
  @IsIn(['proximas', 'vencidas', 'renovadas', 'todas'], { message: 'Filtro no válido' })
  filtro?: 'proximas' | 'vencidas' | 'renovadas' | 'todas';

  /** Ventana en días para "proximas" (por defecto, el parámetro dias_primer_aviso_renovacion) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  dias?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}