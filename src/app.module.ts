import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PerfilInterceptor } from './common/interceptors/perfil.interceptor';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from './common/guards/client-ip-throttler.guard';
/**
 * JURYSONE — App Root Module
 *
 * Importa todos os módulos de funcionalidade da aplicação.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { WhatsappOficialModule } from './modules/whatsapp-oficial/whatsapp-oficial.module';
import { AppController } from './app.controller';

// ── Módulos estruturados ───────────────────────────────────────────────────
import { AgendaModule } from './modules/agenda/agenda.module';
import { AsaasModule } from './modules/asaas/asaas.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AtendimentosModule } from './modules/atendimentos/atendimentos.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomacoesModule } from './modules/automacoes/automacoes.module';
import { ClientesModule } from './modules/clientes/clientes.module';
import { CrmModule } from './modules/crm/crm.module';
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
import { DadosModule } from './modules/dados/dados.module';
import { ChavesModule } from './modules/chaves/chaves.module';
import { SseModule } from './modules/sse/sse.module';
import { PeticionamentoModule } from './modules/peticionamento/peticionamento.module';
import { EquipeModule } from './modules/equipe/equipe.module';
import { CotaParteModule } from './modules/cota-parte/cota-parte.module';
import { ConflitosModule } from './modules/conflitos/conflitos.module';
import { LinhaProducaoModule } from './modules/linha-producao/linha-producao.module';
import { ArquivosModule } from './modules/arquivos/arquivos.module';
import { ContratacaoModule } from './modules/contratacao/contratacao.module';
import { PublicacoesModule } from './modules/publicacoes/publicacoes.module';
import { DativaModule } from './modules/dativa/dativa.module';
import { CalculosModule } from './modules/calculos/calculos.module';
import { IaUsoModule } from './modules/ia-uso/ia-uso.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';

@Module({
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ClientIpThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: PerfilInterceptor },
  ],
  imports: [
    // Carrega variáveis de ambiente de .env automaticamente
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Limite de requisições por IP (rotas de auth têm limites próprios via @Throttle)
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),

    // ── Infraestrutura / Auth ─────────────────────────────────────────────
    PrismaModule, // global: uma só conexão/pool do Prisma para todo o app
    WhatsappOficialModule,
    IaUsoModule, // etapa A: uso, custo e limite da IA (global)
    CatalogoModule, // etapa B: catálogo de serviços
    AuthModule,
    NotificationsModule,
    SseModule,

    // ── Módulos com cron / agendamento ────────────────────────────────────
    AgendaModule,

    // ── Módulos de funcionalidade ─────────────────────────────────────────
    AiModule,
    AnalyticsModule,
    AsaasModule,
    AtendimentosModule,
    AutomacoesModule,
    ClientesModule,
    CrmModule,
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
    DadosModule,
    ChavesModule,
    PeticionamentoModule,
    EquipeModule,
    CotaParteModule,
    ConflitosModule,
    LinhaProducaoModule,
    ArquivosModule,
    ContratacaoModule,
    PublicacoesModule,
    DativaModule,
    CalculosModule,
  ],
})
export class AppModule {}
