import { Module } from '@nestjs/common';
import { EsignController } from './esign.controller';
import { ClicksignWebhookController } from './clicksign-webhook.controller';
import { EsignService } from './esign.service';
import { PrismaService } from '../../database/prisma.service';
import { ChavesModule } from '../chaves/chaves.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports:     [ChavesModule, NotificationsModule, WhatsappModule],
  controllers: [EsignController, ClicksignWebhookController],
  providers:   [EsignService, PrismaService],
  exports:     [EsignService],
})
export class EsignModule {}
