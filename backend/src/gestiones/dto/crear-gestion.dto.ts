import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';

export const CANALES = ['LLAMADA', 'WHATSAPP', 'CORREO', 'VISITA'] as const;
export const RESULTADOS = ['INTERESADO', 'NO_CONTESTA', 'VOLVER_A_LLAMAR', 'RECHAZA', 'OTRO'] as const;
export type Canal = (typeof CANALES)[number];
/** Resultados que se pueden registrar sin comentario */
export const RESULTADOS_RAPIDOS: string[] = ['NO_CONTESTA', 'RECHAZA'];

export class CrearGestionDto {
  @IsUUID('4', { message: 'Empresa no válida' })
  clienteId: string;

  @IsIn(CANALES, { message: 'Elige el canal' })
  canal: Canal;

  @IsIn(RESULTADOS, { message: 'Elige el resultado' })
  resultado: (typeof RESULTADOS)[number];

  /** Obligatorio salvo en "No contestó" y "No interesado" (se registran con un clic) */
  @ValidateIf((o: CrearGestionDto) => !RESULTADOS_RAPIDOS.includes(o.resultado) || !!o.comentario?.trim())
  @IsString({ message: 'Escribe un comentario (mínimo 3 caracteres)' })
  @Length(3, 2000, { message: 'Escribe un comentario (mínimo 3 caracteres)' })
  comentario?: string;

  /** Fecha y hora de la próxima acción (ISO). Opcional. */
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'La fecha de la próxima acción no es válida' })
  proximaAccion?: Date;

  @ValidateIf((o: CrearGestionDto) => !!o.proximaAccion)
  @IsIn(CANALES, { message: 'Elige cómo será la próxima acción' })
  proximoCanal?: Canal;

  /** Con quién habló (una de las personas de la empresa). Opcional. */
  @IsOptional()
  @IsUUID('4', { message: 'Persona no válida' })
  contactoId?: string;

  /** Teléfono o correo que usó. Opcional. */
  @IsOptional()
  @IsString()
  @MaxLength(150)
  medio?: string;
}