import { Module, forwardRef } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { StatusFlowModule } from '../status-flow/status-flow.module';
import { AutomacoesModule } from '../automacoes/automacoes.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    StatusFlowModule,
    forwardRef(() => AutomacoesModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
