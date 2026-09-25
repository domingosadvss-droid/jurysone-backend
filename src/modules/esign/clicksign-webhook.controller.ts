/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — ClickSign Webhook Handler
 *
 * Recebe webhooks do ClickSign para:
 *   - Documento assinado por um signatário (sign)
 *   - Documento totalmente assinado / auto-fechado (auto_close)
 *   - Documento cancelado (cancel)
 *   - Documento expirado (deadline)
 *   - Signatário recusou assinar (refusal / refused)
 *
 * Endpoint público: POST /api/clicksign/webhook
 * Validação:       HMAC-SHA256 via header x-clicksign-hmac-sha256
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { createHmac } from 'crypto';
import { EsignService } from './esign.service';
import { SseService } from '../sse/sse.service';

@ApiTags('Webhooks — ClickSign')
@Controller('clicksign/webhook')
export class ClicksignWebhookController {
  private readonly logger = new Logger(ClicksignWebhookController.name);

  constructor(
    private readonly esignService: EsignService,
    private readonly sseService:   SseService,
  ) {}

  /**
   * POST /api/clicksign/webhook
   *
   * Payload do ClickSign:
   * {
   *   "event": {
   *     "name": "sign" | "auto_close" | "cancel" | "deadline" | "refusal",
   *     "data": {
   *       "document": { "key": "...", "status": "...", "filename": "...", "signed_file_url": "..." },
   *       "signer":   { "key": "...", "email": "...", "name": "...", "signed_at": "..." }
   *     }
   *   }
   * }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook público do ClickSign' })
  @ApiResponse({ status: 200, description: 'Webhook processado com sucesso' })
  async handleClicksignWebhook(
    @Body() payload: any,
    @Headers('x-clicksign-hmac-sha256') hmacHeader?: string,
  ) {
    try {
      // ── Validação HMAC-SHA256 ──────────────────────────────────────
      const secret = process.env.CLICKSIGN_WEBHOOK_SECRET;
      if (secret && hmacHeader) {
        const body    = JSON.stringify(payload);
        const digest  = createHmac('sha256', secret).update(body).digest('hex');
        if (digest !== hmacHeader) {
          this.logger.warn('[ClickSign Webhook] Assinatura HMAC inválida — requisição rejeitada');
          return { success: false, error: 'Invalid signature' };
        }
      }

      const eventName = payload?.event?.name;
      const data      = payload?.event?.data ?? {};
      const document  = data.document ?? {};
      const signer    = data.signer   ?? {};
      // v3 envelopes: usa envelope.id (o que foi salvo no banco) com document.key como fallback
      const envelopeKey = data.envelope?.id ?? document.key;

      this.logger.log(`[ClickSign Webhook] Evento: ${eventName} | envelope: ${envelopeKey} | doc: ${document.key}`);

      switch (eventName) {
        // ── Alguém assinou ──────────────────────────────────────────
        case 'sign':
          await this.esignService.processZapsignDocumentSigned({
            zapsignDocumentId:  envelopeKey,
            externalDocumentId: document.key,
            signatureId:        signer.key,
            signedAt:           signer.signed_at ? new Date(signer.signed_at) : new Date(),
            signerEmail:        signer.email,
            signerName:         signer.name,
            signerCpf:          null,
            documentUrl:        document.signed_file_url ?? document.original_file_url ?? null,
          });
          break;

        // ── Todos assinaram — documento concluído ─────────────────────
        case 'auto_close':
        case 'document_closed':
          await this.esignService.processZapsignDocumentSigned({
            zapsignDocumentId:  envelopeKey,
            externalDocumentId: document.key,
            signatureId:        null,
            signedAt:           new Date(),
            signerEmail:        null,
            signerName:         null,
            signerCpf:          null,
            documentUrl:        document.signed_file_url ?? null,
          });
          break;

        // ── Cancelado ───────────────────────────────────────────────
        case 'cancel':
        case 'close':
          await this.esignService.processZapsignDocumentRejected({
            zapsignDocumentId:  envelopeKey,
            externalDocumentId: document.key,
            rejectedAt:         new Date(),
            rejectorEmail:      signer.email ?? null,
            rejectorName:       signer.name  ?? null,
            rejectionReason:    'Documento cancelado no ClickSign',
          });
          break;

        // ── Recusado pelo signatário ──────────────────────────────────
        case 'refusal':
        case 'refused':
          await this.esignService.processZapsignDocumentRejected({
            zapsignDocumentId:  envelopeKey,
            externalDocumentId: document.key,
            rejectedAt:         new Date(),
            rejectorEmail:      signer.email ?? null,
            rejectorName:       signer.name  ?? null,
            rejectionReason:    signer.refused_reason ?? 'Recusado pelo signatário',
          });
          break;

        // ── Expirado ─────────────────────────────────────────────────
        case 'deadline':
          this.logger.warn(`[ClickSign Webhook] Documento expirado: ${document.key}`);
          break;

        // ── Eventos informativos (sem ação necessária) ───────────────
        case 'upload':
        case 'add_signer':
        case 'remove_signer':
        case 'add_image':
        case 'update_deadline':
        case 'update_auto_close':
        case 'update_locale':
        case 'custom':
        case 'signature_started':
          this.logger.debug(`[ClickSign Webhook] Evento informativo ignorado: ${eventName}`);
          break;

        default:
          this.logger.warn(`[ClickSign Webhook] Evento desconhecido: ${eventName}`);
      }

      // ── Broadcast SSE para o dashboard ─────────────────────────────────────
      const sseData = {
        evento:    eventName,
        docToken:  envelopeKey,
        docNome:   document.filename ?? null,
        status:    this._clicksignEventToStatus(eventName),
        signerNome:  signer.name  ?? null,
        signerEmail: signer.email ?? null,
        signedAt:    signer.signed_at ?? null,
        signedFileUrl: document.signed_file_url ?? null,
        toast: this._clicksignEventToToast(eventName, signer.name),
      };

      // Evento genérico de atualização
      this.sseService.emit('zapsign_update', sseData);

      // Evento especial quando todos assinaram
      if (eventName === 'auto_close' || eventName === 'document_closed') {
        this.sseService.emit('zapsign_doc_signed', sseData);
      }

      // Evento especial de recusa
      if (eventName === 'refusal' || eventName === 'refused') {
        this.sseService.emit('zapsign_refused', sseData);
      }

      return { success: true, event: eventName };
    } catch (error) {
      this.logger.error('[ClickSign Webhook] Erro:', error.message);
      // Retorna 200 mesmo com erro para o ClickSign não reenviar indefinidamente
      return { success: false, error: error.message };
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private _clicksignEventToStatus(event: string): string {
    const map: Record<string, string> = {
      sign:            'parcialmente_assinado',
      auto_close:      'assinado',
      document_closed: 'assinado',
      cancel:          'cancelado',
      close:           'cancelado',
      refusal:         'recusado',
      refused:         'recusado',
      deadline:        'expirado',
    };
    return map[event] ?? event;
  }

  private _clicksignEventToToast(event: string, signerName?: string): string {
    const who = signerName ? ` — ${signerName}` : '';
    const map: Record<string, string> = {
      sign:            `Assinatura recebida${who}`,
      auto_close:      'Documento totalmente assinado',
      document_closed: 'Documento totalmente assinado',
      cancel:          'Documento cancelado',
      close:           'Documento cancelado',
      refusal:         `Assinatura recusada${who}`,
      refused:         `Assinatura recusada${who}`,
      deadline:        'Documento expirado',
    };
    return map[event] ?? event;
  }
}
