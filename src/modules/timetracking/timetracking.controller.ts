/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Time Tracking: Controle de Horas
 * NOVA FUNCIONALIDADE — Não existe no Advbox
 *
 * Controle preciso de horas trabalhadas por processo:
 *   - Timer integrado (start/stop/pause em qualquer tela)
 *   - Registro manual de horas
 *   - Horas faturáveis vs não-faturáveis
 *   - Vinculação com processos e clientes
 *   - Geração automática de faturas baseadas em horas
 *   - Relatórios de produtividade por advogado/equipe
 *   - Metas de horas mensais
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TimetrackingService } from './timetracking.service';

@ApiTags('Time Tracking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('timetracking')
export class TimetrackingController {

  constructor(private readonly service: TimetrackingService) {}

  /* ──────────────────── TIMER ATIVO ─────────────────────────── */

  /**
   * GET /timetracking/timer/ativo
   * Retorna timer em execução do usuário logado (se houver)
   */
  @Get('timer/ativo')
  async getTimerAtivo(@Request() req: any) {
    return this.service.getTimerAtivo(req.user.id);
  }

  /**
   * POST /timetracking/timer/start
   * Iniciar timer
   * Body: { processo_id?, tarefa_id?, descricao, faturavel: boolean }
   */
  @Post('timer/start')
  async startTimer(
    @Request() req: any,
    @Body() dto: {
      processo_id?: string;
      tarefa_id?: string;
      descricao: string;
      faturavel: boolean;
      categoria?: string;
    },
  ) {
    return this.service.startTimer(req.user.id, dto);
  }

  /**
   * POST /timetracking/timer/:id/stop
   * Parar timer e registrar entrada
   * Body: { descricao_final? }
   */
  @Post('timer/:id/stop')
  @HttpCode(HttpStatus.OK)
  async stopTimer(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { descricao_final?: string },
  ) {
    return this.service.stopTimer(req.user.id, id, dto);
  }

  /**
   * POST /timetracking/timer/:id/pause
   * Pausar timer (mantém sessão ativa)
   */
  @Post('timer/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseTimer(@Request() req: any, @Param('id') id: string) {
    return this.service.pauseTimer(req.user.id, id);
  }

  /**
   * POST /timetracking/timer/:id/resume
   * Retomar timer pausado
   */
  @Post('timer/:id/resume')
  @HttpCode(HttpStatus.OK)
  async resumeTimer(@Request() req: any, @Param('id') id: string) {
    return this.service.resumeTimer(req.user.id, id);
  }

  /* ──────────────────── ENTRADAS DE TEMPO ───────────────────── */

  /**
   * GET /timetracking/entradas
   * Lista entradas de tempo
   * Query: { data_inicio, data_fim, processo_id, usuario_id, faturavel, page }
   */
  @Get('entradas')
  async listEntradas(
    @Request() req: any,
    @Query() query: {
      data_inicio?: string;
      data_fim?: string;
      processo_id?: string;
      usuario_id?: string;
      faturavel?: string;
      page?: string;
      per_page?: string;
    },
  ) {
    return this.service.listEntradas(req.user.officeId, req.user.id, query);
  }

  /**
   * POST /timetracking/entradas
   * Registrar entrada de tempo manualmente
   * Body: { processo_id?, tarefa_id?, descricao, inicio, fim, faturavel, duracao_minutos }
   */
  @Post('entradas')
  async createEntrada(
    @Request() req: any,
    @Body() dto: {
      processo_id?: string;
      tarefa_id?: string;
      descricao: string;
      inicio: string;
      fim: string;
      faturavel: boolean;
      duracao_minutos: number;
      categoria?: string;
    },
  ) {
    return this.service.createEntrada(req.user.id, dto);
  }

  /**
   * PATCH /timetracking/entradas/:id
   * Editar entrada de tempo
   */
  @Patch('entradas/:id')
  async updateEntrada(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateEntrada(req.user.id, id, dto);
  }

  /**
   * DELETE /timetracking/entradas/:id
   * Remover entrada de tempo
   */
  @Delete('entradas/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEntrada(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteEntrada(req.user.id, id);
  }

  /* ──────────────────── RELATÓRIOS DE PRODUTIVIDADE ─────────── */

  /**
   * GET /timetracking/relatorios/diario
   * Relatório diário do usuário (horas do dia, por processo)
   * Query: { data?, usuario_id? }
   */
  @Get('relatorios/diario')
  async getRelatorioDiario(
    @Request() req: any,
    @Query() query: { data?: string; usuario_id?: string },
  ) {
    return this.service.getRelatorioDiario(req.user, query);
  }

  /**
   * GET /timetracking/relatorios/semanal
   * Relatório semanal: horas por dia, por processo, comparativo
   */
  @Get('relatorios/semanal')
  async getRelatorioSemanal(
    @Request() req: any,
    @Query() query: { semana?: string; usuario_id?: string },
  ) {
    return this.service.getRelatorioSemanal(req.user, query);
  }

  /**
   * GET /timetracking/relatorios/mensal
   * Relatório mensal: produtividade, horas faturáveis, metas
   * Query: { mes, ano, usuario_id?, processo_id? }
   */
  @Get('relatorios/mensal')
  async getRelatorioMensal(
    @Request() req: any,
    @Query() query: { mes?: string; ano?: string; usuario_id?: string; processo_id?: string },
  ) {
    return this.service.getRelatorioMensal(req.user, query);
  }

  /**
   * GET /timetracking/relatorios/equipe
   * Comparativo de produtividade da equipe
   * Somente admins/sócios
   */
  @Get('relatorios/equipe')
  async getRelatorioEquipe(
    @Request() req: any,
    @Query() query: { mes?: string; ano?: string },
  ) {
    return this.service.getRelatorioEquipe(req.user, query);
  }

  /**
   * GET /timetracking/relatorios/faturamento
   * Horas faturáveis por cliente/processo — base para emissão de NF
   * Query: { data_inicio, data_fim, cliente_id?, processo_id? }
   */
  @Get('relatorios/faturamento')
  async getRelatorioFaturamento(
    @Request() req: any,
    @Query() query: {
      data_inicio: string;
      data_fim: string;
      cliente_id?: string;
      processo_id?: string;
    },
  ) {
    return this.service.getRelatorioFaturamento(req.user.officeId, query);
  }

  /* ──────────────────── METAS ────────────────────────────────── */

  /**
   * GET /timetracking/metas
   * Metas de horas mensais por usuário
   */
  @Get('metas')
  async getMetas(@Request() req: any) {
    return this.service.getMetas(req.user.officeId);
  }

  /**
   * POST /timetracking/metas
   * Definir meta de horas para usuário
   * Body: { usuario_id, horas_mensais, horas_faturavel_mensal }
   */
  @Post('metas')
  async createMeta(
    @Request() req: any,
    @Body() dto: {
      usuario_id: string;
      horas_mensais: number;
      horas_faturavel_mensal: number;
    },
  ) {
    return this.service.createMeta(req.user.officeId, dto);
  }

  /* ──────────────────── GERAR FATURA ─────────────────────────── */

  /**
   * POST /timetracking/gerar-fatura
   * Gerar fatura de honorários baseada em horas registradas
   * Body: { cliente_id, processo_id?, data_inicio, data_fim, valor_hora, incluir_despesas: boolean }
   * NOVA FUNCIONALIDADE — Automação financeira
   */
  @Post('gerar-fatura')
  async gerarFatura(
    @Request() req: any,
    @Body() dto: {
      cliente_id: string;
      processo_id?: string;
      data_inicio: string;
      data_fim: string;
      valor_hora: number;
      incluir_despesas: boolean;
      desconto?: number;
    },
  ) {
    return this.service.gerarFatura(req.user, dto);
  }

  /* ──────────────────── DASHBOARD ────────────────────────────── */

  /**
   * GET /timetracking/dashboard
   * KPIs do time tracking: hoje, semana, mês, meta, % faturável
   */
  @Get('dashboard')
  async getDashboard(@Request() req: any) {
    return this.service.getDashboard(req.user.id);
  }
}
