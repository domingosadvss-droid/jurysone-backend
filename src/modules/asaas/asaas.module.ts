import { Module } from '@nestjs/common';
import { AsaasService } from './asaas.service';
import { AsaasWebhookController } from './asaas-webhook.controller';
import { ChavesModule } from '../chaves/chaves.module';

@Module({
  imports:     [ChavesModule],
  controllers: [AsaasWebhookController],
  providers:   [AsaasService],
  exports:     [AsaasService],
})
export class AsaasModule {}
