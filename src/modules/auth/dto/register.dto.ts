import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Corpo de POST /auth/register — campos enviados pelo login.html. */
export class RegisterDto {
  @ApiProperty({ example: 'joao@escritorio.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(150)
  email: string;

  @ApiProperty({ example: 'Senha2026!', description: 'Mínimo 8 caracteres, com letras e números' })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  @MaxLength(100)
  @Matches(/^(?=.*[A-Za-z])(?=.*[0-9])/, { message: 'A senha deve conter letras e números' })
  password: string;

  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  @MinLength(2, { message: 'Informe seu nome' })
  @MaxLength(100)
  nome: string;

  @ApiProperty({ example: 'Silva Advocacia' })
  @IsString()
  @MinLength(2, { message: 'Informe o nome do escritório' })
  @MaxLength(150)
  nomeEscritorio: string;
}
