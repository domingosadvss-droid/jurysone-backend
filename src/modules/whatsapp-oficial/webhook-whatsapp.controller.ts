/**
 * JURYSONE — Endereço que a Meta chama (sem login): GET para verificar, POST para entregar eventos.
 * Configurar no app da Meta: URL https://<dominio>/api/whatsapp-oficial/webhook
 * e o token de verificação igual a WHATSAPP_VERIFY_TOKEN.
 */
import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Logger, Post, Query, RawBodyRequest, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookWhatsappService } from './webhook-whatsapp.service';

@ApiExcludeController()
@SkipThrottle() // a Meta entrega em rajadas (ex.: histórico de 180 dias)
@Controller('whatsapp-oficial/webhook')
export class WebhookWhatsappController {
  private readonly logger = new Logger(WebhookWhatsappController.name);

  constructor(private readonly webhook: WebhookWhatsappService) {}

  @Get()
  verificar(@Query() q: any, @Res() res: Response) {
    const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
    if (q?.['hub.mode'] === 'subscribe' && esperado && q?.['hub.verify_token'] === esperado) {
      return res.type('text/plain').send(String(q['hub.challenge'] ?? ''));
    }
    return res.status(403).send('Token de verificação inválido.');
  }

  @Post()
  @HttpCode(200)
  async receber(@Req() req: RawBodyRequest<any>, @Body() payload: any, @Headers('x-hub-signature-256') assinatura?: string) {
    this.validarAssinatura(req.rawBody, assinatura);
    return this.webhook.processar(payload);
  }

  /**
   * Assinatura HMAC-SHA256 do corpo com o segredo do app (WHATSAPP_APP_SECRET).
   * Em produção o segredo é obrigatório; sem ele só o ambiente de desenvolvimento aceita.
   */
  private validarAssinatura(corpo: Buffer | undefined, assinatura?: string) {
    const segredo = process.env.WHATSAPP_APP_SECRET;
    if (!segredo) {
      if (process.env.NODE_ENV === 'production') throw new ForbiddenException('WHATSAPP_APP_SECRET não configurado.');
      return;
    }
    if (!corpo || !assinatura) throw new ForbiddenException('Assinatura ausente.');
    const esperado = Buffer.from('sha256=' + createHmac('sha256', segredo).update(corpo).digest('hex'));
    const recebido = Buffer.from(assinatura);
    if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
      this.logger.warn('Webhook do WhatsApp com assinatura inválida rejeitado.');
      throw new ForbiddenException('Assinatura inválida.');
    }
  }
}
