import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrazosController } from './prazos.controller';
import { PrazosService } from './prazos.service';
import { PrazosAlertasCronService } from './prazos-alertas-cron.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NotificationsModule,
  ],
  controllers: [PrazosController],
  providers: [PrazosService, PrazosAlertasCronService, PrismaService],
  exports: [PrazosService],
})
export class PrazosModule {}
