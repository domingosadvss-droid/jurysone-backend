import { Module } from '@nestjs/common';
import { StatusFlowService } from './status-flow.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [StatusFlowService, PrismaService],
  exports: [StatusFlowService],
})
export class StatusFlowModule {}
