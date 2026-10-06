import { IsIn, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class CambiarEtapaDto {
  @IsIn(['PROSPECCION', 'CONTACTO', 'NEGOCIACION'], { message: 'Etapa no válida' })
  etapa: 'PROSPECCION' | 'CONTACTO' | 'NEGOCIACION';
}

export class CerrarNegociacionDto {
  @IsIn(['GANADA', 'PERDIDA'], { message: 'Indica si la negociación se ganó o se perdió' })
  resultado: 'GANADA' | 'PERDIDA';

  @ValidateIf((o: CerrarNegociacionDto) => o.resultado === 'PERDIDA')
  @IsString({ message: 'Indica el motivo de la pérdida' })
  @Length(3, 200, { message: 'Indica el motivo de la pérdida' })
  motivoPerdida?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  detalle?: string;
}