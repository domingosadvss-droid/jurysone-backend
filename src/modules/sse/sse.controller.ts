/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — SSE Controller
 *
 * Endpoint público: GET /api/sse
 *
 * O frontend se conecta via EventSource e recebe eventos em
 * tempo real (pagamentos Asaas, assinaturas ClickSign, etc.).
 *
 * Não requer JWT — o EventSource nativo do browser não suporta
 * headers customizados; os dados transmitidos não contêm
 * informações sensíveis além do que já é visível no dashboard.
 * ═══════════════════════════════════════════════════════════════
 */

import { Controller, Get, Logger, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { SseService } from './sse.service';

@ApiTags('SSE — Real-time Events')
@Controller('sse')
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(private readonly sseService: SseService) {}

  /**
   * GET /api/sse
   *
   * Abre uma conexão SSE (Server-Sent Events).
   * O cliente receberá eventos em tempo real:
   *   - connected          → confirmação de conexão
   *   - payment_update     → atualização de pagamento Asaas
   *   - payment_confirmed  → pagamento confirmado
   *   - payment_overdue    → pagamento em atraso
   *   - zapsign_update     → atualização de documento ClickSign
   *   - zapsign_doc_signed → documento totalmente assinado
   *   - zapsign_refused    → assinatura recusada
   */
  @Get()
  @Sse()
  stream(): Observable<MessageEvent> {
    this.logger.log('[SSE] Nova conexão estabelecida');

    // Envia evento 'connected' imediatamente ao conectar,
    // depois retransmite todos os eventos futuros do SseService.
    return this.sseService.getStream().pipe(
      startWith({ type: 'connected', data: { status: 'ok', ts: Date.now() } }),
      map(event => ({
        type: event.type,
        data: JSON.stringify(event.data),
      } as MessageEvent)),
    );
  }
}
