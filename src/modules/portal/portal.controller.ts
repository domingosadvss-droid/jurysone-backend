/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Portal do Cliente
 * NOVA FUNCIONALIDADE — Não existe no Advbox
 *
 * Clientes têm acesso a um portal dedicado onde podem:
 *   - Acompanhar seus processos em tempo real
 *   - Ver documentos e baixar arquivos
 *   - Aprovar propostas de honorários
 *   - Comunicar-se com o advogado via chat
 *   - Assinar documentos digitalmente
 *   - Ver histórico financeiro e boletos
 *   - Receber notificações por e-mail/WhatsApp
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller, Get, Post, Patch, Body, Param,
  UseGuards, Request, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { PortalAuthGuard } from './guards/portal-auth.guard';

@ApiTags('Portal do Cliente')
@Controller('portal')
export class PortalController {

  constructor(private readonly portalService: PortalService) {}

  /* ──────────────────── AUTH DO PORTAL ──────────────────────── */

  /**
   * POST /portal/auth/login
   * Login do cliente no portal (token separado do advogado)
   * Body: { email, password }
   */
  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async loginPortal(@Body() dto: { email: string; password: string }) {
    return this.portalService.loginPortal(dto);
  }

  /**
   * POST /portal/auth/request-access
   * Cliente solicita acesso ao portal (recebe e-mail de convite)
   * Body: { email, cpf_cnpj }
   */
  @Post('auth/request-access')
  @HttpCode(HttpStatus.OK)
  async requestAccess(@Body() dto: { email: string; cpf_cnpj: string }) {
    return this.portalService.requestAccess(dto);
  }

  /**
   * POST /portal/auth/setup-password
   * Primeiro acesso: definir senha pelo token do e-mail
   * Body: { token, password, confirm_password }
   */
  @Post('auth/setup-password')
  async setupPassword(@Body() dto: { token: string; password: string; confirm_password: string }) {
    return this.portalService.setupPassword(dto);
  }

  /* ──────────────────── DASHBOARD DO CLIENTE ────────────────── */

  /**
   * GET /portal/dashboard
   * Resumo geral do cliente: processos, pendências, próximas audiências
   */
  @UseGuards(PortalAuthGuard)
  @Get('dashboard')
  @ApiBearerAuth()
  async getDashboard(@Request() req: any) {
    return this.portalService.getDashboard(req.client.id);
  }

  /* ──────────────────── PROCESSOS DO CLIENTE ────────────────── */

  /**
   * GET /portal/processos
   * Lista processos do cliente com status e última movimentação
   * Query: { page, per_page, status }
   */
  @UseGuards(PortalAuthGuard)
  @Get('processos')
  async getProcessos(
    @Request() req: any,
    @Query() query: { page?: string; per_page?: string; status?: string },
  ) {
    return this.portalService.getProcessos(req.client.id, query);
  }

  /**
   * GET /portal/processos/:id
   * Detalhe do processo: partes, andamentos, documentos, prazos
   */
  @UseGuards(PortalAuthGuard)
  @Get('processos/:id')
  async getProcesso(@Request() req: any, @Param('id') id: string) {
    return this.portalService.getProcesso(req.client.id, id);
  }

  /**
   * GET /portal/processos/:id/timeline
   * Timeline visual de andamentos do processo
   */
  @UseGuards(PortalAuthGuard)
  @Get('processos/:id/timeline')
  async getTimeline(@Request() req: any, @Param('id') id: string) {
    return this.portalService.getTimeline(req.client.id, id);
  }

  /* ──────────────────── DOCUMENTOS ──────────────────────────── */

  /**
   * GET /portal/documentos
   * Lista documentos do cliente (publicados pelo advogado)
   * Query: { processo_id, tipo, page }
   */
  @UseGuards(PortalAuthGuard)
  @Get('documentos')
  async getDocumentos(
    @Request() req: any,
    @Query() query: { processo_id?: string; tipo?: string; page?: string },
  ) {
    return this.portalService.getDocumentos(req.client.id, query);
  }

  /**
   * GET /portal/documentos/:id/download
   * Download de documento (URL pré-assinada S3)
   */
  @UseGuards(PortalAuthGuard)
  @Get('documentos/:id/download')
  async downloadDocumento(@Request() req: any, @Param('id') id: string) {
    return this.portalService.getDocumentoDownload(req.client.id, id);
  }

  /* ──────────────────── FINANCEIRO ──────────────────────────── */

  /**
   * GET /portal/financeiro
   * Extrato financeiro: honorários, despesas, pagamentos
   */
  @UseGuards(PortalAuthGuard)
  @Get('financeiro')
  async getFinanceiro(@Request() req: any) {
    return this.portalService.getFinanceiro(req.client.id);
  }

  /**
   * GET /portal/financeiro/boletos
   * Boletos e cobranças pendentes
   */
  @UseGuards(PortalAuthGuard)
  @Get('financeiro/boletos')
  async getBoletos(@Request() req: any) {
    return this.portalService.getBoletos(req.client.id);
  }

  /**
   * POST /portal/financeiro/boletos/:id/pagar
   * Iniciar pagamento online (Stripe/MercadoPago)
   */
  @UseGuards(PortalAuthGuard)
  @Post('financeiro/boletos/:id/pagar')
  @HttpCode(HttpStatus.OK)
  async pagarBoleto(@Request() req: any, @Param('id') id: string) {
    return this.portalService.iniciarPagamento(req.client.id, id);
  }

  /* ──────────────────── ASSINATURA DIGITAL ──────────────────── */

