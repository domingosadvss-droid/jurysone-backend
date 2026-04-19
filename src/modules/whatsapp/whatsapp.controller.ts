/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — WhatsApp Business Automation
 * NOVA FUNCIONALIDADE — Advbox tem integração limitada/manual
 *
 * Automação completa via WhatsApp Business API:
 *   - Notificações automáticas de andamentos ao cliente
 *   - Lembretes de reunião/audiência
 *   - Alertas de vencimento de cobranças
 *   - Chatbot jurídico para dúvidas frequentes
 *   - Envio de documentos para assinatura
 *   - Templates personalizáveis por escritório
 *   - Agendamento de mensagens
 *   - Histórico de comunicações no processo
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
  HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WhatsappService } from './whatsapp.service';

@ApiTags('WhatsApp Automation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('whatsapp')
export class WhatsappController {

  constructor(private readonly service: WhatsappService) {}

  /* ──────────────────── MENSAGENS DIRETAS ───────────────────── */

  /**
   * POST /whatsapp/enviar
   * Enviar mensagem avulsa para um contato
   * Body: { telefone, mensagem, cliente_id?, processo_id?, tipo: 'texto'|'documento'|'template' }
   */
  @Post('enviar')
  async enviarMensagem(
    @Request() req: any,
    @Body() dto: {
      telefone: string;
      mensagem?: string;
      template_id?: string;
      template_variaveis?: Record<string, string>;
      cliente_id?: string;
      processo_id?: string;
      tipo: 'texto' | 'documento' | 'template';
      arquivo_url?: string;
    },
  ) {
    return this.service.enviarMensagem(req.user, dto);
  }

  /**
   * POST /whatsapp/enviar/lote
   * Enviar mensagem em lote para múltiplos contatos
   * Body: { destinatarios: [{ telefone, variaveis }], template_id, agendamento?: ISO date }
   */
  @Post('enviar/lote')
  async enviarLote(
    @Request() req: any,
    @Body() dto: {
      destinatarios: Array<{ telefone: string; variaveis?: Record<string, string> }>;
      template_id: string;
      agendamento?: string;
      processo_id?: string;
    },
  ) {
    return this.service.enviarLote(req.user, dto);
  }

  /* ──────────────────── HISTÓRICO ───────────────────────────── */

  /**
   * GET /whatsapp/historico
   * Histórico de mensagens enviadas
   * Query: { cliente_id?, processo_id?, status, page }
   */
  @Get('historico')
  async getHistorico(
    @Request() req: any,
    @Query() query: {
      cliente_id?: string;
      processo_id?: string;
      status?: 'enviada' | 'entregue' | 'lida' | 'erro';
      page?: string;
    },
  ) {
    return this.service.getHistorico(req.user.officeId, query);
  }

  /* ──────────────────── TEMPLATES ───────────────────────────── */

  /**
   * GET /whatsapp/templates
   * Templates de mensagens do escritório
   * (pré-aprovados pelo WhatsApp Business)
   */
  @Get('templates')
  async listTemplates(@Request() req: any) {
    return this.service.listTemplates(req.user.officeId);
  }

  /**
   * POST /whatsapp/templates
   * Criar template de mensagem
   * Body: { nome, categoria: 'UTILITY'|'MARKETING'|'AUTHENTICATION', idioma, componentes }
   */
  @Post('templates')
  async createTemplate(
    @Request() req: any,
    @Body() dto: {
      nome: string;
      categoria: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
      idioma: string;
      corpo: string;
      variaveis?: string[];
      botoes?: Array<{ tipo: 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY'; texto: string; valor?: string }>;
    },
  ) {
    return this.service.createTemplate(req.user.officeId, dto);
  }

  /**
   * DELETE /whatsapp/templates/:id
   * Remover template
   */
  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(@Request() req: any, @Param('id') id: string) {
    return this.service.deleteTemplate(req.user.officeId, id);
  }

  /* ──────────────────── AUTOMAÇÕES ──────────────────────────── */

  /**
   * GET /whatsapp/automacoes
   * Regras de envio automático configuradas
   */
  @Get('automacoes')
  async listAutomacoes(@Request() req: any) {
    return this.service.listAutomacoes(req.user.officeId);
  }

  /**
   * POST /whatsapp/automacoes
   * Criar automação de envio
   * Body: {
   *   nome, ativa: bool,
   *   gatilho: 'novo_andamento'|'prazo_D-1'|'prazo_D-3'|'pagamento_vencendo'|'audiencia_amanha'|'documento_assinado',
   *   template_id, atraso_minutos?: number, filtros?: {}
   * }
   */
  @Post('automacoes')
  async createAutomacao(
    @Request() req: any,
    @Body() dto: {
      nome: string;
      ativa: boolean;
      gatilho: string;
      template_id: string;
      atraso_minutos?: number;
      filtros?: Record<string, any>;
    },
  ) {
    return this.service.createAutomacao(req.user.officeId, dto);
  }

  /**
   * PATCH /whatsapp/automacoes/:id
   * Atualizar automação
   */
  @Patch('automacoes/:id')
  async updateAutomacao(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateAutomacao(req.user.officeId, id, dto);
  }

  /**
   * PATCH /whatsapp/automacoes/:id/toggle
   * Ativar/desativar automação
   */
  @Patch('automacoes/:id/toggle')
  async toggleAutomacao(@Request() req: any, @Param('id') id: string) {
    return this.service.toggleAutomacao(req.user.officeId, id);
  }

  /* ──────────────────── CHATBOT JURÍDICO ────────────────────── */

  /**
   * GET /whatsapp/chatbot/config
   * Configurações do chatbot (menu, respostas automáticas)
   * NOVA FUNCIONALIDADE — Chatbot com IA para clientes
   */
  @Get('chatbot/config')
  async getChatbotConfig(@Request() req: any) {
    return this.service.getChatbotConfig(req.user.officeId);
  }

  /**
   * Patch /whatsapp/chatbot/config
   * Configurar chatbot: menu, horários de atendimento, respostas IA
   * Body: {
   *   ativo: bool,
   *   saudacao: string,
   *   menu_opcoes: [{ numero, texto, acao: 'status_processo'|'falar_advogado'|'pagamento'|'documentos' }],
   *   horario_atendimento: { inicio: '09:00', fim: '18:00', dias_semana: [1,2,3,4,5] },
   *   mensagem_fora_horario: string,
   *   ia_habilitada: bool
   * }
   */
  @Patch('chatbot/config')
  async updateChatbotConfig(@Request() req: any, @Body() dto: any) {
    return this.service.updateChatbotConfig(req.user.officeId, dto);
  }

  /**
   * POST /whatsapp/webhook
   * Webhook para receber mensagens do WhatsApp Business API
   * (chamado pelo Meta/WhatsApp)
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receberWebhook(@Body() payload: any) {
    return this.service.processarWebhook(payload);
  }

  /**
   * GET /whatsapp/webhook
   * Verificação do webhook (Meta challenge — responde com número puro)
   */
  @Get('webhook')
  verificarWebhook(
    @Query() query: { 'hub.verify_token': string; 'hub.challenge': string; 'hub.mode': string },
    @Res() res: Response,
  ) {
    const result = this.service.verificarWebhook(query);
    if (typeof result === 'string') {
      // Meta espera o challenge como texto puro, não JSON
      res.setHeader('Content-Type', 'text/plain');
      return res.send(result);
    }
    return res.json(result);
  }

  /* ──────────────────── STATS ────────────────────────────────── */

  /**
   * GET /whatsapp/stats
   * Estatísticas: mensagens enviadas, taxa de entrega/leitura, automações ativas
   */
  @Get('stats')
  async getStats(@Request() req: any, @Query() query: { periodo?: string }) {
    return this.service.getStats(req.user.officeId, query);
  }

  /* ──────────────────── CONFIGURAÇÕES ───────────────────────── */

  /**
   * GET /whatsapp/config
   * Configurações da integração (token, número, status da conta)
   */
  @Get('config')
  async getConfig(@Request() req: any) {
    return this.service.getConfig(req.user.officeId);
  }

  /**
   * Patch /whatsapp/config
   * Atualizar credenciais da API
   * Body: { api_token, phone_number_id, business_account_id }
   */
  @Patch('config')
  async updateConfig(@Request() req: any, @Body() dto: any) {
    return this.service.updateConfig(req.user.officeId, dto);
  }
}
