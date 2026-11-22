import { Module } from '@nestjs/common';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { CaixaWhatsappController } from './caixa-whatsapp.controller';
import { WebhookWhatsappController } from './webhook-whatsapp.controller';
import { CaixaWhatsappService } from './caixa.service';
import { ConexoesWhatsappService } from './conexoes.service';
import { MidiaWhatsappService } from './midia.service';
import { RegistroMensagensService } from './registro-mensagens.service';
import { WebhookWhatsappService } from './webhook-whatsapp.service';
import { WhatsappWebService } from './whatsapp-web.service';

/**
 * WhatsApp pela API oficial da Meta (Cloud API, com coexistência): conexão, webhook, anexos e caixa.
 * Para testes, também conecta pelo WhatsApp Web (QR Code) e usa a mesma caixa.
 */
@Module({
  imports: [ArquivosModule],
  controllers: [CaixaWhatsappController, WebhookWhatsappController],
  providers: [CaixaWhatsappService, ConexoesWhatsappService, MidiaWhatsappService, RegistroMensagensService, WebhookWhatsappService, WhatsappWebService],
  exports: [ConexoesWhatsappService, CaixaWhatsappService, WhatsappWebService],
})
export class WhatsappOficialModule {}
