import { IsBoolean, IsJWT, IsOptional, IsString, Length, Matches } from 'class-validator';

export class VerificarDto {
  @IsJWT()
  desafio: string;

  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos' })
  codigo: string;

  @IsOptional()
  @IsBoolean()
  recordar?: boolean;

  @IsOptional()
  @IsString()
  @Length(16, 100)
  huella?: string;
}
