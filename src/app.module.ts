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
import { AtividadesModule } from './modules/atividades/atividades.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomacoesModule } from './modules/automacoes/automacoes.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { ConfiguracoesModule } from './modules/configuracoes/configuracoes.module';
import { ContatosModule } from './modules/contatos/contatos.module';
import { CrmModule } from './modules/crm/crm.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DatajudModule } from './modules/datajud/datajud.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { EsignModule } from './modules/esign/esign.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { IntimacoesModule } from './modules/intimacoes/intimacoes.module';
import { ModelosModule } from './modules/modelos/modelos.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ParceirosModule } from './modules/parceiros/parceiros.module';
import { PortalModule } from './modules/portal/portal.module';
import { PrazosModule } from './modules/prazos/prazos.module';
import { ProcessesModule } from './modules/processes/processes.module';
import { ProcessosModule } from './modules/processos/processos.module';
import { RelatoriosModule } from './modules/relatorios/relatorios.module';
import { StatusFlowModule } from './modules/status-flow/status-flow.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { TimetrackingModule } from './modules/timetracking/timetracking.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
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
    AtividadesModule,
    AutomacoesModule,
    ClientesModule,
    ConfiguracoesModule,
    ContatosModule,
    CrmModule,
    DashboardModule,
    DatajudModule,
    DocumentosModule,
    EsignModule,
    FinanceiroModule,
    IntimacoesModule,
    ModelosModule,
    ParceirosModule,
    PortalModule,
    PrazosModule,
    ProcessesModule,
    ProcessosModule,
    RelatoriosModule,
    StatusFlowModule,
    TarefasModule,
    TimetrackingModule,
    WebhooksModule,
    WhatsappModule,
  ],
})
export class AppModule {}
