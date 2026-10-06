import { IsUUID } from 'class-validator';

export class ReasignarDto {
  @IsUUID('4', { message: 'Elige el asesor' })
  asesorId: string;
}