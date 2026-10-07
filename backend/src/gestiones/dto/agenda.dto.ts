import { Matches } from 'class-validator';

export class AgendaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha inicial no válida (AAAA-MM-DD)' })
  desde: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Fecha final no válida (AAAA-MM-DD)' })
  hasta: string;
}