import { ConhecimentoModule } from '../conhecimento/conhecimento.module';
import { Module, forwardRef } from '@nestjs/common';
import { ConflitosModule } from '../conflitos/conflitos.module';
import { LinhaProducaoModule } from '../linha-producao/linha-producao.module';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { ChavesModule } from '../chaves/chaves.module';
import { PublicacoesModule } from '../publicacoes/publicacoes.module';
import { DativaController, DativaEmailController } from './dativa.controller';
import { DativaService } from './dativa.service';

@Module({
  imports: [ConflitosModule, LinhaProducaoModule, ArquivosModule, ChavesModule, ConhecimentoModule, forwardRef(() => PublicacoesModule)],
  controllers: [DativaController, DativaEmailController],
  providers: [DativaService],
  exports: [DativaService],
})
export class DativaModule {}
