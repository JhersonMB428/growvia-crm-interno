import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';
import { CANALES, type Canal } from './crear-gestion.dto';

export class ReprogramarDto {
  @Type(() => Date)
  @IsDate({ message: 'Elige la nueva fecha y hora' })
  proximaAccion: Date;

  @IsOptional()
  @IsIn(CANALES, { message: 'Canal no válido' })
  proximoCanal?: Canal;
}