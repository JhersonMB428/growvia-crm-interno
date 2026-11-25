import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

/** Filtros y paginación de los listados (máximo 50 filas por página: no se puede descargar todo) */
export class ListarEmpresasDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['todas', 'libres', 'asignadas', 'por_vencer'])
  filtro?: 'todas' | 'libres' | 'asignadas' | 'por_vencer';

  @IsOptional()
  @IsIn(['PROSPECTO', 'VENTA'])
  estado?: 'PROSPECTO' | 'VENTA';

  @IsOptional()
  @Matches(/^\d{6}$/)
  distritoId?: string;

  /** Operador actual de la empresa */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  operadorId?: number;

  /** Empresas con al menos esta cantidad de líneas */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  lineasMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(50, { message: 'Se pueden ver como máximo 50 empresas por página' })
  porPagina = 20;
}