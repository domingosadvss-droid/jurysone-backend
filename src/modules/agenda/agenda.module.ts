/**
 * JURYSONE — Agenda Module
 *
 * Registra:
 *   - AgendaController   → endpoints REST da agenda
 *   - AgendaService      → lógica de negócio
 *   - AgendaNotificacoesCronService (B-009) → cron de notificações
 *   - ScheduleModule.forRoot() → habilita @Cron decorators
 */
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';
import { AgendaNotificacoesCronService } from './agenda-notificacoes-cron.service';
import { GoogleCalendarService } from './google-calendar.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [
    // Habilita o agendador de cron jobs neste módulo
    ScheduleModule.forRoot(),
  ],
  controllers: [AgendaController],
  providers: [
    AgendaService,
    AgendaNotificacoesCronService, // B-009: cron de notificações
    GoogleCalendarService,         // Integração Google Calendar OAuth2
    PrismaService,
  ],
  exports: [AgendaService, GoogleCalendarService],
})
export class AgendaModule {}
