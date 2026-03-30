/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Analytics & Business Intelligence
 * NOVA FUNCIONALIDADE — Advbox tem relatórios básicos
 *
 * BI completo com:
 *   - Métricas financeiras (MRR, LTV, Churn, CAC)
 *   - Análise de desempenho por advogado
 *   - Taxa de sucesso por área jurídica
 *   - Análise preditiva com IA (tendências, sazonalidade)
 *   - Funil de conversão de leads→clientes
 *   - NPS score e retenção de clientes
 *   - Benchmarking com médias do setor
 *   - Exportação para Excel/PDF/CSV
 *   - Dashboards configuráveis por usuário
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller, Get, Post, Patch, Body,
  Query, UseGuards, Request, Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@ApiTags('Analytics & BI')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {

  constructor(private readonly service: AnalyticsService) {}

  /* ──────────────────── VISÃO GERAL ─────────────────────────── */

  /**
   * GET /analytics/overview
   * KPIs principais do escritório com variação percentual vs período anterior
   * Response: {
   *   receita_mes: { valor, variacao_pct },
   *   processos_ativos: { total, novos_mes, encerrados_mes },
   *   clientes: { total, novos_mes, churn_mes },
   *   tarefas: { pendentes, concluidas_mes, atraso },
   *   horas: { total_mes, faturavel_pct, por_advogado },
   *   nps: { score, respondentes, promotores_pct }
   * }
   * Query: { periodo: '7d'|'30d'|'90d'|'12m'|'custom', data_inicio?, data_fim? }
   */
  @Get('overview')
  async getOverview(
    @Request() req: any,
    @Query() query: {
      periodo?: '7d' | '30d' | '90d' | '12m' | 'custom';
      data_inicio?: string;
      data_fim?: string;
    },
  ) {
    return this.service.getOverview(req.user.officeId, query);
  }

  /* ──────────────────── FINANCEIRO ──────────────────────────── */

  /**
   * GET /analytics/financeiro/receita
   * Evolução de receita: gráfico mensal, por tipo, por cliente
   * Query: { ano?, meses? }
   */
  @Get('financeiro/receita')
  async getReceitaEvolucao(
    @Request() req: any,
    @Query() query: { ano?: string; meses?: string },
  ) {
    return this.service.getReceitaEvolucao(req.user.officeId, query);
  }

  /**
   * GET /analytics/financeiro/mrr
   * MRR (Monthly Recurring Revenue) — para escritórios com contratos recorrentes
   */
  @Get('financeiro/mrr')
  async getMrr(@Request() req: any, @Query() query: { meses?: string }) {
    return this.service.getMrr(req.user.officeId, query);
  }

  /**
   * GET /analytics/financeiro/fluxo-caixa
   * Projeção de fluxo de caixa para os próximos 3 meses (IA preditiva)
   * NOVA FUNCIONALIDADE — Advbox não tem projeção
   */
  @Get('financeiro/fluxo-caixa')
  async getFluxoCaixaProjetado(
    @Request() req: any,
    @Query() query: { meses?: string },
  ) {
    return this.service.getFluxoCaixaProjetado(req.user.officeId, query);
  }

  /**
   * GET /analytics/financeiro/inadimplencia
   * Taxa de inadimplência e aging de cobranças
   */
  @Get('financeiro/inadimplencia')
  async getInadimplencia(@Request() req: any) {
    return this.service.getInadimplencia(req.user.officeId);
  }

  /**
   * GET /analytics/financeiro/por-cliente
   * LTV (Lifetime Value) e receita por cliente, top 10
   */
  @Get('financeiro/por-cliente')
  async getReceitaPorCliente(
    @Request() req: any,
    @Query() query: { limit?: string; data_inicio?: string; data_fim?: string },
  ) {
    return this.service.getReceitaPorCliente(req.user.officeId, query);
  }

  /* ──────────────────── PROCESSOS ───────────────────────────── */

  /**
   * GET /analytics/processos/distribuicao
   * Distribuição por área jurídica, tribunal, fase, status
   */
  @Get('processos/distribuicao')
  async getDistribuicaoProcessos(@Request() req: any) {
    return this.service.getDistribuicaoProcessos(req.user.officeId);
  }

  /**
   * GET /analytics/processos/taxa-sucesso
   * Taxa de êxito por área jurídica e por advogado
   * NOVA FUNCIONALIDADE — Advbox não tem esta métrica
   */
  @Get('processos/taxa-sucesso')
  async getTaxaSucesso(
    @Request() req: any,
    @Query() query: { area?: string; data_inicio?: string; data_fim?: string },
  ) {
    return this.service.getTaxaSucesso(req.user.officeId, query);
  }

  /**
   * GET /analytics/processos/tempo-resolucao
   * Tempo médio de resolução por área jurídica
   */
  @Get('processos/tempo-resolucao')
  async getTempoResolucao(@Request() req: any) {
    return this.service.getTempoResolucao(req.user.officeId);
  }

  /**
   * GET /analytics/processos/prazos
   * Análise de cumprimento de prazos: no prazo, atrasados, perdidos
   */
  @Get('processos/prazos')
  async getAnalysePrazos(
    @Request() req: any,
    @Query() query: { mes?: string; ano?: string },
  ) {
    return this.service.getAnalisePrazos(req.user.officeId, query);
  }

  /* ──────────────────── CLIENTES / CRM ──────────────────────── */

  /**
   * GET /analytics/clientes/funil
   * Funil de conversão: lead → reunião → proposta → cliente
   * NOVA FUNCIONALIDADE
   */
  @Get('clientes/funil')
  async getFunil(@Request() req: any, @Query() query: { periodo?: string }) {
    return this.service.getFunilConversao(req.user.officeId, query);
  }

  /**
   * GET /analytics/clientes/retencao
   * Taxa de retenção e churn de clientes
   */
  @Get('clientes/retencao')
  async getRetencao(@Request() req: any, @Query() query: { meses?: string }) {
    return this.service.getRetencao(req.user.officeId, query);
  }

  /**
   * GET /analytics/clientes/nps
   * NPS Score evolutivo e comentários dos clientes
   * NOVA FUNCIONALIDADE — Advbox não tem NPS
   */
  @Get('clientes/nps')
  async getNps(@Request() req: any, @Query() query: { meses?: string }) {
    return this.service.getNps(req.user.officeId, query);
  }

  /* ──────────────────── PRODUTIVIDADE ───────────────────────── */

  /**
   * GET /analytics/produtividade/equipe
   * Ranking de produtividade da equipe:
   * processos ativos, horas, tarefas concluídas, taxa de êxito
   */
  @Get('produtividade/equipe')
  async getProdutividadeEquipe(
    @Request() req: any,
    @Query() query: { mes?: string; ano?: string },
  ) {
    return this.service.getProdutividadeEquipe(req.user.officeId, query);
  }

  /**
   * GET /analytics/produtividade/horas
   * Análise de horas: faturáveis vs não faturáveis, por área, por advogado
   */
  @Get('produtividade/horas')
  async getAnaliseHoras(
    @Request() req: any,
    @Query() query: { mes?: string; ano?: string },
  ) {
    return this.service.getAnaliseHoras(req.user.officeId, query);
  }

  /* ──────────────────── IA PREDITIVA ────────────────────────── */

  /**
   * GET /analytics/ia/insights
   * Insights automáticos gerados por IA sobre o escritório
   * Ex: "Processos trabalhistas têm 23% mais atraso que a média"
   * Ex: "Cliente X tem maior probabilidade de churn este mês"
   * Ex: "Receita de março deve cair 15% vs fevereiro"
   * NOVA FUNCIONALIDADE — Análise preditiva com GPT-4o
   */
  @Get('ia/insights')
  async getIaInsights(@Request() req: any) {
    return this.service.getIaInsights(req.user.officeId);
  }

  /**
   * POST /analytics/ia/pergunta
   * Perguntar sobre dados do escritório em linguagem natural
   * Body: { pergunta: string }
   * Ex: "Qual é minha área jurídica mais lucrativa?"
   * Ex: "Quantos processos novos tive no último trimestre?"
   * NOVA FUNCIONALIDADE — Analytics conversacional
   */
  @Post('ia/pergunta')
  async perguntarDados(
    @Request() req: any,
    @Body() dto: { pergunta: string },
  ) {
    return this.service.perguntarDados(req.user.officeId, dto.pergunta);
  }

  /**
   * GET /analytics/ia/anomalias
   * Detecção de anomalias: transações suspeitas, queda de produtividade, etc.
   * NOVA FUNCIONALIDADE
   */
  @Get('ia/anomalias')
  async getAnomalias(@Request() req: any) {
    return this.service.detectarAnomalias(req.user.officeId);
  }

  /* ──────────────────── BENCHMARKING ────────────────────────── */

  /**
   * GET /analytics/benchmark
   * Comparativo anônimo com escritórios de mesmo porte/área
   * NOVA FUNCIONALIDADE — Benchmarking do setor
   */
  @Get('benchmark')
  async getBenchmark(@Request() req: any) {
    return this.service.getBenchmark(req.user.officeId);
  }

  /* ──────────────────── DASHBOARDS CUSTOMIZÁVEIS ─────────────── */

  /**
   * GET /analytics/dashboards
   * Dashboards configurados pelo usuário
   */
  @Get('dashboards')
  async getDashboards(@Request() req: any) {
    return this.service.getDashboards(req.user.id);
  }

  /**
   * POST /analytics/dashboards
   * Criar dashboard personalizado
   * Body: { nome, widgets: [{ tipo, config, posicao }] }
   */
  @Post('dashboards')
  async createDashboard(
    @Request() req: any,
    @Body() dto: {
      nome: string;
      widgets: Array<{
        tipo: string;
        config: Record<string, any>;
        posicao: { x: number; y: number; w: number; h: number };
      }>;
    },
  ) {
    return this.service.createDashboard(req.user.id, dto);
  }

  /**
   * PATCH /analytics/dashboards/:id
   * Atualizar layout do dashboard
   */
  @Patch('dashboards/:id')
  async updateDashboard(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateDashboard(req.user.id, id, dto);
  }

  /* ──────────────────── EXPORTAÇÃO ──────────────────────────── */

  /**
   * POST /analytics/exportar
   * Exportar relatório de analytics
   * Body: { tipo: 'xlsx'|'pdf'|'csv', secoes: ['financeiro','processos','produtividade'], periodo }
   */
  @Post('exportar')
  async exportar(
    @Request() req: any,
    @Body() dto: {
      tipo: 'xlsx' | 'pdf' | 'csv';
      secoes: string[];
      periodo: { data_inicio: string; data_fim: string };
    },
  ) {
    return this.service.exportar(req.user.officeId, dto);
  }
}