  /**
   * GET /portal/assinaturas/pendentes
   * Documentos aguardando assinatura do cliente
   */
  @UseGuards(PortalAuthGuard)
  @Get('assinaturas/pendentes')
  async getAssinaturasPendentes(@Request() req: any) {
    return this.portalService.getAssinaturasPendentes(req.client.id);
  }

  /**
   * POST /portal/assinaturas/:id/assinar
   * Assinar documento digitalmente (ICP-Brasil ou simples)
   * Body: { signature_data, ip_address, accepted_terms: true }
   */
  @UseGuards(PortalAuthGuard)
  @Post('assinaturas/:id/assinar')
  @HttpCode(HttpStatus.OK)
  async assinarDocumento(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { signature_data: string; accepted_terms: boolean },
  ) {
    return this.portalService.assinarDocumento(req.client.id, id, dto);
  }

  /* ──────────────────── CHAT COM ADVOGADO ───────────────────── */

  /**
   * GET /portal/chat/mensagens
   * Histórico de mensagens com o advogado
   * Query: { processo_id, page }
   */
  @UseGuards(PortalAuthGuard)
  @Get('chat/mensagens')
  async getMensagens(
    @Request() req: any,
    @Query() query: { processo_id?: string; page?: string },
  ) {
    return this.portalService.getMensagens(req.client.id, query);
  }

  /**
   * POST /portal/chat/mensagens
   * Enviar mensagem para o advogado
   * Body: { processo_id, conteudo, anexo_url? }
   */
  @UseGuards(PortalAuthGuard)
  @Post('chat/mensagens')
  async enviarMensagem(
    @Request() req: any,
    @Body() dto: { processo_id?: string; conteudo: string; anexo_url?: string },
  ) {
    return this.portalService.enviarMensagem(req.client.id, dto);
  }

  /* ──────────────────── APROVAÇÕES ──────────────────────────── */

  /**
   * GET /portal/aprovacoes
   * Propostas, estratégias ou documentos aguardando aprovação do cliente
   */
  @UseGuards(PortalAuthGuard)
  @Get('aprovacoes')
  async getAprovacoes(@Request() req: any) {
    return this.portalService.getAprovacoes(req.client.id);
  }

  /**
   * POST /portal/aprovacoes/:id/aprovar
   * Cliente aprova proposta/documento
   * Body: { comentario? }
   */
  @UseGuards(PortalAuthGuard)
  @Post('aprovacoes/:id/aprovar')
  @HttpCode(HttpStatus.OK)
  async aprovar(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { comentario?: string },
  ) {
    return this.portalService.aprovar(req.client.id, id, dto);
  }

  /**
   * POST /portal/aprovacoes/:id/rejeitar
   * Cliente rejeita com motivo
   * Body: { motivo }
   */
  @UseGuards(PortalAuthGuard)
  @Post('aprovacoes/:id/rejeitar')
  @HttpCode(HttpStatus.OK)
  async rejeitar(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { motivo: string },
  ) {
    return this.portalService.rejeitar(req.client.id, id, dto);
  }

  /* ──────────────────── NOTIFICAÇÕES ────────────────────────── */

  /**
   * GET /portal/notificacoes
   * Notificações do cliente (nova movimentação, prazo, cobrança)
   */
  @UseGuards(PortalAuthGuard)
  @Get('notificacoes')
  async getNotificacoes(
    @Request() req: any,
    @Query() query: { page?: string; unread?: string },
  ) {
    return this.portalService.getNotificacoes(req.client.id, query);
  }

  /**
   * PATCH /portal/notificacoes/:id/lida
   * Marcar notificação como lida
   */
  @UseGuards(PortalAuthGuard)
  @Patch('notificacoes/:id/lida')
  async marcarLida(@Request() req: any, @Param('id') id: string) {
    return this.portalService.marcarNotificacaoLida(req.client.id, id);
  }

  /* ──────────────────── PERFIL DO CLIENTE ───────────────────── */

  /**
   * GET /portal/perfil
   * Dados do próprio perfil
   */
  @UseGuards(PortalAuthGuard)
  @Get('perfil')
  async getPerfil(@Request() req: any) {
    return this.portalService.getPerfil(req.client.id);
  }

  /**
   * PATCH /portal/perfil
   * Atualizar dados do perfil (telefone, endereço, etc.)
   */
  @UseGuards(PortalAuthGuard)
  @Patch('perfil')
  async updatePerfil(
    @Request() req: any,
    @Body() dto: any,
  ) {
    return this.portalService.updatePerfil(req.client.id, dto);
  }

  /**
   * POST /portal/perfil/change-password
   * Alterar senha no portal
   */
  @UseGuards(PortalAuthGuard)
  @Post('perfil/change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Request() req: any,
    @Body() dto: { current_password: string; new_password: string },
  ) {
    return this.portalService.changePassword(req.client.id, dto);
  }

  /**
   * GET /portal/perfil/nps
   * NPS Survey — avaliação do atendimento do escritório
   * NOVA FUNCIONALIDADE
   */
  @UseGuards(PortalAuthGuard)
  @Get('perfil/nps')
  async getNpsSurvey(@Request() req: any) {
    return this.portalService.getNpsSurvey(req.client.id);
  }

  /**
   * POST /portal/perfil/nps
   * Responder NPS
   * Body: { score: 0-10, comentario? }
   */
  @UseGuards(PortalAuthGuard)
  @Post('perfil/nps')
  async responderNps(
    @Request() req: any,
    @Body() dto: { score: number; comentario?: string },
  ) {
    return this.portalService.responderNps(req.client.id, dto);
  }
}
