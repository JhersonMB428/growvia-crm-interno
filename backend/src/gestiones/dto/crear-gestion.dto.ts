import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

export const CANALES = ['LLAMADA', 'WHATSAPP', 'CORREO', 'VISITA'] as const;
export const RESULTADOS = ['INTERESADO', 'NO_CONTESTA', 'VOLVER_A_LLAMAR', 'RECHAZA', 'OTRO'] as const;
export type Canal = (typeof CANALES)[number];

export class CrearGestionDto {
  @IsUUID('4', { message: 'Empresa no válida' })
  clienteId: string;

  @IsIn(CANALES, { message: 'Elige el canal' })
  canal: Canal;

  @IsIn(RESULTADOS, { message: 'Elige el resultado' })
  resultado: (typeof RESULTADOS)[number];

  @IsString()
  @Length(3, 2000, { message: 'Escribe un comentario (mínimo 3 caracteres)' })
  comentario: string;

  /** Fecha y hora de la próxima acción (ISO). Opcional. */
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de la próxima acción no es válida' })
  proximaAccion?: Date;

  @ValidateIf((o: CrearGestionDto) => !!o.proximaAccion)
  @IsIn(CANALES, { message: 'Elige cómo será la próxima acción' })
  proximoCanal?: Canal;
}