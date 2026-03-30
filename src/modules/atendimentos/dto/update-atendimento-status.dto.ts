import { IsString, IsIn } from 'class-validator';

export class UpdateAtendimentoStatusDto {
  @IsString()
  @IsIn([
    'atendendo',
    'aguardando_assinatura',
    'assinado',
    'iniciando',
    'ativo',
    'encerrado',
  ])
  status: string;
}
