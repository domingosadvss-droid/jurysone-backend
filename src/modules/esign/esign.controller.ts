/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — E-Sign: Assinatura Digital
 * NOVA FUNCIONALIDADE — Não existe no Advbox
 *
 * Assinatura digital de documentos com:
 *   - Assinatura eletrônica simples (e-mail + click)
 *   - Assinatura digital ICP-Brasil (certificado digital)
 *   - Múltiplos signatários com ordem sequencial
 *   - Trilha de auditoria completa (IP, geolocalização, timestamp)
 *   - QR Code de verificação de autenticidade
 *   - Integração com Docusign / ClickSign (API)
 *   - Armazenamento em S3 com hash SHA-256
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
  HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EsignService } from './esign.service';

@ApiTags('E-Sign — Assinatura Digital')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('esign')
export class EsignController {

  constructor(private readonly esignService: EsignService) {}

  /* ──────────────────── ENVELOPES ───────────────────────────── */

  /**
   * GET /esign/envelopes
   * Lista envelopes de assinatura do escritório
   * Query: { status: draft|sent|signed|expired|cancelled, page, per_page }
   * Status no Advbox: não existe
   */
  @Get('envelopes')
  async listEnvelopes(
    @Request() req: any,
    @Query() query: {
      status?: 'draft' | 'sent' | 'signed' | 'expired' | 'cancelled';
      page?: string;
      per_page?: string;
      search?: string;
    },
  ) {
    return this.esignService.listEnvelopes(req.user.officeId, query);
  }

  /**
   * POST /esign/envelopes
   * Criar envelope de assinatura
   * Body: {
   *   title, documento_id?, documento_url?, tipo: 'simples'|'icp_brasil',
   *   signatarios: [{ nome, email, cpf?, papel, ordem, notificacao: 'email'|'whatsapp'|'sms' }],
   *   expira_em?: ISO date,
   *   mensagem?: string
   * }
   */
  @Post('envelopes')
  async createEnvelope(
    @Request() req: any,
    @Body() dto: {
      title: string;
      documento_id?: string;
      documento_url?: string;
      tipo: 'simples' | 'icp_brasil';
      signatarios: Array<{
        nome: string;
        email: string;
        cpf?: string;
        papel: 'signatario' | 'aprovador' | 'testemunha' | 'notificado';
        ordem: number;
        notificacao: 'email' | 'whatsapp' | 'sms';
      }>;
      expira_em?: string;
      mensagem?: string;
    },
  ) {
    return this.esignService.createEnvelope(req.user, dto);
  }

  /**
   * GET /esign/envelopes/:id
   * Detalhes do envelope: signatários, status, histórico
   */
  @Get('envelopes/:id')
  async getEnvelope(@Request() req: any, @Param('id') id: string) {
    return this.esignService.getEnvelope(req.user.officeId, id);
  }

  /**
   * POST /esign/envelopes/:id/enviar
   * Enviar envelope para assinatura (dispara notificações)
   */
  @Post('envelopes/:id/enviar')
  @HttpCode(HttpStatus.OK)
  async enviarEnvelope(@Request() req: any, @Param('id') id: string) {
    return this.esignService.enviarEnvelope(req.user, id);
  }

  /**
   * POST /esign/envelopes/:id/cancelar
   * Cancelar envelope com motivo
   * Body: { motivo }
   */
  @Post('envelopes/:id/cancelar')
  @HttpCode(HttpStatus.OK)
  async cancelarEnvelope(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { motivo: string },
  ) {
    return this.esignService.cancelarEnvelope(req.user, id, dto.motivo);
  }

  /**
   * POST /esign/envelopes/:id/reenviar
   * Reenviar notificação para signatários pendentes
   * Body: { signatario_ids?: string[] } — se vazio, reenvia para todos pendentes
   */
  @Post('envelopes/:id/reenviar')
  @HttpCode(HttpStatus.OK)
  async reenviarEnvelope(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { signatario_ids?: string[] },
  ) {
    return this.esignService.reenviarNotificacoes(req.user, id, dto.signatario_ids);
  }

