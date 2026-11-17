import { Module } from '@nestjs/common';
import { StatusFlowService } from './status-flow.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [StatusFlowService],
  exports: [StatusFlowService],
})
export class StatusFlowModule {}
