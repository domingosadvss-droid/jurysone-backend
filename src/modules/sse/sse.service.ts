/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — SSE Service
 *
 * Gerencia conexões SSE (Server-Sent Events) ativas e permite
 * broadcast de eventos para todos os clientes conectados.
 *
 * Usado para notificações em tempo real de:
 *   - Pagamentos Asaas (boleto confirmado, PIX pago, etc.)
 *   - Assinaturas ClickSign (documento assinado, recusado, etc.)
 * ═══════════════════════════════════════════════════════════════
 */

import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export interface SseEvent {
  type: string;
  data: any;
}

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly subject = new Subject<SseEvent>();

  /**
   * Emite um evento para todos os clientes SSE conectados.
   * @param type  Nome do evento (ex: 'payment_update', 'zapsign_update')
   * @param data  Dados do evento (será serializado para JSON)
   */
  emit(type: string, data: any): void {
    this.logger.debug(`[SSE] Broadcast → ${type}`);
    this.subject.next({ type, data });
  }

  /**
   * Retorna o Observable do stream SSE.
   * Cada conexão SSE ativa se inscreve neste Observable.
   */
  getStream(): Observable<SseEvent> {
    return this.subject.asObservable();
  }
}
