import { IsString, IsEmail, IsNumber, IsOptional, IsBoolean, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ClienteDataDto {
  @IsString()
  nome: string;

  @IsString()
  cpf: string;

  @IsOptional()
  @IsString()
  rg?: string;

  @IsString()
  dataNascimento: string;

  @IsString()
  telefone: string;

  @IsEmail()
  email: string;

  @IsObject()
  endereco: {
    cep?: string;
    rua?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
  };
}

export class MenorDataDto {
  @IsString()
  nome: string;

  @IsString()
  dataNascimento: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  rg?: string;

  @IsString()
  tipoResponsavel: string; // pai, mae, tutor
}

export class CreateAtendimentoDto {
  @ValidateNested()
  @Type(() => ClienteDataDto)
  cliente: ClienteDataDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MenorDataDto)
  menor?: MenorDataDto;

  @IsString()
  tipoRepresentacao: string; // proprio, menor

  // Case data
  @IsString()
  area: string; // Trabalhista, Empresarial, Família, etc

  @IsString()
  tipoAcao: string;

  @IsOptional()
  @IsNumber()
  valorAcao?: number;

  // Financial data
  @IsString()
  tipoHonorario: string; // fixo, percentual, fixo_sucesso

  @IsOptional()
  @IsNumber()
  valorFixo?: number;

  @IsOptional()
  @IsNumber()
  percentualExito?: number;

  @IsOptional()
  @IsString()
  formaPagamento?: string;

  @IsOptional()
  @IsBoolean()
  parcelamento?: boolean;

  @IsOptional()
  @IsNumber()
  numParcelas?: number;

  @IsOptional()
  @IsString()
  vencimento1Parc?: string; // ISO date

  // Questionnaire
  @IsOptional()
  @IsObject()
  questionario?: any;

  // Document envelope
  @IsOptional()
  @IsString()
  mensagem?: string;
}
