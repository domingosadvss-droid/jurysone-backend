/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Asaas Webhook Handler
 *
 * Recebe webhooks do Asaas para eventos de pagamento:
 *   - PAYMENT_CONFIRMED / PAYMENT_RECEIVED → pago
 *   - PAYMENT_OVERDUE                      → em atraso
 *   - PAYMENT_DELETED / PAYMENT_REFUNDED   → cancelado
 *
 * Endpoint público: POST /api/asaas/webhook
 *
 * Ao receber um evento:
 *   1. Atualiza o LancamentoFinanceiro no banco (via externalReference)
 *   2. Transmite o evento via SSE para o dashboard em tempo real
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
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { SseService } from '../sse/sse.service';

/** Mapeamento de evento Asaas → status interno do lançamento */
const EVENTO_PARA_STATUS: Record<string, string> = {
  PAYMENT_CONFIRMED:                          'confirmado',
  PAYMENT_RECEIVED:                           'pago',
  PAYMENT_OVERDUE:                            'vencido',
  PAYMENT_DELETED:                            'cancelado',
  PAYMENT_REFUNDED:                           'cancelado',
  PAYMENT_PARTIALLY_REFUNDED:                 'cancelado',
  PAYMENT_CHARGEBACK_REQUESTED:               'contestado',
  PAYMENT_AWAITING_RISK_ANALYSIS:             'pendente',
  PAYMENT_APPROVED_BY_RISK_ANALYSIS:          'confirmado',
};

/** Cor para toast no dashboard */
const EVENTO_PARA_COR: Record<string, string> = {
  PAYMENT_CONFIRMED:         '#10b981', // verde
  PAYMENT_RECEIVED:          '#10b981',
  PAYMENT_OVERDUE:           '#f59e0b', // amarelo
  PAYMENT_DELETED:           '#ef4444', // vermelho
  PAYMENT_REFUNDED:          '#ef4444',
  PAYMENT_PARTIALLY_REFUNDED: '#f97316',
  PAYMENT_CHARGEBACK_REQUESTED: '#ef4444',
};

/** Label legível para o toast */
const EVENTO_PARA_LABEL: Record<string, string> = {
  PAYMENT_CONFIRMED:          '✅ Pagamento Confirmado',
  PAYMENT_RECEIVED:           '✅ Pagamento Recebido',
  PAYMENT_OVERDUE:            '⚠️ Pagamento em Atraso',
  PAYMENT_DELETED:            '❌ Pagamento Cancelado',
  PAYMENT_REFUNDED:           '↩️ Pagamento Estornado',
  PAYMENT_PARTIALLY_REFUNDED: '↩️ Estorno Parcial',
  PAYMENT_CHARGEBACK_REQUESTED: '⚠️ Chargeback Solicitado',
  PAYMENT_AWAITING_RISK_ANALYSIS: '🔍 Em Análise de Risco',
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: '✅ Aprovado pela Análise',
};

@ApiTags('Webhooks — Asaas')
@Controller('asaas/webhook')
export class AsaasWebhookController {
  private readonly logger = new Logger(AsaasWebhookController.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly sseService: SseService,
  ) {}

  /**
   * POST /api/asaas/webhook
   *
   * Payload do Asaas:
   * {
   *   "event": "PAYMENT_CONFIRMED",
   *   "payment": {
   *     "id": "pay_xxx",
   *     "customer": "cus_xxx",
   *     "value": 100.00,
   *     "netValue": 96.50,
   *     "billingType": "BOLETO",
   *     "status": "CONFIRMED",
   *     "description": "...",
   *     "dueDate": "2026-05-01",
   *     "invoiceUrl": "...",
   *     "bankSlipUrl": "...",
   *     "externalReference": "lancamento-uuid"
   *   }
   * }
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook público do Asaas — eventos de pagamento' })
  async handleAsaasWebhook(
    @Body() payload: any,
    @Headers('asaas-access-token') headerToken?: string,
    @Headers('authorization')      authHeader?: string,
  ) {
    try {
      // ── Validação do token do webhook ──────────────────────────────────────
      // O Asaas envia o token gerado no dashboard via:
      //   • Header  "asaas-access-token"
      //   • Body    payload.accessToken
      const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
      if (expectedToken) {
        const bearerToken  = authHeader?.replace('Bearer ', '');
        const receivedToken = headerToken ?? bearerToken ?? payload?.accessToken;
        if (!receivedToken || receivedToken !== expectedToken) {
          this.logger.warn('[Asaas Webhook] Token inválido — requisição rejeitada');
          return { success: false, error: 'Invalid token' };
        }
      }

      const eventName = payload?.event as string;
      const payment   = payload?.payment ?? {};

      this.logger.log(`[Asaas Webhook] Evento: ${eventName} | paymentId: ${payment.id}`);

      if (!eventName || !payment.id) {
        return { success: true, skipped: 'sem event ou payment.id' };
      }

      // ── Atualiza o LancamentoFinanceiro ─────────────────────────────────
      const novoStatus  = EVENTO_PARA_STATUS[eventName];
      const externalRef = payment.externalReference as string | undefined;

      let lancamento: any = null;

      if (novoStatus && externalRef) {
        try {
          // externalReference = ID do lançamento no JurysOne
          lancamento = await this.prisma.lancamentoFinanceiro.update({
            where: { id: externalRef },
            data: {
              status:    novoStatus,
              paidAt:    ['pago', 'confirmado'].includes(novoStatus) ? new Date() : undefined,
              cancelledAt: novoStatus === 'cancelado' ? new Date() : undefined,
            },
          });
          this.logger.log(`[Asaas Webhook] Lançamento ${externalRef} → status: ${novoStatus}`);
        } catch (dbErr) {
          // Lançamento pode não existir (criado fora do sistema) — não é erro crítico
          this.logger.warn(`[Asaas Webhook] Lançamento ${externalRef} não encontrado: ${dbErr.message}`);
        }
      }

      // ── Broadcast SSE ────────────────────────────────────────────────────
      const sseData = {
        evento:      eventName,
        paymentId:   payment.id,
        status:      novoStatus ?? payment.status,
        valor:       payment.value,
        descricao:   payment.description,
        formaPagto:  payment.billingType,
        vencimento:  payment.dueDate,
        invoiceUrl:  payment.invoiceUrl || payment.bankSlipUrl,
        label:       EVENTO_PARA_LABEL[eventName] ?? eventName,
        cor:         EVENTO_PARA_COR[eventName]   ?? '#6366f1',
        lancamentoId: externalRef,
      };

      // Evento genérico de atualização de pagamento
      this.sseService.emit('payment_update', sseData);

      // Eventos especiais
      if (eventName === 'PAYMENT_CONFIRMED' || eventName === 'PAYMENT_RECEIVED') {
        this.sseService.emit('payment_confirmed', sseData);
      }
      if (eventName === 'PAYMENT_OVERDUE') {
        this.sseService.emit('payment_overdue', sseData);
      }

      return { success: true, event: eventName, lancamentoId: externalRef };
    } catch (error) {
      this.logger.error('[Asaas Webhook] Erro inesperado:', error.message);
      // Retorna 200 para o Asaas não reenviar indefinidamente
      return { success: false, error: error.message };
    }
  }
}
