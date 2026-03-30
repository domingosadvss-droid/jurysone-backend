import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'joao@escritorio.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'M1nha$en#aForte',
    description: 'Min 8 chars, 1 maiúscula, 1 número, 1 símbolo',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, {
    message: 'Senha fraca: use maiúscula, número e símbolo',
  })
  password: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  oabNumber?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  oabState?: string;

  @ApiPropertyOptional({ example: 'Silva & Associados' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  officeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ example: 'TRIAL30' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  couponCode?: string;
}
