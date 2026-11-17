import { Module, forwardRef } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ChavesModule } from '../chaves/chaves.module';
import { ConflitosModule } from '../conflitos/conflitos.module';
import { DatajudModule } from '../datajud/datajud.module';
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

@Module({
  imports: [WhatsappModule, ChavesModule, ConflitosModule, DatajudModule, forwardRef(() => DativaModule)],
  controllers: [
    PublicacoesController, PrazosDjenController, CalendarioController, AgendaGoogleController,
    AgendaGoogleCallbackController, MensagensClienteController, ConciliacoesController,
  ],
  providers: [AgendaPrazosService, AvisosService, PublicacoesService, ImportacaoService, CapturaDjenCron],
  exports: [AgendaPrazosService, AvisosService, PublicacoesService],
})
export class PublicacoesModule {}
