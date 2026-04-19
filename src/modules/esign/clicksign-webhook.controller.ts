/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — ClickSign Webhook Handler
 *
 * Recebe webhooks do ClickSign para:
 *   - Documento assinado por um signatário (sign)
 *   - Documento totalmente assinado / auto-fechado (auto_close)
 *   - Documento cancelado (cancel)
 *   - Documento expirado (deadline)
 *   - Signatário recusou assinar (refused)
 *
 * Endpoint público: POST /api/clicksign/webhook
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EsignService } from './esign.service';

@ApiTags('Webhooks — ClickSign')
@Controller('clicksign/webhook')
export class ClicksignWebhookController {
  private readonly logger = new Logger(ClicksignWebhookController.name);

  constructor(private readonly esignService: EsignService) {}

  /**
   * POST /api/clicksign/webhook
   *
   * Payload do ClickSign:
   * {
   *   "event": {
   *     "name": "sign" | "auto_close" | "cancel" | "deadline" | "refused",
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
  async handleClicksignWebhook(@Body() payload: any) {
    try {
      const eventName = payload?.event?.name;
      const data      = payload?.event?.data ?? {};
      const document  = data.document ?? {};
      const signer    = data.signer   ?? {};

      this.logger.log(`[ClickSign Webhook] Evento: ${eventName} | doc: ${document.key}`);

      switch (eventName) {
        // ── Alguém assinou ──────────────────────────────────────────
        case 'sign':
          await this.esignService.processZapsignDocumentSigned({
            zapsignDocumentId: document.key,
            externalDocumentId: document.key,
            signatureId: signer.key,
            signedAt: signer.signed_at ? new Date(signer.signed_at) : new Date(),
            signerEmail: signer.email,
            signerName: signer.name,
            signerCpf: null,
            documentUrl: document.signed_file_url ?? document.original_file_url ?? null,
          });
          break;

        // ── Todos assinaram — documento concluído ────────────────────
        case 'auto_close':
          await this.esignService.processZapsignDocumentSigned({
            zapsignDocumentId: document.key,
            externalDocumentId: document.key,
            signatureId: null,
            signedAt: new Date(),
            signerEmail: null,
            signerName: null,
            signerCpf: null,
            documentUrl: document.signed_file_url ?? null,
          });
          break;

        // ── Cancelado ───────────────────────────────────────────────
        case 'cancel':
          await this.esignService.processZapsignDocumentRejected({
            zapsignDocumentId: document.key,
            externalDocumentId: document.key,
            rejectedAt: new Date(),
            rejectorEmail: signer.email ?? null,
            rejectorName: signer.name  ?? null,
            rejectionReason: 'Documento cancelado no ClickSign',
          });
          break;

        // ── Recusado pelo signatário ─────────────────────────────────
        case 'refused':
          await this.esignService.processZapsignDocumentRejected({
            zapsignDocumentId: document.key,
            externalDocumentId: document.key,
            rejectedAt: new Date(),
            rejectorEmail: signer.email ?? null,
            rejectorName: signer.name  ?? null,
            rejectionReason: signer.refused_reason ?? 'Recusado pelo signatário',
          });
          break;

        // ── Expirado ─────────────────────────────────────────────────
        case 'deadline':
          this.logger.warn(`[ClickSign Webhook] Documento expirado: ${document.key}`);
          break;

        default:
          this.logger.warn(`[ClickSign Webhook] Evento desconhecido: ${eventName}`);
      }

      return { success: true, event: eventName };
    } catch (error) {
      this.logger.error('[ClickSign Webhook] Erro:', error.message);
      // Retorna 200 mesmo com erro para o ClickSign não reenviar indefinidamente
      return { success: false, error: error.message };
    }
  }
}
