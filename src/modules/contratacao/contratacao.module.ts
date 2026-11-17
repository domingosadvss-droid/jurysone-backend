import { Module } from '@nestjs/common';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { ChavesModule } from '../chaves/chaves.module';
import { EsignModule } from '../esign/esign.module';
import { ContratacaoController, ContratacaoWebhookController } from './contratacao.controller';
import { ContratacaoService } from './contratacao.service';

@Module({
  imports: [ArquivosModule, ChavesModule, EsignModule],
  controllers: [ContratacaoController, ContratacaoWebhookController],
  providers: [ContratacaoService],
})
export class ContratacaoModule {}
