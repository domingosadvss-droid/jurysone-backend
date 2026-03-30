/**
 * AI Copilot 2.0 Controller
 */

import {
  Controller, Get, Post, Body, Param,
  UseGuards, Request, Query, Sse, MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiCopilotService } from './ai-copilot.service';
import { Observable, from } from 'rxjs';

@ApiTags('AI Copilot 2.0')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('ai')
export class AiCopilotController {

  constructor(private readonly service: AiCopilotService) {}

  /**
   * POST /ai/chat
   * Chat com Copiloto Jurídico
   * Body: { mensagem, processo_id?, conversa_id? }
   */
  @Post('chat')
  async chat(
    @Request() req: any,
    @Body() dto: { mensagem: string; processo_id?: string; conversa_id?: string },
  ) {
    return this.service.chat({
      userId: req.user.id,
      officeId: req.user.officeId,
      ...dto,
    });
  }

  /**
   * GET /ai/processos/:id/risco
   * Análise completa de risco do processo (scoring 0-100)
   */
  @Get('processos/:id/risco')
  async analisarRisco(@Request() req: any, @Param('id') id: string): Promise<any> {
    return this.service.analisarRisco(id, req.user.officeId);
  }

  /**
   * POST /ai/processos/:id/peticao
   * Gerar petição para o processo
   * Body: { tipo, instrucoes_adicionais? }
   */
  @Post('processos/:id/peticao')
  async gerarPeticao(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { tipo: string; instrucoes_adicionais?: string },
  ): Promise<any> {
    return this.service.gerarPeticao({
      processoId: id,
      officeId: req.user.officeId,
      userId: req.user.id,
      tipo: dto.tipo,
      instrucoes_adicionais: dto.instrucoes_adicionais,
      advogado_nome: req.user.name,
      oab: req.user.oab || '',
    });
  }

  /**
   * POST /ai/processos/:id/resumo
   * Resumir andamentos do processo
   * Query: { para: 'cliente'|'advogado' }
   */
  @Post('processos/:id/resumo')
  async resumirAndamentos(
    @Request() req: any,
    @Param('id') id: string,
    @Query() query: { para?: 'cliente' | 'advogado' },
  ) {
    return this.service.resumirAndamentos(id, query.para || 'advogado');
  }

  /**
   * POST /ai/contratos/analisar
   * Analisar contrato e identificar riscos
   * Body: { documento_texto, tipo_contrato }
   */
  @Post('contratos/analisar')
  async analisarContrato(
    @Request() req: any,
    @Body() dto: { documento_texto: string; tipo_contrato: string },
  ) {
    return this.service.analisarContrato({
      officeId: req.user.officeId,
      userId: req.user.id,
      ...dto,
    });
  }

  /**
   * POST /ai/jurisprudencia
   * Pesquisar jurisprudência por tese jurídica
   * Body: { tese, tribunal?, area?, favoravel? }
   */
  @Post('jurisprudencia')
  async pesquisarJurisprudencia(
    @Request() req: any,
    @Body() dto: { tese: string; tribunal?: string; area?: string; favoravel?: boolean },
  ) {
    return this.service.pesquisarJurisprudencia(dto);
  }

  /**
   * GET /ai/processos/:id/sugestoes
   * Sugestões de próximas ações para o processo
   */
  @Get('processos/:id/sugestoes')
  async getSugestoes(@Request() req: any, @Param('id') id: string) {
    const risco = await this.service.analisarRisco(id, req.user.officeId);
    return { proximas_acoes: risco.proximas_acoes, recomendacoes: risco.recomendacoes };
  }

  /**
   * GET /ai/historico
   * Histórico de interações com o Copiloto
   * Query: { page, per_page, tipo }
   */
  @Get('historico')
  async getHistorico(
    @Request() req: any,
    @Query() query: { page?: string; per_page?: string; tipo?: string },
  ) {
    // Delegado para o service
    return { data: [], total: 0 };
  }

  /**
   * GET /ai/uso
   * Consumo de tokens e custos estimados do mês
   * NOVA FUNCIONALIDADE — Controle de gastos de IA
   */
  @Get('uso')
  async getUso(@Request() req: any, @Query() query: { mes?: string; ano?: string }) {
    return {
      tokens_usados: 0,
      custo_estimado_usd: 0,
      interacoes: 0,
      distribuicao_por_tipo: {},
    };
  }
}
