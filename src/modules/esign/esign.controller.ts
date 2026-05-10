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
          // ── Se dados_cliente presentes: gera 4 PDFs em envelope único via API v3 ──
          this.logger.log(`[ClickSign] dados_cliente presente: ${!!dto.dados_cliente?.clienteNome} | clienteNome: ${dto.dados_cliente?.clienteNome || 'AUSENTE'}`);
          if (dto.dados_cliente?.clienteNome) {
            try {
              const dc  = dto.dados_cliente;
              const s   = (dto.signers || [])[0] || {};
              const dadosDocx = {
                clienteNome:        dc.clienteNome,
                clienteCPF:         dc.clienteCPF || dc.clienteCpf || '',
                clienteRG:          dc.clienteRG || '',
                clienteRGOrgao:     dc.clienteRGOrgao || 'SSP/SC',
                clienteNaciona:     dc.clienteNaciona || dc.clienteNacionalidade || 'brasileiro(a)',
                clienteEstadoCivil: dc.clienteEstadoCivil || '',
                clienteProfissao:   dc.clienteProfissao || '',
                clienteRua:         dc.clienteRua || dc.clienteEndereco || '',
                clienteNum:         dc.clienteNum || '',
                clienteCompl:       dc.clienteCompl || '',
                clienteBairro:      dc.clienteBairro || '',
                clienteCidade:      dc.clienteCidade || '',
                clienteEstado:      dc.clienteEstado || 'SC',
                clienteCEP:         dc.clienteCEP || '',
                objetoAcao:         dc.objetoAcao || '',
                tipoHonorario:      dc.tipoHonorario || 'percentual',
                percHonorarios:     String(Number(dc.percHonorarios) || 30),
                valorHonorarios:    String(Number(dc.valorHonorarios) || 0),
                parcelas:           dc.numParcelas ? `${dc.numParcelas} parcelas` : '',
                cidade:             dc.clienteCidade || 'Balneário Camboriú',
              };

              // Gera os 4 DOCX (com tag {{~position_sign_cliente}} na linha de assinatura)
              const [b1, b2, b3, b4] = await Promise.all([
                this.docxGerarService.gerarDocumento('contrato',         dadosDocx),
                this.docxGerarService.gerarDocumento('procuracao',       dadosDocx),
                this.docxGerarService.gerarDocumento('hipossuficiencia', dadosDocx),
                this.docxGerarService.gerarDocumento('renuncia',         dadosDocx),
              ]);
              const docs = [
                { nome: 'Contrato_de_Prestacao_de_Servicos', base64: b1.toString('base64') },
                { nome: 'Procuracao_Ad_Judicia',             base64: b2.toString('base64') },
                { nome: 'Declaracao_de_Hipossuficiencia',    base64: b3.toString('base64') },
                { nome: 'Carta_de_Renuncia',                 base64: b4.toString('base64') },
              ];
              this.logger.log(`[ClickSign v3] 4 DOCX gerados para ${dc.clienteNome}`);

              // Headers v3: Authorization sem Bearer, Content-Type json:api
              const hdrs = {
                'Authorization': clickToken,
                'Content-Type': 'application/vnd.api+json',
                'Accept': 'application/vnd.api+json',
              };
              const v3 = `${base}/api/v3`;

              // ── 1. Criar envelope ──
              const envResp = await fetch(`${v3}/envelopes`, {
                method: 'POST', headers: hdrs,
                body: JSON.stringify({ data: { type: 'envelopes', attributes: { name: `Documentos — ${dc.clienteNome}` } } }),
              });
              const envText = await envResp.text();
              this.logger.log(`[ClickSign v3] Envelope: ${envResp.status} — ${envText.substring(0, 300)}`);
              if (!envResp.ok) throw new Error(`ClickSign v3: falha ao criar envelope — ${envText}`);
              const envId = (JSON.parse(envText) as any)?.data?.id;
              if (!envId) throw new Error(`ClickSign v3: envId nulo — resposta: ${envText}`);
              this.logger.log(`[ClickSign v3] ✅ Envelope criado: ${envId}`);

              // ── 2. Adicionar os 4 documentos ao envelope ──
              const docIds: string[] = [];
              for (const doc of docs) {
                const dResp = await fetch(`${v3}/envelopes/${envId}/documents`, {
                  method: 'POST', headers: hdrs,
                  body: JSON.stringify({ data: { type: 'documents', attributes: { filename: `${doc.nome}.docx`, content_base64: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${doc.base64}` } } }),
                });
                const dText = await dResp.text();
                this.logger.log(`[ClickSign v3] Doc '${doc.nome}': ${dResp.status} — ${dText.substring(0, 200)}`);
                if (!dResp.ok) { this.logger.warn(`[ClickSign v3] Falha doc ${doc.nome}: ${dText}`); continue; }
                const dId = (JSON.parse(dText) as any)?.data?.id;
                if (dId) docIds.push(dId);
              }
              this.logger.log(`[ClickSign v3] ${docIds.length} de ${docs.length} docs adicionados ao envelope`);
              if (docIds.length === 0) throw new Error('ClickSign v3: nenhum documento adicionado ao envelope');

              // ── 3. Adicionar signatário ──
              const nameWords  = (s.name || dc.clienteNome || '').replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim().split(/\s+/).filter((w: string) => w.length > 0);
              const signerName  = nameWords.length >= 2 ? nameWords.join(' ') : `${nameWords[0] || 'Cliente'} Signatario`;
              const signerEmail = s.email || dc.clienteEmail || dc.email || '';
              const phoneRaw    = (s.phone_number || s.telefone || dc.clienteTelefone || '').replace(/\D/g, '');
              this.logger.log(`[ClickSign v3] Signatário: nome="${signerName}" email="${signerEmail}"`);

              const sigAttrs: any = { name: signerName, email: signerEmail };
              if (phoneRaw.length >= 10) sigAttrs.phone_number = phoneRaw;

              const sigResp = await fetch(`${v3}/envelopes/${envId}/signers`, {
                method: 'POST', headers: hdrs,
                body: JSON.stringify({ data: { type: 'signers', attributes: sigAttrs } }),
              });
              const sigText = await sigResp.text();
              this.logger.log(`[ClickSign v3] Signatário resp: ${sigResp.status} — ${sigText.substring(0, 300)}`);
              if (!sigResp.ok) throw new Error(`ClickSign v3: falha ao criar signatário — ${sigText}`);
              const signerId = (JSON.parse(sigText) as any)?.data?.id;
              if (!signerId) throw new Error(`ClickSign v3: signerId nulo — resposta: ${sigText}`);

              // ── 4. Criar requisitos por documento (qualificação + autenticação + rubrica) ──
              const rubrErrors: string[] = [];
              for (const dId of docIds) {
                // Qualificação: papel do signatário
                const qualResp = await fetch(`${v3}/envelopes/${envId}/requirements`, {
                  method: 'POST', headers: hdrs,
                  body: JSON.stringify({ data: { type: 'requirements', attributes: { action: 'agree', role: 'sign' }, relationships: { document: { data: { type: 'documents', id: dId } }, signer: { data: { type: 'signers', id: signerId } } } } }),
                });
                const qualText = await qualResp.text();
                this.logger.log(`[ClickSign v3] Qualificação doc ${dId}: ${qualResp.status} — ${qualText.substring(0, 200)}`);

                // Autenticação: token por email
                const authResp = await fetch(`${v3}/envelopes/${envId}/requirements`, {
                  method: 'POST', headers: hdrs,
                  body: JSON.stringify({ data: { type: 'requirements', attributes: { action: 'provide_evidence', auth: 'email' }, relationships: { document: { data: { type: 'documents', id: dId } }, signer: { data: { type: 'signers', id: signerId } } } } }),
                });
                const authText = await authResp.text();
                this.logger.log(`[ClickSign v3] Autenticação doc ${dId}: ${authResp.status} — ${authText.substring(0, 200)}`);

                // Rubrica em todas as páginas
                const rubrResp = await fetch(`${v3}/envelopes/${envId}/requirements`, {
                  method: 'POST', headers: hdrs,
                  body: JSON.stringify({ data: { type: 'requirements', attributes: { action: 'rubricate', kind: 'initials', pages: 'all' }, relationships: { document: { data: { type: 'documents', id: dId } }, signer: { data: { type: 'signers', id: signerId } } } } }),
                });
                const rubrText = await rubrResp.text();
                this.logger.log(`[ClickSign v3] Rubrica doc ${dId}: ${rubrResp.status} — ${rubrText.substring(0, 300)}`);
                if (!rubrResp.ok) rubrErrors.push(`doc ${dId}: ${rubrResp.status} — ${rubrText.substring(0, 200)}`);
              }

              // ── 5. Ativar envelope ──
              const actResp = await fetch(`${v3}/envelopes/${envId}`, {
                method: 'PATCH', headers: hdrs,
                body: JSON.stringify({ data: { id: envId, type: 'envelopes', attributes: { status: 'running' } } }),
              });
              const actText = await actResp.text();
              this.logger.log(`[ClickSign v3] Ativação: ${actResp.status} — ${actText.substring(0, 300)}`);
              if (!actResp.ok) throw new Error(`ClickSign v3: falha ao ativar envelope — ${actText}`);

              // ── 6. Notificar signatários (enviar email com link de assinatura) ──
              const notifResp = await fetch(`${v3}/envelopes/${envId}/notifications`, {
                method: 'POST', headers: hdrs,
                body: JSON.stringify({ data: { type: 'notifications', attributes: { message: null } } }),
              });
              const notifText = await notifResp.text();
              this.logger.log(`[ClickSign v3] Notificação: ${notifResp.status} — ${notifText.substring(0, 200)}`);

              const signUrl = `${base}/sign/${signerId}`;
              this.logger.log(`[ClickSign v3] ✅ Envelope ${envId} ativo | signatário=${signerId}`);
              return {
                token:       envId,
                name:        `Documentos — ${dc.clienteNome}`,
                status_name: 'pending',
                signers:     [{ token: signerId, sign_url: signUrl, name: signerName, email: signerEmail }],
                _provider:   'clicksign_v3',
                _rubrErrors: rubrErrors.length > 0 ? rubrErrors : undefined,
              };
            } catch (err) {
              this.logger.error(`[ClickSign v3] Falha: ${err.message}`);
              throw new Error(`Falha ao enviar documentos ClickSign: ${err.message}`);
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
                auths:            ['email'],
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
