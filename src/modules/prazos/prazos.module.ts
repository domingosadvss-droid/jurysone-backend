import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrazosController } from './prazos.controller';
import { PrazosService } from './prazos.service';
import { PrazosAlertasCronService } from './prazos-alertas-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PublicacoesModule } from '../publicacoes/publicacoes.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    NotificationsModule,
    PublicacoesModule, // AgendaPrazosService: prazo manual também vai para a agenda e o Google
  ],
  controllers: [PrazosController],
  providers: [PrazosService, PrazosAlertasCronService],
  exports: [PrazosService],
})
export class PrazosModule {}
