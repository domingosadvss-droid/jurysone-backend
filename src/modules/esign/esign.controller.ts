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
  HttpCode, HttpStatus, Res, Logger,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EsignService } from './esign.service';
import { ChavesService } from '../chaves/chaves.service';

@ApiTags('E-Sign — Assinatura Digital')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('esign')
export class EsignController {
  private readonly logger = new Logger(EsignController.name);

  constructor(
    private readonly esignService: EsignService,
    private readonly chavesService: ChavesService,
  ) {}

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
    @Body() dto: Record<string, any>,
  ) {
    const escritorioId = req.user.escritorioId ?? req.user.officeId;

    // Detecta payload com signers (enviado pelo frontend ao criar envelope)
    const hasSigners = !!dto.signers;

    if (hasSigners) {
      // ── ClickSign API ────────────────────────────────────────────────────
      const clickToken = await this.chavesService.getChave(escritorioId, 'clicksign');
      this.logger.log(`[ClickSign] Token obtido: ${clickToken ? clickToken.substring(0,8)+'...' : 'NULO'}`);

      if (clickToken) {
        try {
          const base = (process.env.CLICKSIGN_URL || 'https://sandbox.clicksign.com').replace(/\/$/, '');
          const qs   = `?access_token=${clickToken}`;
          this.logger.log(`[ClickSign] Base URL: ${base}`);

          const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString().replace('Z', '-03:00');

          // 1. Criar documento
          const safeName = (dto.name || 'contrato')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
            .replace(/[^a-z0-9_\-]/gi, '_')
            .substring(0, 60);
          const docPath = `/${Date.now()}_${safeName}.pdf`;

          const docBody: any = {
            document: {
              path: docPath,
              deadline_at: deadline,
              auto_close: true,
              locale: 'pt-BR',
              sequence_enabled: false,
            },
          };
          if (dto.base64_pdf) {
            // ClickSign espera: "data:application/pdf;base64,<base64_puro>"
            const b64 = dto.base64_pdf.startsWith('data:')
              ? dto.base64_pdf
              : `data:application/pdf;base64,${dto.base64_pdf}`;
            docBody.document.content_base64 = b64;
            this.logger.log(`[ClickSign] PDF base64 size: ${Math.round(b64.length / 1024)}KB`);
          } else if (dto.url_pdf) {
            docBody.document.content_base64 = dto.url_pdf; // campo legado
          }

          this.logger.log(`[ClickSign] Criando documento: POST ${base}/api/v1/documents`);
          const docResp = await fetch(`${base}/api/v1/documents${qs}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docBody),
          });

          const docRespText = await docResp.text();
          this.logger.log(`[ClickSign] Resposta documento: ${docResp.status} — ${docRespText.substring(0, 300)}`);

          if (!docResp.ok) {
            throw new Error(`ClickSign criar documento: ${docResp.status} — ${docRespText}`);
          }

          const docData = JSON.parse(docRespText) as any;
          const docKey  = docData.document?.key;
          this.logger.log(`[ClickSign] ✅ Documento criado: key=${docKey}`);

          // 2. Criar signatários e vinculá-los
          const signersOut: any[] = [];
          for (const s of (dto.signers || [])) {
            const phoneRaw = (s.phone_number || s.telefone || '').replace(/\D/g, '');
            const signerBody: any = {
              signer: {
                email:            s.email,
                name:             s.name,
                auths:            ['email'],
                has_documentation: false,
              },
            };
            if (phoneRaw.length >= 10) signerBody.signer.phone_number = phoneRaw;

            this.logger.log(`[ClickSign] Criando signatário: ${s.email}`);
            const sigResp = await fetch(`${base}/api/v1/signers${qs}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(signerBody),
            });
            const sigRespText = await sigResp.text();
            this.logger.log(`[ClickSign] Resposta signatário: ${sigResp.status} — ${sigRespText.substring(0,200)}`);
            if (!sigResp.ok) {
              this.logger.warn(`[ClickSign] Falha ao criar signatário ${s.email}: ${sigRespText}`);
              continue;
            }
            const sigData = JSON.parse(sigRespText) as any;
            const sigKey  = sigData.signer?.key;

            // Vincular signatário ao documento
            this.logger.log(`[ClickSign] Vinculando signatário ${sigKey} ao doc ${docKey}`);
            const listResp = await fetch(`${base}/api/v1/lists${qs}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                list: {
                  document_key: docKey,
                  signer_key:   sigKey,
                  sign_as:      'sign',
                  refusable:    false,
                  message:      dto.message || 'Por favor, assine o contrato',
                },
              }),
            });
            const listRespText = await listResp.text();
            this.logger.log(`[ClickSign] Resposta list: ${listResp.status} — ${listRespText.substring(0,200)}`);
            const listData = listResp.ok ? JSON.parse(listRespText) as any : {};
            const signUrl  = listData.list?.url || `${base}/sign/${sigKey}`;

            // Enviar notificação por e-mail
            const notifResp = await fetch(`${base}/api/v1/notifications${qs}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                notification: {
                  document_key: docKey,
                  signer_key:   sigKey,
                  url:          signUrl,
                  message:      dto.message || 'Por favor, assine o contrato de honorários',
                },
              }),
            });
            const notifText = await notifResp.text().catch(() => '');
            this.logger.log(`[ClickSign] Notificação e-mail: ${notifResp.status} — ${notifText.substring(0,100)}`);

            signersOut.push({ token: sigKey, sign_url: signUrl, name: s.name, email: s.email });
          }

          this.logger.log(`[ClickSign] ✅ Envelope criado com ${signersOut.length} signatário(s)`);
          // Retorna formato compatível com o frontend
          return {
            token: docKey,
            name: docData.document?.filename || dto.name,
            status_name: 'pending',
            signers: signersOut,
            _provider: 'clicksign',
          };
        } catch (e: any) {
          this.logger.error(`[ClickSign] ❌ Falha: ${e.message}`);
          // Expõe o erro no response para debug (não bloqueia o fallback)
          (dto as any)._clicksign_error = e.message;
        }
      } else {
        this.logger.warn('[ClickSign] Token não configurado — usando envelope local');
      }

      // Fallback: envelope local
      const envelope = await this.esignService.createEnvelope(req.user, {
        title: dto.name || 'Documento para Assinatura',
        tipo: 'simples',
        signatarios: (dto.signers || []).map((s: any, i: number) => ({
          nome: s.name,
          email: s.email,
          papel: 'signatario' as const,
          ordem: i + 1,
          notificacao: 'email' as const,
        })),
        mensagem: dto.message,
      });

      return {
        token: (envelope as any).id,
        name: (envelope as any).titulo,
        status_name: 'pending',
        signers: [],
        _local: true,
        _clicksign_error: (dto as any)._clicksign_error ?? null,
      };
    }

    // Formato interno do backend
    return this.esignService.createEnvelope(req.user, dto as any);
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

  /* ──────────────────── MODELOS DE DOCUMENTOS (PDF próprio) ─── */

  /**
   * GET /esign/modelos
   * Lista modelos de PDF cadastrados pelo escritório
   */
  @Get('modelos')
  async listarModelos(@Request() req: any) {
    return this.esignService.getTemplates(req.user.officeId);
  }

  /**
   * POST /esign/modelos/upload
   * Faz upload de um PDF como modelo de documento
   * Form-data: { tipo: string, arquivo: File }
   * Tipos válidos: contrato_honorarios | procuracao | declaracao_hipossuficiencia | questionario_juridico
   */
  @Post('modelos/upload')
  @UseInterceptors(FileInterceptor('arquivo', { storage: memoryStorage() }))
  async uploadModelo(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('tipo') tipo: string,
  ) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado');
    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Apenas arquivos PDF são aceitos');
    }
    const tiposValidos = [
      'contrato_honorarios',
      'procuracao',
      'declaracao_hipossuficiencia',
      'questionario_juridico',
    ];
    if (!tiposValidos.includes(tipo)) {
      throw new BadRequestException(`Tipo inválido. Use: ${tiposValidos.join(', ')}`);
    }
    return this.esignService.uploadTemplate(
      req.user.officeId,
      tipo,
      file.buffer,
      file.originalname,
    );
  }

  /**
   * DELETE /esign/modelos/:tipo
   * Remove modelo de PDF de um tipo específico
   */
  @Delete('modelos/:tipo')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerModelo(
    @Request() req: any,
    @Param('tipo') tipo: string,
  ) {
    return this.esignService.deleteTemplate(req.user.officeId, tipo);
  }

  /* ──────────────────── DASHBOARD ───────────────────────────── */

  /**
   * GET /esign/stats
   * Estatísticas de assinaturas: pendentes, concluídos, expirados, taxa de conclusão
   */
  @Get('stats')
  async getStats(@Request() req: any) {
    return this.esignService.getStats(req.user.officeId);
  }
}
