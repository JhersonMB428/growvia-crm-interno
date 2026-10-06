import { IsJWT } from 'class-validator';

export class ReenviarDto {
  @IsJWT()
  desafio: string;
}
