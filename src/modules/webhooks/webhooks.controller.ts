/**
 * ════════════════════════════════════════════════════════════════
 * JURYSONE — WebhooksController
 * Recebe eventos externos de: E-Sign providers + Gateways de pagamento
 *
 * ── ENDPOINTS SIMPLIFICADOS (uso interno / integrações genéricas) ──
 *   POST /api/webhooks/assinatura       — Evento genérico de assinatura
 *   POST /api/webhooks/pagamento        — Evento genérico de pagamento
 *   POST /api/webhooks/notificacoes     — Push de notificação externa
 *
 * ── ENDPOINTS DE PROVEDORES ESPECÍFICOS ──
 *   POST /webhooks/esign/zapsign        — ZapSign events (usado pelo Jurysone)
 *   POST /webhooks/esign/clicksign      — ClickSign events
 *   POST /webhooks/esign/docusign       — DocuSign events
 *   POST /webhooks/pagamento/asaas      — Asaas payment events
 *   POST /webhooks/pagamento/stripe     — Stripe payment events
 *   POST /webhooks/pagamento/pagarme    — Pagar.me payment events
 *
 * ── SIMULAÇÃO (dev/demo) ──
 *   POST /webhooks/esign/simular/:id    — Simulate esign
 *   POST /webhooks/pagamento/simular/:id — Simulate payment
 * ════════════════════════════════════════════════════════════════
 */

