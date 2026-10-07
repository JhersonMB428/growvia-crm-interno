import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length } from 'class-validator';

/** Aprobar, revisar o validar: comentario opcional */
export class DecisionDto {
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  comentario?: string;
}

/** Observar o detener: el motivo es obligatorio */
export class MotivoDto {
  @IsString({ message: 'Escribe el motivo' })
  @Length(3, 1000, { message: 'Escribe el motivo (mínimo 3 caracteres)' })
  comentario: string;
}

/** Validar: los puntos del checklist marcados por back office */
export class ValidarDto extends DecisionDto {
  @IsArray({ message: 'Marca los puntos del checklist' })
  @ArrayMaxSize(30)
  @Type(() => Number)
  @IsInt({ each: true, message: 'Checklist no válido' })
  checklist: number[];
}

export class PosventaDto {
  @IsIn(['CHIPS_ENTREGADOS', 'PORTABILIDAD_EJECUTADA', 'SERVICIO_ACTIVO'], { message: 'Paso de posventa no válido' })
  evento: 'CHIPS_ENTREGADOS' | 'PORTABILIDAD_EJECUTADA' | 'SERVICIO_ACTIVO';

  /** N° de orden o pedido en la plataforma del operador */
  @IsOptional()
  @IsString()
  @Length(0, 40, { message: 'El N° de orden tiene como máximo 40 caracteres' })
  ordenOperador?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  comentario?: string;
}