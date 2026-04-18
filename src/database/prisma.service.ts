/**
 * JURYSONE — PrismaService
 *
 * O schema.prisma usa nomes PT-BR nativamente (Usuario, Processo, etc.).
 * Este arquivo expõe aliases em inglês para compatibilidade com módulos legados
 * que ainda referenciam os nomes originais em inglês.
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Builds a safe DATABASE_URL from individual env vars when DB_PASSWORD is set.
 * This avoids Render UI URL-decoding issues with special chars (%, ?) in passwords.
 */
/**
 * If DB_PASSWORD is set, build DATABASE_URL and DIRECT_URL programmatically
 * using encodeURIComponent so special chars (%, ?) are properly escaped.
 * Must run before PrismaClient is instantiated since schema uses env("DATABASE_URL").
 */
function patchDatabaseEnvVars(): void {
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword) return;

  const user    = process.env.DB_USER  || 'postgres.mqzovxyexgaovqauxqrr';
  const host    = process.env.DB_HOST  || 'aws-1-sa-east-1.pooler.supabase.com';
  const portTx  = process.env.DB_PORT  || '6543';
  const portDir = process.env.DB_PORT_DIRECT || '5432';
  const db      = process.env.DB_NAME  || 'postgres';
  const enc     = encodeURIComponent(dbPassword);

  process.env.DATABASE_URL = `postgresql://${user}:${enc}@${host}:${portTx}/${db}?pgbouncer=true`;
  process.env.DIRECT_URL   = `postgresql://${user}:${enc}@${host}:${portDir}/${db}`;
}

patchDatabaseEnvVars();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err: any) {
      // Não crashar na inicialização — o app sobe e serve o frontend mesmo sem DB.
      // Cada query vai falhar individualmente até a conexão ser estabelecida.
      console.error('[PrismaService] DB connection failed on startup:', err?.message ?? err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // ── Aliases inglês → PT-BR (compatibilidade com módulos legados) ───────────

  /** @alias usuario */
  get user()               { return (this as any).usuario; }

  /** @alias escritorio */
  get office()             { return (this as any).escritorio; }

  /** @alias cliente */
  get client()             { return (this as any).cliente; }

  /** @alias processo */
  get process()            { return (this as any).processo; }

  /** @alias tarefa */
  get task()               { return (this as any).tarefa; }

  /** @alias documento */
  get document()           { return (this as any).documento; }

  /** @alias movimentacao */
  get movement()           { return (this as any).movimentacao; }

  /** @alias evento */
  get calendarEvent()      { return (this as any).evento; }

  /** @alias eventoResponsavel */
  get eventResponsible()   { return (this as any).eventoResponsavel; }

  /** @alias interacaoIA */
  get aiInteraction()      { return (this as any).interacaoIA; }

  /** @alias tokenRefresh */
  get refreshToken()       { return (this as any).tokenRefresh; }

  /** @alias configuracao */
  get setting()            { return (this as any).configuracao; }

  /** @alias logAuditoria */
  get auditLog()           { return (this as any).logAuditoria; }

  /** @alias usuarioPortal */
  get clientPortalUser()   { return (this as any).usuarioPortal; }

  /** @alias mensagemPortal */
  get portalMessage()      { return (this as any).mensagemPortal; }

  /** @alias aprovacaoPortal */
  get portalApproval()     { return (this as any).aprovacaoPortal; }

  /** @alias respostaNps */
  get npsResponse()        { return (this as any).respostaNps; }

  /** @alias notificacao */
  get notification()       { return (this as any).notificacao; }

  /** @alias entradaTempo */
  get timeEntry()          { return (this as any).entradaTempo; }

  /** @alias sessaoTimer */
  get timerSession()       { return (this as any).sessaoTimer; }

  /** @alias metaTempo */
  get timeGoal()           { return (this as any).metaTempo; }

  /** @alias pagamento */
  get payment()            { return (this as any).pagamento; }

  /** @alias assinatura */
  get subscription()       { return (this as any).assinatura; }

  /** @alias dashboardAnalytics */
  get analyticsDashboard() { return (this as any).dashboardAnalytics; }

  // ── Modelos adicionais ─────────────────────────────────────────────────────

  get atendimento(): any        { return (this as any)['atendimento']; }
  get menorRepresentado(): any  { return (this as any)['menorRepresentado']; }
  get lancamentoFinanceiro(): any { return (this as any)['lancamentoFinanceiro']; }
  get lancamento(): any         { return (this as any)['lancamentoFinanceiro']; }
  get prazo(): any              { return (this as any)['prazo']; }
  get historicoStatus(): any    { return (this as any)['historicoStatus']; }
  get statusHistory(): any      { return (this as any)['historicoStatus']; }
  get pastaCliente(): any       { return (this as any)['pastaCliente']; }
  get registroCrm(): any        { return (this as any)['registroCrm']; }
  get crmRecord(): any          { return (this as any)['registroCrm']; }
  get esignTemplate(): any      { return (this as any)['esignTemplate']; }
}