  /**
   * GET /esign/envelopes/:id/download
   * Download do documento assinado (PDF com certificado embutido)
   */
  @Get('envelopes/:id/download')
  async downloadEnvelope(@Request() req: any, @Param('id') id: string, @Res() res: any) {
    return this.esignService.downloadDocumentoAssinado(req.user.officeId, id, res);
  }

  /**
   * GET /esign/envelopes/:id/auditoria
   * Trilha de auditoria completa do envelope
   * (IP, geolocalização, user agent, timestamp de cada ação)
   */
  @Get('envelopes/:id/auditoria')
  async getAuditoria(@Request() req: any, @Param('id') id: string) {
    return this.esignService.getAuditoria(req.user.officeId, id);
  }

  /* ──────────────────── ASSINATURA PÚBLICA ──────────────────── */

  /**
   * GET /esign/assinar/:token
   * Página de assinatura (acesso público por token)
   * Retorna documento e dados do signatário para renderizar na UI
   */
  @Get('assinar/:token')
  async getSignaturePage(@Param('token') token: string) {
    return this.esignService.getSignaturePage(token);
  }

  /**
   * POST /esign/assinar/:token
   * Executar assinatura eletrônica simples
   * Body: {
   *   nome_completo, cpf, aceite_termos: true,
   *   assinatura_desenho?: base64,  (canvas signature)
   *   ip_address, user_agent, geolocation?
   * }
   */
  @Post('assinar/:token')
  @HttpCode(HttpStatus.OK)
  async executarAssinatura(
    @Param('token') token: string,
    @Body() dto: {
      nome_completo: string;
      cpf: string;
      aceite_termos: boolean;
      assinatura_desenho?: string;
      ip_address: string;
      user_agent: string;
      geolocation?: { lat: number; lng: number };
    },
  ) {
    return this.esignService.executarAssinatura(token, dto);
  }

  /**
   * POST /esign/assinar/:token/icp-brasil
   * Assinar com certificado digital ICP-Brasil (A1/A3)
   * Body: { certificado_base64, assinatura_pkcs7 }
   */
  @Post('assinar/:token/icp-brasil')
  @HttpCode(HttpStatus.OK)
  async assinarIcpBrasil(
    @Param('token') token: string,
    @Body() dto: { certificado_base64: string; assinatura_pkcs7: string },
  ) {
    return this.esignService.assinarIcpBrasil(token, dto);
  }

  /* ──────────────────── VERIFICAÇÃO ─────────────────────────── */

  /**
   * GET /esign/verificar/:hash
   * Verificar autenticidade de documento por hash SHA-256
   * (Acesso público — para terceiros validarem documentos)
   */
  @Get('verificar/:hash')
  async verificarDocumento(@Param('hash') hash: string) {
    return this.esignService.verificarDocumento(hash);
  }

  /* ──────────────────── TEMPLATES ───────────────────────────── */

  /**
   * GET /esign/templates
   * Templates de envelopes reutilizáveis
   * (procuração, contrato de honorários, LGPD, etc.)
   */
  @Get('templates')
  async listTemplates(@Request() req: any) {
    return this.esignService.listTemplates(req.user.officeId);
  }

  /**
   * POST /esign/templates
   * Criar template de envelope
   */
  @Post('templates')
  async createTemplate(@Request() req: any, @Body() dto: any) {
    return this.esignService.createTemplate(req.user.officeId, dto);
  }

  /**
   * POST /esign/templates/:id/usar
   * Criar envelope a partir de template
   * Body: { documento_id, signatarios_customizados?: [...] }
   */
  @Post('templates/:id/usar')
  async usarTemplate(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.esignService.usarTemplate(req.user, id, dto);
  }

  /* ──────────────────── DASHBOARD ───────────────────────────── */

  /**
   * GET /esign/stats
   * Estatísticas de assinaturas: pendentes, concluídos, expirados, taxa de conclusão
   * NOVA FUNCIONALIDADE
   */
  @Get('stats')
  async getStats(@Request() req: any) {
    return this.esignService.getStats(req.user.officeId);
  }
}
