/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Motor de Automações (Workflow Automation)
 * NOVA FUNCIONALIDADE — Não existe no Advbox
 *
 * Motor de automação visual tipo "Zapier para escritórios jurídicos":
 *   - Gatilhos (triggers): novos processos, andamentos, prazos, pagamentos
 *   - Ações: enviar WhatsApp, criar tarefa, notificar advogado, gerar documento
 *   - Condições: filtros por área, valor, cliente, status
 *   - Agendamentos: automações recorrentes (relatórios semanais, lembretes)
 *   - Logs de execução: histórico completo de cada automação
 *   - Templates prontos de automações mais comuns
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutomacoesService } from './automacoes.service';

// ─── Tipos de Gatilho ────────────────────────────────────────
export type TipoGatilho =
  | 'processo.criado'
  | 'processo.andamento_novo'
  | 'processo.status_alterado'
  | 'processo.encerrado'
  | 'prazo.D-30' | 'prazo.D-15' | 'prazo.D-7' | 'prazo.D-3' | 'prazo.D-1' | 'prazo.hoje'
  | 'tarefa.criada' | 'tarefa.concluida' | 'tarefa.atrasada'
  | 'financeiro.pagamento_recebido' | 'financeiro.vencimento_proximo'
  | 'cliente.criado' | 'cliente.inativo_30d'
  | 'esign.assinado' | 'esign.expirado'
  | 'portal.mensagem_nova' | 'portal.avaliacao_recebida'
  | 'agendamento.diario' | 'agendamento.semanal' | 'agendamento.mensal'
  | 'datajud.nova_movimentacao' | 'datajud.intimacao';

// ─── Tipos de Ação ───────────────────────────────────────────
export type TipoAcao =
  | 'whatsapp.enviar_mensagem'
  | 'email.enviar'
  | 'notificacao.push'
  | 'tarefa.criar'
  | 'tarefa.atribuir'
  | 'agenda.criar_evento'
  | 'documento.gerar'
  | 'esign.criar_envelope'
  | 'financeiro.criar_cobranca'
  | 'ai.analisar_processo'
  | 'ai.gerar_peticao'
  | 'relatorio.gerar'
  | 'webhook.disparar'
  | 'esperar'; // delay entre ações

@ApiTags('Automações')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('automacoes')
export class AutomacoesController {

  constructor(private readonly service: AutomacoesService) {}

  /* ──────────────────── AUTOMAÇÕES ──────────────────────────── */

  /**
   * GET /automacoes
   * Lista automações do escritório
   * Query: { ativa, gatilho, page }
   */
  @Get()
  async list(
    @Request() req: any,
    @Query() query: { ativa?: string; gatilho?: string; page?: string },
  ) {
    return this.service.list(req.user.officeId, query);
  }

  /**
   * POST /automacoes
   * Criar nova automação
   * Body: {
   *   nome, descricao?, ativa: bool,
   *   gatilho: { tipo: TipoGatilho, condicoes?: [{ campo, operador, valor }] },
   *   acoes: [{ tipo: TipoAcao, ordem: number, config: {} }]
   * }
   */
  @Post()
  async create(
    @Request() req: any,
    @Body() dto: {
      nome: string;
      descricao?: string;
      ativa: boolean;
      gatilho: {
        tipo: TipoGatilho;
        condicoes?: Array<{
          campo: string;
          operador: 'igual' | 'diferente' | 'contem' | 'maior_que' | 'menor_que';
          valor: any;
        }>;
      };
      acoes: Array<{
        tipo: TipoAcao;
        ordem: number;
        config: Record<string, any>;
        continuar_se_erro?: boolean;
      }>;
    },
  ) {
    return this.service.create(req.user.officeId, req.user.id, dto);
  }

  /**
   * GET /automacoes/:id
   * Detalhes da automação com histórico de execuções
   */
  @Get(':id')
  async get(@Request() req: any, @Param('id') id: string) {
    return this.service.get(req.user.officeId, id);
  }

  /**
   * PATCH /automacoes/:id
   * Atualizar automação
   */
  @Patch(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.update(req.user.officeId, id, dto);
  }

  /**
   * PATCH /automacoes/:id/toggle
   * Ativar/desativar automação
   */
  @Patch(':id/toggle')
  async toggle(@Request() req: any, @Param('id') id: string) {
    return this.service.toggle(req.user.officeId, id);
  }

  /**
   * DELETE /automacoes/:id
   * Remover automação
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.officeId, id);
  }

  /**
   * POST /automacoes/:id/testar
   * Testar automação com dados de exemplo (dry-run)
   * Body: { dados_exemplo: {} }
   */
  @Post(':id/testar')
  @HttpCode(HttpStatus.OK)
  async testar(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { dados_exemplo: Record<string, any> },
  ): Promise<any> {
    return this.service.testar(req.user.officeId, id, dto.dados_exemplo);
  }

  /* ──────────────────── EXECUÇÕES ───────────────────────────── */

  /**
   * GET /automacoes/:id/execucoes
   * Histórico de execuções da automação
   * Query: { status: 'sucesso'|'erro'|'parcial', page }
   */
  @Get(':id/execucoes')
  async getExecucoes(
    @Request() req: any,
    @Param('id') id: string,
    @Query() query: { status?: string; page?: string },
  ) {
    return this.service.getExecucoes(req.user.officeId, id, query);
  }

  /**
   * GET /automacoes/execucoes/recentes
   * Últimas execuções de todas as automações (feed de atividade)
   */
  @Get('execucoes/recentes')
  async getExecouesRecentes(@Request() req: any) {
    return this.service.getExecouesRecentes(req.user.officeId);
  }

  /* ──────────────────── TEMPLATES ───────────────────────────── */

  /**
   * GET /automacoes/templates
   * Templates prontos de automações comuns:
   *   - "Notificar cliente por WhatsApp quando houver nova movimentação"
   *   - "Criar tarefa quando prazo estiver a 7 dias"
   *   - "Enviar relatório semanal por e-mail toda segunda"
   *   - "Gerar petição automática quando intimação chegou"
   *   - "Lembrar cliente de audiência 1 dia antes via WhatsApp"
   */
  @Get('templates/lista')
  async getTemplates() {
    return this.service.getTemplates();
  }

  /**
   * POST /automacoes/templates/:id/usar
   * Criar automação a partir de um template
   * Body: { customizacoes?: {} }
   */
  @Post('templates/:id/usar')
  async usarTemplate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { customizacoes?: Record<string, any> },
  ) {
    return this.service.usarTemplate(req.user.officeId, req.user.id, id, dto.customizacoes);
  }

  /* ──────────────────── GATILHOS DISPONÍVEIS ─────────────────── */

  /**
   * GET /automacoes/gatilhos
   * Lista de gatilhos disponíveis com metadados
   */
  @Get('meta/gatilhos')
  async getGatilhos() {
    return this.service.getGatilhosDisponiveis();
  }

  /**
   * GET /automacoes/acoes
   * Lista de ações disponíveis com configurações necessárias
   */
  @Get('meta/acoes')
  async getAcoes() {
    return this.service.getAcoesDisponiveis();
  }

  /* ──────────────────── STATS ────────────────────────────────── */

  /**
   * GET /automacoes/stats
   * Estatísticas: automações ativas, execuções do mês, taxa de sucesso
   */
  @Get('dashboard/stats')
  async getStats(@Request() req: any) {
    return this.service.getStats(req.user.officeId);
  }
}
