import { Module, forwardRef } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ChavesModule } from '../chaves/chaves.module';
import { ConflitosModule } from '../conflitos/conflitos.module';
import { DativaModule } from '../dativa/dativa.module';
import {
  AgendaGoogleCallbackController, AgendaGoogleController, CalendarioController, ConciliacoesController,
  MensagensClienteController, PrazosDjenController, PublicacoesController,
} from './publicacoes.controller';
import { PublicacoesService } from './publicacoes.service';
import { ImportacaoService } from './importacao.service';
import { AgendaPrazosService } from './agenda-prazos.service';
import { AvisosService } from './avisos.service';
import { CapturaDjenCron } from './captura.cron';
import { ControlePrazosService } from './controle-prazos.service';
import { ControlePrazosController } from './controle-prazos.controller';

@Module({
  imports: [WhatsappModule, ChavesModule, ConflitosModule, forwardRef(() => DativaModule)],
  controllers: [
    PublicacoesController, PrazosDjenController, CalendarioController, AgendaGoogleController,
    AgendaGoogleCallbackController, MensagensClienteController, ConciliacoesController, ControlePrazosController,
  ],
  providers: [AgendaPrazosService, AvisosService, PublicacoesService, ImportacaoService, CapturaDjenCron, ControlePrazosService],
  exports: [AgendaPrazosService, AvisosService, PublicacoesService],
})
export class PublicacoesModule {}
