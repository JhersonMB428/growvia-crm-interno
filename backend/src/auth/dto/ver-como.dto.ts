import { IsUUID } from 'class-validator';

export class VerComoDto {
  @IsUUID('4', { message: 'Elige un usuario' })
  usuarioId: string;
}
