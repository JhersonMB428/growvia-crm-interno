import { IsIn, IsOptional, IsString, Length } from 'class-validator';

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

export class PosventaDto {
  @IsIn(['CHIPS_ENTREGADOS', 'PORTABILIDAD_EJECUTADA', 'SERVICIO_ACTIVO'], { message: 'Paso de posventa no válido' })
  evento: 'CHIPS_ENTREGADOS' | 'PORTABILIDAD_EJECUTADA' | 'SERVICIO_ACTIVO';

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  comentario?: string;
}