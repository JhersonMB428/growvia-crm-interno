import { Equals, IsIn, IsString, Length } from 'class-validator';

/** Etapas en curso: Negociación ↔ Cierre (el cliente aceptó y se está enviando el expediente) */
export class CambiarEtapaDto {
  @IsIn(['NEGOCIACION', 'CIERRE'], { message: 'Etapa no válida' })
  etapa: 'NEGOCIACION' | 'CIERRE';
}

/** Marcar como perdida (con el motivo) */
export class PerderNegociacionDto {
  @IsString({ message: 'Indica el motivo de la pérdida' })
  @Length(3, 200, { message: 'Indica el motivo de la pérdida' })
  motivoPerdida: string;
}

/** Marcar como ganada: solo cuando el expediente ya se envió a back office por correo */
export class GanarNegociacionDto {
  @Equals(true, { message: 'Confirma que ya enviaste el expediente a back office por correo' })
  expedienteEnviado: boolean;
}