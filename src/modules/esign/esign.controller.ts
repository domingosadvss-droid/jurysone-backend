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
import { DocxGerarService } from '../documentos/docx-gerar.service';

@ApiTags('E-Sign — Assinatura Digital')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('esign')
export class EsignController {
  private readonly logger = new Logger(EsignController.name);

  constructor(
    private readonly esignService: EsignService,
    private readonly chavesService: ChavesService,
    private readonly docxGerarService: DocxGerarService,
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
          // ── Se dados_cliente presentes: gera 4 PDFs em UM envelope ClickSign v3 ──
          if (dto.dados_cliente?.clienteNome) {
            try {
              const dc  = dto.dados_cliente;
              const s   = (dto.signers || [])[0] || {};
              const dadosPdf = {
                clienteNome:        dc.clienteNome,
                clienteCpf:         dc.clienteCPF || dc.clienteCpf,
                clienteRG:          dc.clienteRG || '',
                clienteRGOrgao:     dc.clienteRGOrgao || 'SSP/SC',
                clienteNaciona:     dc.clienteNaciona || dc.clienteNacionalidade || 'brasileiro(a)',
                clienteEstadoCivil: dc.clienteEstadoCivil || '',
                clienteProfissao:   dc.clienteProfissao || '',
                clienteTelefone:    dc.clienteTelefone || dc.telefone || '',
                clienteEmail:       dc.clienteEmail || dc.email || '',
                clienteEndereco:    dc.clienteRua || dc.clienteEndereco || '',
                clienteNum:         dc.clienteNum || '',
                clienteCompl:       dc.clienteCompl || '',
                clienteBairro:      dc.clienteBairro || '',
                clienteCidade:      dc.clienteCidade || '',
                clienteEstado:      dc.clienteEstado || 'SC',
                clienteCEP:         dc.clienteCEP || '',
                area:               dc.objetoAcao || '',
                tipoAcao:           dc.objetoAcao || '',
                valorAcao:          Number(dc.valorAcao) || 0,
                tipoHonorario:      dc.tipoHonorario || 'percentual',
                percentualExito:    Number(dc.percHonorarios) || 30,
                valorHonorario:     Number(dc.valorHonorarios) || 0,
                formaPagamento:     dc.formaPagamento || 'PIX',
                numParcelas:        Number(dc.numParcelas) || 1,
                cidade:             dc.clienteCidade || 'Balneario Camboriu',
              };

              // Gera os 4 PDFs
              const docs = await this.esignService.gerarTodosDocumentosPdf(dadosPdf);
              this.logger.log(`[ClickSign v3] 4 PDFs gerados para ${dc.clienteNome}`);

              // ── Cria 1 envelope v3 com todos os 4 documentos ──────────────
              const baseV3   = `${base}/api/v3`;
              const authHdr  = clickToken.startsWith('Bearer ') ? clickToken : `Bearer ${clickToken}`;
              const hdrsV3   = { 'Authorization': authHdr, 'Content-Type': 'application/vnd.api+json', 'Accept': 'application/vnd.api+json' };

              const envResp = await fetch(`${baseV3}/envelopes`, {
                method: 'POST', headers: hdrsV3,
                body: JSON.stringify({ data: { type: 'envelopes', attributes: { name: `Documentos — ${dc.clienteNome}`, deadline_at: deadline } } }),
              });
              const envData    = JSON.parse(await envResp.text());
              const envelopeId = envData?.data?.id;
              if (!envelopeId) throw new Error(`ClickSign v3: envelope nao criado — ${JSON.stringify(envData)}`);
              this.logger.log(`[ClickSign v3] Envelope criado: ${envelopeId}`);

              // Upload dos 4 documentos no mesmo envelope
              const docIds: string[] = [];
              for (const doc of docs) {
                const dResp = await fetch(`${baseV3}/envelopes/${envelopeId}/documents`, {
                  method: 'POST', headers: hdrsV3,
                  body: JSON.stringify({ data: { type: 'documents', attributes: { filename: `${doc.nome}.pdf`, content_base64: `data:application/pdf;base64,${doc.base64}` } } }),
                });
                const dData = JSON.parse(await dResp.text());
                const dId   = dData?.data?.id;
                if (!dId) throw new Error(`ClickSign v3: falha upload ${doc.nome}`);
                docIds.push(dId);
                this.logger.log(`[ClickSign v3] Doc '${doc.nome}' id=${dId}`);
              }

              // Cria 1 signatário
              const phoneRaw   = (s.phone_number || s.telefone || '').replace(/\D/g, '');
              const nameWords  = (s.name || dc.clienteNome || '').replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim().split(/\s+/).filter((w: string) => w.length > 0);
              const signerName = nameWords.length >= 2 ? nameWords.join(' ') : `${nameWords[0] || 'Cliente'} Signatario`;
              const sigAttrs: any = {
                name:  signerName,
                email: s.email || dc.clienteEmail || dc.email || '',
                communicate_events: { signature_request: 'email', signature_reminder: 'email', document_signed: 'email' },
              };
              if (phoneRaw.length >= 10) sigAttrs.phone_number = phoneRaw;
              if (dadosPdf.clienteCpf) sigAttrs.documentation = dadosPdf.clienteCpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

              const sigResp  = await fetch(`${baseV3}/envelopes/${envelopeId}/signers`, {
                method: 'POST', headers: hdrsV3,
                body: JSON.stringify({ data: { type: 'signers', attributes: sigAttrs } }),
              });
              const sigData   = JSON.parse(await sigResp.text());
              const signerId  = sigData?.data?.id;
              const signUrl   = sigData?.data?.attributes?.sign_url ?? `${base}/sign/${signerId}`;
              if (!signerId) throw new Error(`ClickSign v3: signatário sem ID`);
              this.logger.log(`[ClickSign v3] Signatário: ${signerId}`);

              // Cria requisitos (sign + auth email + auth whatsapp se tiver telefone) para cada documento
              const hasPhone = phoneRaw.length >= 10;
              for (const docId of docIds) {
                const rels = { document: { data: { type: 'documents', id: docId } }, signer: { data: { type: 'signers', id: signerId } } };
                await fetch(`${baseV3}/envelopes/${envelopeId}/requirements`, {
                  method: 'POST', headers: hdrsV3,
                  body: JSON.stringify({ data: { type: 'requirements', attributes: { action: 'agree', role: 'sign' }, relationships: rels } }),
                });
                await fetch(`${baseV3}/envelopes/${envelopeId}/requirements`, {
                  method: 'POST', headers: hdrsV3,
                  body: JSON.stringify({ data: { type: 'requirements', attributes: { action: 'provide_evidence', auth: 'email' }, relationships: rels } }),
                });
                if (hasPhone) {
                  await fetch(`${baseV3}/envelopes/${envelopeId}/requirements`, {
                    method: 'POST', headers: hdrsV3,
                    body: JSON.stringify({ data: { type: 'requirements', attributes: { action: 'provide_evidence', auth: 'whatsapp' }, relationships: rels } }),
                  });
                }
              }
              this.logger.log(`[ClickSign v3] Auth: email${hasPhone ? ' + whatsapp' : ''}`);

              // Ativa envelope
              await fetch(`${baseV3}/envelopes/${envelopeId}`, {
                method: 'PATCH', headers: hdrsV3,
                body: JSON.stringify({ data: { id: envelopeId, type: 'envelopes', attributes: { status: 'running' } } }),
              });

              // Envia notificação
              await fetch(`${baseV3}/envelopes/${envelopeId}/notifications`, {
                method: 'POST', headers: hdrsV3,
                body: JSON.stringify({ data: { type: 'notifications', attributes: {} } }),
              });

              this.logger.log(`[ClickSign v3] ✅ Envelope ${envelopeId} com 4 docs | sign_url=${signUrl}`);
              return {
                token:       envelopeId,
                name:        `Documentos — ${dc.clienteNome}`,
                status_name: 'pending',
                signers:     [{ token: signerId, sign_url: signUrl, name: signerName, email: sigAttrs.email }],
                _provider:   'clicksign_v3',
              };
            } catch (err) {
              this.logger.error(`[ClickSign v3] Falha envelope: ${err.message}`);
              throw new Error(`Falha ao criar envelope ClickSign: ${err.message}`);
            }
          }

          // ── Fluxo padrão (sem dados_cliente): 1 documento via base64 ──
          if (dto.base64_pdf) {
            const b64 = dto.base64_pdf.startsWith('data:')
              ? dto.base64_pdf
              : `data:application/pdf;base64,${dto.base64_pdf}`;
            docBody.document.content_base64 = b64;
            this.logger.log(`[ClickSign] PDF base64 do frontend: ${Math.round(b64.length / 1024)}KB`);
          } else if (dto.url_pdf) {
            docBody.document.content_base64 = dto.url_pdf;
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
            // ClickSign v1 exige nome com pelo menos duas palavras, sem números
            const cleanedName = (s.name || '')
              .replace(/[^a-zA-ZÀ-ÿ\s]/g, '')  // remove números e caracteres especiais
              .trim();
            const nameWords = cleanedName.split(/\s+/).filter(w => w.length > 0);
            const signerName = nameWords.length >= 2
              ? nameWords.join(' ')
              : nameWords.length === 1 ? `${nameWords[0]} Signatario` : 'Cliente Signatario';
            const hasPhone = phoneRaw.length >= 10;
            const signerBody: any = {
              signer: {
                email:            s.email,
                name:             signerName,
                auths:            hasPhone ? ['email', 'whatsapp'] : ['email'],
                has_documentation: false,
              },
            };
            if (hasPhone) signerBody.signer.phone_number = phoneRaw;

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

            // Notificação por WhatsApp (se telefone disponível)
            if (hasPhone) {
              const whatsResp = await fetch(`${base}/api/v1/notifications${qs}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  notification: {
                    document_key: docKey,
                    signer_key:   sigKey,
                    url:          signUrl,
                    message:      dto.message || 'Por favor, assine o contrato de honorários',
                    delivery:     'whatsapp',
                  },
                }),
              });
              const whatsText = await whatsResp.text().catch(() => '');
              this.logger.log(`[ClickSign] Notificação WhatsApp: ${whatsResp.status} — ${whatsText.substring(0,100)}`);
            }

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
