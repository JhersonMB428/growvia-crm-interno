import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class VerComoDto {
  @IsUUID('4', { message: 'Elige un usuario' })
  usuarioId: string;
}

export class ElegirRolDto {
  @IsIn(['ADMIN', 'GERENTE', 'SUPERVISOR', 'BACKOFFICE', 'ASESOR'], { message: 'Elige un rol' })
  rol: string;

  @IsOptional()
  @IsUUID('4', { message: 'Elige un equipo' })
  equipoId?: string;
}