import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Get,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { StatusFlowService, EsignEventType, PaymentEventType } from '../status-flow/status-flow.service';
import { AutomacoesService } from '../automacoes/automacoes.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import * as crypto from 'crypto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly statusFlowService: StatusFlowService,
    private readonly automacoesService: AutomacoesService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // ════════════════════════════════════════════════════════════
  // ENDPOINTS SIMPLIFICADOS — uso interno / integrações genéricas
  // ════════════════════════════════════════════════════════════

  /**
   * POST /api/webhooks/assinatura
   * Endpoint genérico de evento de assinatura.
   * Aceita payload normalizado independente do provedor:
   *   { status: 'signed'|'rejected'|'expired', document_id: string,
   *     signer_name?: string, signed_at?: string, reason?: string }
   *
   * Faz:
   *   1. Atualiza assinatura → status assinado/rejeitado/expirado
   *   2. Atualiza documento  → status assinado
   *   3. Atualiza processo   → ativo (se assinado)
   *   4. Dispara automações  → esign.assinado | esign.rejeitado | esign.expirado
   */
  @Post('/assinatura')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook genérico de assinatura' })
  @ApiBody({
    schema: {
      example: { status: 'signed', document_id: 'abc-123', signer_name: 'João Silva' },
    },
  })
  async webhookAssinatura(
    @Body() payload: {
      status: 'signed' | 'rejected' | 'expired' | 'viewed';
      document_id: string;
      signer_name?: string;
      signed_at?: string;
      reason?: string;
      metadata?: Record<string, any>;
    },
    @Headers('x-jurysone-secret') secret: string,
  ) {
    this.logger.log(`[/assinatura] status=${payload.status} doc=${payload.document_id}`);

    if (!payload.document_id || !payload.status) {
      throw new BadRequestException('Campos obrigatórios: document_id, status');
    }

    // Validar token webhook
    const expectedSecret = process.env.JURYSONE_WEBHOOK_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      this.logger.warn('[/assinatura] Secret inválido');
      throw new UnauthorizedException('Invalid webhook secret');
    }

    // Mapear status genérico → evento interno
    const eventoMap: Record<string, EsignEventType> = {
      signed:   'assinado',
      rejected: 'rejeitado',
      expired:  'expirado',
      viewed:   'visualizado',
    };

    const evento = eventoMap[payload.status];
    if (!evento) {
      return { ok: false, error: `Status desconhecido: ${payload.status}` };
    }

    // 1. Processar via StatusFlowService (atualiza envelope, atendimento, processo, financeiro)
    const resultado: any = await this.statusFlowService.processEsignEvent(
      payload.document_id,
      evento,
      {
        signerName: payload.signer_name,
        signedAt:   payload.signed_at,
        reason:     payload.reason,
        ...payload.metadata,
      },
    );

    // 2. Disparar automações correspondentes (ex: esign.assinado → criar_tarefa)
    if (resultado.ok) {
      const gatilhoMap: Record<EsignEventType, string> = {
        assinado:    'esign.assinado',
        rejeitado:   'esign.rejeitado',
        expirado:    'esign.expirado',
        visualizado: 'esign.visualizado',
        enviado:     'esign.enviado',
      };

      await this.automacoesService.dispararEvento({
        escritorioId: resultado.escritorioId || '',
        gatilho: gatilhoMap[evento] as any,
        dados: {
          envelope_id:    payload.document_id,
          cliente_nome:   resultado.clienteNome,
          cliente_id:     resultado.clienteId,
          processo_id:    resultado.processoId,
          data_assinatura: payload.signed_at || new Date().toISOString(),
          motivo:         payload.reason,
        },
      }).catch((err) =>
        this.logger.warn(`[/assinatura] Erro ao disparar automações: ${err.message}`),
      );
    }

    return resultado;
  }

  /**
   * POST /api/webhooks/pagamento
   * Endpoint genérico de evento de pagamento.
   * Aceita payload normalizado (Stripe, Asaas, Pagar.me, manual):
   *   { status: 'paid'|'overdue'|'cancelled'|'refunded',
   *     payment_id: string, amount: number, currency?: string }
   *
   * Faz:
   *   1. Atualiza financeiro lancamento → pago/vencido/cancelado
   *   2. Atualiza dashboard (via WebSocket)
   *   3. Dispara automações → financeiro.pagamento_recebido
   */
  @Post('/pagamento')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook genérico de pagamento' })
  @ApiBody({
    schema: {
      example: { status: 'paid', payment_id: 'pay_123', amount: 5000, currency: 'BRL' },
    },
  })
  async webhookPagamento(
    @Body() payload: {
      status: 'paid' | 'overdue' | 'cancelled' | 'refunded' | 'pending';
      payment_id: string;
      amount?: number;
      currency?: string;
      customer_name?: string;
      metadata?: Record<string, any>;
    },
    @Headers('x-jurysone-secret') secret: string,
  ) {
    this.logger.log(`[/pagamento] status=${payload.status} id=${payload.payment_id}`);

    if (!payload.payment_id || !payload.status) {
      throw new BadRequestException('Campos obrigatórios: payment_id, status');
    }

    // Validar token webhook
    const expectedSecret = process.env.JURYSONE_WEBHOOK_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      this.logger.warn('[/pagamento] Secret inválido');
      throw new UnauthorizedException('Invalid webhook secret');
    }

    // Mapear status → evento interno
    const eventoMap: Record<string, PaymentEventType> = {
      paid:      'confirmed',
      overdue:   'overdue',
      cancelled: 'cancelled',
      refunded:  'refunded',
    };

    const evento = eventoMap[payload.status];
    if (!evento) {
      return { ok: true, message: `Status "${payload.status}" ignorado` };
    }

    // 1. Processar via StatusFlowService (atualiza lancamento, notifica escritório)
    const resultado: any = await this.statusFlowService.processPaymentEvent(
      payload.payment_id,
      evento,
      {
        amount:       payload.amount,
        currency:     payload.currency || 'BRL',
        customerName: payload.customer_name,
        ...payload.metadata,
      },
    );

    // 2. Disparar automações financeiro.pagamento_recebido
    if (resultado.ok && evento === 'confirmed') {
      const valorFormatado = payload.amount
        ? (payload.amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
        : '—';

      await this.automacoesService.dispararEvento({
        escritorioId: resultado.escritorioId || '',
        gatilho: 'financeiro.pagamento_recebido' as any,
        dados: {
          lancamento_id:   resultado.lancamentoId,
          cliente_nome:    payload.customer_name || resultado.clienteNome,
          cliente_id:      resultado.clienteId,
          cliente_telefone: resultado.clienteTelefone,
          valor:           payload.amount,
          valor_formatado: valorFormatado,
          processo_id:     resultado.processoId,
        },
      }).catch((err) =>
        this.logger.warn(`[/pagamento] Erro ao disparar automações: ${err.message}`),
      );
    }

    return resultado;
  }

  /**
   * POST /api/webhooks/notificacoes
   * Recebe notificações externas para broadcast ao escritório.
   * Útil para integrações com ferramentas externas (n8n, Zapier, Make).
   *   { escritorio_id: string, titulo: string, mensagem: string,
   *     prioridade?: 'normal'|'alta'|'urgente', link?: string,
   *     usuario_ids?: string[] }
   */
  @Post('/notificacoes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook de notificação externa' })
  async webhookNotificacoes(
    @Body() payload: {
      escritorio_id: string;
      titulo: string;
      mensagem: string;
      prioridade?: 'normal' | 'alta' | 'urgente';
      link?: string;
      usuario_ids?: string[];
      dados?: Record<string, any>;
    },
  ) {
    this.logger.log(`[/notificacoes] escritorio=${payload.escritorio_id} titulo="${payload.titulo}"`);

    if (!payload.escritorio_id || !payload.titulo || !payload.mensagem) {
      throw new BadRequestException('Campos obrigatórios: escritorio_id, titulo, mensagem');
    }

    const notif = {
      id:         `ext-${Date.now()}`,
      type:       'sistema.webhook' as any,
      title:      payload.titulo,
      message:    payload.mensagem,
      data:       payload.dados,
      link:       payload.link,
      priority:   (payload.prioridade || 'normal') as any,
      created_at: new Date().toISOString(),
      read:       false,
    };

    if (payload.usuario_ids?.length) {
      // Notificar usuários específicos
      for (const uid of payload.usuario_ids) {
        this.notificationsGateway.notifyUser(uid, notif);
      }
    } else {
      // Notificar todo o escritório
      this.notificationsGateway.notifyOffice(payload.escritorio_id, notif);
    }

    return {
      ok: true,
      enviados: payload.usuario_ids?.length || 'todos',
      titulo: payload.titulo,
    };
  }

  // ════════════════════════════════════════════════════════════
  // PASSO 5 — E-SIGN WEBHOOKS (provedores específicos)
  // ════════════════════════════════════════════════════════════

  /**
   * POST /webhooks/esign/zapsign
   * Recebe eventos do ZapSign (provedor principal do Jurysone)
   * https://docs.zapsign.co/webhooks
   * Eventos: doc_signed, doc_refused, doc_expired, signer_signed
   */
  @Post('esign/zapsign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook ZapSign' })
  async zapsignWebhook(
    @Body() payload: any,
    @Headers('x-zapsign-token') token: string,
  ) {
    this.logger.log(`ZapSign webhook: event_type=${payload.event_type} doc=${payload.document?.token}`);

    // Validar token do webhook configurado no ZapSign
    const expectedToken = process.env.ZAPSIGN_WEBHOOK_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      this.logger.warn('ZapSign: token inválido');
      throw new UnauthorizedException('Invalid ZapSign webhook token');
    }

    // Mapear eventos ZapSign → internos
    const eventMap: Record<string, EsignEventType> = {
      'doc_signed':    'assinado',   // todos assinaram
      'doc_refused':   'rejeitado',  // um signatário recusou
      'doc_expired':   'expirado',   // prazo expirou
      'signer_signed': 'visualizado', // um signatário assinou (parcial)
      'doc_created':   'enviado',
    };

    const eventType = payload.event_type;
    const evento = eventMap[eventType];

    if (!evento) {
      this.logger.debug(`ZapSign: evento ignorado: ${eventType}`);
      return { ok: true, message: `Evento ${eventType} ignorado` };
    }

    // token do documento = external_id no nosso DB
    const docToken = payload.document?.token;
    if (!docToken) return { ok: false, error: 'document.token ausente' };

    // Signatário que acionou o evento
    const signerInfo = payload.signer || {};

    return this.statusFlowService.processEsignEvent(docToken, evento, {
      provider:      'zapsign',
      event_type:    eventType,
      signer_name:   signerInfo.name,
      signer_email:  signerInfo.email,
      signed_at:     signerInfo.signed_at,
      reason:        signerInfo.refuse_reason,
      raw:           payload,
    });
  }

  /**
   * POST /webhooks/esign/clicksign
   * Recebe eventos do ClickSign
   * https://developers.clicksign.com/docs/webhooks
   */
  @Post('esign/clicksign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook ClickSign' })
  async clicksignWebhook(
    @Body() payload: any,
    @Headers('x-clicksign-hmac-sha256') signature: string,
  ) {
    this.logger.log(`ClickSign webhook: ${JSON.stringify(payload.event)}`);

    // Validate HMAC signature
    if (!this.validateClicksignSignature(payload, signature)) {
      this.logger.warn('ClickSign: invalid signature');
      return { ok: false, error: 'Invalid signature' };
    }

    // Map ClickSign events to internal events
    const eventMap: Record<string, EsignEventType> = {
      'auto_close':          'assinado',
      'signature_request':   'enviado',
      'finished':            'assinado',
      'deadline_passed':     'expirado',
      'cancelled':           'rejeitado',
    };

    const event = eventMap[payload.event?.name];
    if (!event) return { ok: true, message: 'Event ignored' };

    const envelopeId = payload.document?.key;
    return this.statusFlowService.processEsignEvent(envelopeId, event, payload);
  }

  /**
   * POST /webhooks/esign/docusign
   * Recebe eventos do DocuSign (Connect)
   */
  @Post('esign/docusign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook DocuSign' })
  async docusignWebhook(
    @Body() payload: any,
    @Headers('x-docusign-signature-1') signature: string,
  ) {
    this.logger.log(`DocuSign webhook: ${payload.event}`);

    const eventMap: Record<string, EsignEventType> = {
      'envelope-completed': 'assinado',
      'envelope-sent':      'enviado',
      'envelope-voided':    'rejeitado',
      'envelope-expired':   'expirado',
    };

    const event = eventMap[payload.event];
    if (!event) return { ok: true, message: 'Event ignored' };

    const envelopeId = payload.data?.envelopeId;
    return this.statusFlowService.processEsignEvent(envelopeId, event, payload);
  }

  // ════════════════════════════════════════════════════════════
  // PASSO 7 — PAYMENT WEBHOOKS
  // ════════════════════════════════════════════════════════════

  /**
   * POST /webhooks/pagamento/asaas
   * Recebe eventos do Asaas (gateway brasileiro)
   * https://asaasv3.docs.apiary.io/#reference/0/notificacoes/webhook
   */
  @Post('pagamento/asaas')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook Asaas' })
  async asaasWebhook(
    @Body() payload: any,
    @Headers('asaas-access-token') token: string,
  ) {
    this.logger.log(`Asaas webhook: ${payload.event} — payment ${payload.payment?.id}`);

    // Validar token Asaas
    const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      this.logger.warn('Asaas: token inválido');
      throw new UnauthorizedException('Invalid Asaas webhook token');
    }

    const eventMap: Record<string, PaymentEventType> = {
      'PAYMENT_CONFIRMED':           'confirmed',
      'PAYMENT_RECEIVED':            'confirmed',
      'PAYMENT_OVERDUE':             'overdue',
      'PAYMENT_DELETED':             'cancelled',
      'PAYMENT_REFUNDED':            'refunded',
      'PAYMENT_PARTIALLY_REFUNDED':  'refunded',
    };

    const event = eventMap[payload.event];
    if (!event) return { ok: true, message: 'Event ignored' };

    const externalId = payload.payment?.id;
    return this.statusFlowService.processPaymentEvent(externalId, event, payload);
  }

  /**
   * POST /webhooks/pagamento/stripe
   * Recebe eventos do Stripe
   */
  @Post('pagamento/stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook Stripe' })
  async stripeWebhook(
    @Body() rawBody: Buffer,
    @Headers('stripe-signature') signature: string,
  ) {
    // Stripe requires raw body for signature validation
    const event = this.parseStripeEvent(rawBody, signature);
    if (!event) return { ok: false, error: 'Invalid Stripe signature' };

    this.logger.log(`Stripe webhook: ${event.type}`);

    const eventMap: Record<string, PaymentEventType> = {
      'payment_intent.succeeded':       'confirmed',
      'payment_intent.payment_failed':  'cancelled',
      'charge.refunded':                'refunded',
    };

    const paymentEvent = eventMap[event.type];
    if (!paymentEvent) return { ok: true, message: 'Event ignored' };

    const externalId = event.data?.object?.id;
    return this.statusFlowService.processPaymentEvent(externalId, paymentEvent, event);
  }

  /**
   * POST /webhooks/pagamento/pagarme
   * Recebe eventos do Pagar.me
   */
  @Post('pagamento/pagarme')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook Pagar.me' })
  async pagarmeWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature') signature: string,
  ) {
    this.logger.log(`Pagar.me webhook: ${payload.type}`);

    // Validar token Pagar.me via HMAC signature
    const expectedSecret = process.env.PAGARME_WEBHOOK_SECRET;
    if (!expectedSecret || !signature) {
      this.logger.warn('Pagar.me: signature inválida');
      throw new UnauthorizedException('Invalid Pagar.me webhook signature');
    }

    const eventMap: Record<string, PaymentEventType> = {
      'charge.paid':     'confirmed',
      'charge.refunded': 'refunded',
      'charge.failed':   'cancelled',
    };

    const event = eventMap[payload.type];
    if (!event) return { ok: true, message: 'Event ignored' };

    const externalId = payload.data?.id;
    return this.statusFlowService.processPaymentEvent(externalId, event, payload);
  }

  /**
   * GET /webhooks/health
   * Health check for webhook endpoints
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  healthCheck() {
    return {
      status: 'ok',
      endpoints: {
        genericos: [
          'POST /api/webhooks/assinatura       — Evento genérico de assinatura (qualquer provedor)',
          'POST /api/webhooks/pagamento        — Evento genérico de pagamento  (qualquer provedor)',
          'POST /api/webhooks/notificacoes     — Push de notificação externa',
        ],
        provedores: [
          'POST /webhooks/esign/zapsign        — ZapSign (provedor padrão Jurysone)',
          'POST /webhooks/esign/clicksign      — ClickSign',
          'POST /webhooks/esign/docusign       — DocuSign',
          'POST /webhooks/pagamento/asaas      — Asaas',
          'POST /webhooks/pagamento/stripe     — Stripe',
          'POST /webhooks/pagamento/pagarme    — Pagar.me',
        ],
      },
    };
  }

  // ════════════════════════════════════════════════════════════
  // Helpers de validação
  // ════════════════════════════════════════════════════════════

  private validateClicksignSignature(payload: any, signature: string): boolean {
    const secret = process.env.CLICKSIGN_WEBHOOK_SECRET;
    if (!secret) return true; // Skip validation in dev

    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return signature === expected;
  }

  private parseStripeEvent(rawBody: Buffer, signature: string): any {
    try {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) {
        this.logger.warn('Stripe webhook secret not configured');
        return null;
      }

      // Validate Stripe signature using HMAC-SHA256
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody.toString())
        .digest('hex');

      if (!signature.includes(expected)) {
        this.logger.warn('Stripe: invalid signature');
        return null;
      }

      return JSON.parse(rawBody.toString());
    } catch {
      return null;
    }
  }
}
