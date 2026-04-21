import { Module } from '@nestjs/common';
import { AsaasService } from './asaas.service';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { ChavesModule } from '../chaves/chaves.module';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports:     [ChavesModule],
  controllers: [AsaasWebhookController],
  providers:   [AsaasService, PrismaService],
  exports:     [AsaasService],
})
export class AsaasModule {}
