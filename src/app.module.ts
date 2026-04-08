/**
 * JURYSONE — App Root Module
 *
 * Importa todos os módulos de funcionalidade da aplicação.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

// ── Módulos estruturados ───────────────────────────────────────────────────
import { AgendaModule } from './modules/agenda/agenda.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AtendimentosModule } from './modules/atendimentos/atendimentos.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomacoesModule } from './modules/automacoes/automacoes.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { CrmModule } from './modules/crm/crm.module';
import { DatajudModule } from './modules/datajud/datajud.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { EsignModule } from './modules/esign/esign.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { IntimacoesModule } from './modules/intimacoes/intimacoes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ParceirosModule } from './modules/parceiros/parceiros.module';
import { PortalModule } from './modules/portal/portal.module';
import { PrazosModule } from './modules/prazos/prazos.module';
import { ProcessosModule } from './modules/processos/processos.module';
import { StatusFlowModule } from './modules/status-flow/status-flow.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { TimetrackingModule } from './modules/timetracking/timetracking.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    // Carrega variáveis de ambiente de .env automaticamente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // ── Infraestrutura / Auth ─────────────────────────────────────────────
    AuthModule,
    NotificationsModule,

    // ── Módulos com cron / agendamento ────────────────────────────────────
    AgendaModule,

    // ── Módulos de funcionalidade ─────────────────────────────────────────
    AiModule,
    AnalyticsModule,
    AtendimentosModule,
    AutomacoesModule,
    ClientesModule,
    CrmModule,
    DatajudModule,
    DocumentosModule,
    EsignModule,
    FinanceiroModule,
    IntimacoesModule,
    ParceirosModule,
    PortalModule,
    PrazosModule,
    ProcessosModule,
    StatusFlowModule,
    TarefasModule,
    TimetrackingModule,
    WhatsappModule,
  ],
})
export class AppModule {}
