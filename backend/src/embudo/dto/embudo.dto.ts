import { IsOptional, IsUUID, Matches } from 'class-validator';

export class EmbudoDto {
  /** Mes inicial y final (AAAA-MM). Por defecto, el mes actual. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mes no válido (AAAA-MM)' })
  desde?: string;

  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mes no válido (AAAA-MM)' })
  hasta?: string;

  /** Solo gerencia: filtrar por equipo */
  @IsOptional()
  @IsUUID('4', { message: 'Equipo no válido' })
  equipoId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Asesor no válido' })
  asesorId?: string;
}