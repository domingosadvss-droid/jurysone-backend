import { Module } from '@nestjs/common';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { CaixaWhatsappController } from './caixa-whatsapp.controller';
import { WebhookWhatsappController } from './webhook-whatsapp.controller';
import { CaixaWhatsappService } from './caixa.service';
import { ConexoesWhatsappService } from './conexoes.service';
import { MidiaWhatsappService } from './midia.service';
import { RegistroMensagensService } from './registro-mensagens.service';
import { WebhookWhatsappService } from './webhook-whatsapp.service';

/** WhatsApp pela API oficial da Meta (Cloud API, com coexistência): conexão, webhook, anexos e caixa */
@Module({
  imports: [ArquivosModule],
  controllers: [CaixaWhatsappController, WebhookWhatsappController],
  providers: [CaixaWhatsappService, ConexoesWhatsappService, MidiaWhatsappService, RegistroMensagensService, WebhookWhatsappService],
  exports: [ConexoesWhatsappService, CaixaWhatsappService],
})
export class WhatsappOficialModule {}
