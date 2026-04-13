/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Zapsign Webhook Handler
 *
 * Recebe webhooks do Zapsign para:
 *   - Documento criado (doc_created)
 *   - Documento assinado (doc_signed)
 *   - Documento visualizado (doc_viewed)
 *   - Documento rejeitado (doc_rejected)
 *
 * Endpoint público: POST /api/zapsign/webhook
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EsignService } from './esign.service';

@ApiTags('Webhooks — Zapsign')
@Controller('zapsign/webhook')
export class ZapsignWebhookController {
  private readonly logger = new Logger(ZapsignWebhookController.name);

  constructor(private readonly esignService: EsignService) {}

  /**
   * POST /api/zapsign/webhook
   * Recebe eventos do Zapsign e processa:
   *   - Documento criado
   *   - Documento assinado (conclusão)
   *
   * Payload esperado:
   * {
   *   "event": "doc_created" | "doc_signed" | "doc_viewed" | "doc_rejected",
   *   "document_id": "string",
   *   "created_at": "ISO 8601",
   *   "signature_id": "string (opcional)",
   *   "status": "pending" | "signed" | "viewed" | "rejected",
   *   ...outros dados do documento
   * }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook público do Zapsign' })
  @ApiResponse({ status: 200, description: 'Webhook processado com sucesso' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  async handleZapsignWebhook(@Body() payload: any) {
    try {
      this.logger.log(`[Zapsign Webhook] Evento recebido: ${payload.event}`);
      this.logger.debug(`[Zapsign Webhook] Payload:`, JSON.stringify(payload, null, 2));

      // Validar payload básico
      if (!payload.event || !payload.document_id) {
        throw new BadRequestException('Payload inválido: event e document_id são obrigatórios');
      }

      // Rotear o webhook para o handler apropriado
      switch (payload.event) {
        case 'doc_created':
          await this.handleDocumentCreated(payload);
          break;

        case 'doc_signed':
          await this.handleDocumentSigned(payload);
          break;

        case 'doc_viewed':
          await this.handleDocumentViewed(payload);
          break;

        case 'doc_rejected':
          await this.handleDocumentRejected(payload);
          break;

        default:
          this.logger.warn(`[Zapsign Webhook] Evento desconhecido: ${payload.event}`);
      }

      // Retornar sucesso para confirmar recebimento ao Zapsign
      return { success: true, message: 'Webhook processado com sucesso', event: payload.event };
    } catch (error) {
      this.logger.error('[Zapsign Webhook] Erro ao processar webhook:', error);
      throw error;
    }
  }

  /**
   * Processa evento: Documento criado
   * - Salva referência do documento Zapsign
   * - Registra início do processo de assinatura
   */
  private async handleDocumentCreated(payload: any) {
    try {
      this.logger.log(`[doc_created] Processando documento: ${payload.document_id}`);

      const {
        document_id,
        created_at,
        name,
        signers,
        external_id, // ID do documento no nosso sistema (se fornecido)
      } = payload;

      // Chamar serviço para processar
      await this.esignService.processZapsignDocumentCreated({
        zapsignDocumentId: document_id,
        externalDocumentId: external_id,
        documentName: name,
        createdAt: new Date(created_at),
        signers: signers || [],
      });

      this.logger.log(`[doc_created] ✓ Documento ${document_id} processado com sucesso`);
    } catch (error) {
      this.logger.error(`[doc_created] ✗ Erro ao processar documento criado:`, error);
      throw error;
    }
  }

  /**
   * Processa evento: Documento assinado (conclusão)
   * - Atualiza status para "signed"
   * - Busca o PDF assinado
   * - Dispara notificações (email, WhatsApp)
   * - Registra trilha de auditoria
   */
  private async handleDocumentSigned(payload: any) {
    try {
      this.logger.log(`[doc_signed] Processando assinatura do documento: ${payload.document_id}`);

      const {
        document_id,
        signed_at,
        signature_id,
        signer_email,
        signer_name,
        signer_cpf,
        document_url, // URL do PDF assinado
        external_id,
      } = payload;

      // Chamar serviço para processar assinatura
      await this.esignService.processZapsignDocumentSigned({
        zapsignDocumentId: document_id,
        externalDocumentId: external_id,
        signatureId: signature_id,
        signedAt: new Date(signed_at),
        signerEmail: signer_email,
        signerName: signer_name,
        signerCpf: signer_cpf,
        documentUrl: document_url,
      });

      this.logger.log(`[doc_signed] ✓ Assinatura do documento ${document_id} processada com sucesso`);
    } catch (error) {
      this.logger.error(`[doc_signed] ✗ Erro ao processar assinatura:`, error);
      throw error;
    }
  }

  /**
   * Processa evento: Documento visualizado
   * - Registra visualização para trilha de auditoria
   */
  private async handleDocumentViewed(payload: any) {
    try {
      this.logger.log(`[doc_viewed] Registrando visualização do documento: ${payload.document_id}`);

      const {
        document_id,
        viewed_at,
        viewer_email,
        viewer_name,
        external_id,
      } = payload;

      // Chamar serviço para registrar visualização
      await this.esignService.processZapsignDocumentViewed({
        zapsignDocumentId: document_id,
        externalDocumentId: external_id,
        viewedAt: new Date(viewed_at),
        viewerEmail: viewer_email,
        viewerName: viewer_name,
      });

      this.logger.log(`[doc_viewed] ✓ Visualização registrada para documento ${document_id}`);
    } catch (error) {
      this.logger.error(`[doc_viewed] ✗ Erro ao registrar visualização:`, error);
      throw error;
    }
  }

  /**
   * Processa evento: Documento rejeitado
   * - Atualiza status para "rejected"
   * - Registra motivo da rejeição
   * - Notifica assinante e administrador
   */
  private async handleDocumentRejected(payload: any) {
    try {
      this.logger.log(`[doc_rejected] Processando rejeição do documento: ${payload.document_id}`);

      const {
        document_id,
        rejected_at,
        rejector_email,
        rejector_name,
        rejection_reason,
        external_id,
      } = payload;

      // Chamar serviço para processar rejeição
      await this.esignService.processZapsignDocumentRejected({
        zapsignDocumentId: document_id,
        externalDocumentId: external_id,
        rejectedAt: new Date(rejected_at),
        rejectorEmail: rejector_email,
        rejectorName: rejector_name,
        rejectionReason: rejection_reason,
      });

      this.logger.log(`[doc_rejected] ✓ Rejeição do documento ${document_id} processada com sucesso`);
    } catch (error) {
      this.logger.error(`[doc_rejected] ✗ Erro ao processar rejeição:`, error);
      throw error;
    }
  }
}
