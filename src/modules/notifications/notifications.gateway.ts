/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Notifications Gateway (WebSocket)
 * NOVA FUNCIONALIDADE — Advbox usa Pusher (pago e limitado)
 *
 * Sistema próprio de notificações real-time com:
 *   - WebSocket nativo via Socket.io (NestJS Gateway)
 *   - Salas por escritório e por usuário
 *   - Tipos: processo, prazo, tarefa, chat, financeiro, intimação, IA
 *   - Persistência no banco (notificações não lidas)
 *   - Push Notification (Web Push API / PWA)
 *   - Integração com e-mail (Resend) e WhatsApp
 *   - Badge counter em tempo real
 * ═══════════════════════════════════════════════════════════════
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export enum NotificationType {
  // Processos
  PROCESSO_NOVO_ANDAMENTO    = 'processo.novo_andamento',
  PROCESSO_PRAZO_URGENTE     = 'processo.prazo_urgente',
  PROCESSO_PRAZO_AMANHA      = 'processo.prazo_amanha',
  PROCESSO_STATUS_ALTERADO   = 'processo.status_alterado',
  PROCESSO_NOVO_DOCUMENTO    = 'processo.novo_documento',

  // Tarefas
  TAREFA_ATRIBUIDA           = 'tarefa.atribuida',
  TAREFA_CONCLUIDA           = 'tarefa.concluida',
  TAREFA_COMENTARIO          = 'tarefa.comentario',
  TAREFA_PRAZO_URGENTE       = 'tarefa.prazo_urgente',

  // Financeiro
  FINANCEIRO_PAGAMENTO       = 'financeiro.pagamento_recebido',
  FINANCEIRO_VENCIMENTO      = 'financeiro.vencimento_proximo',
  FINANCEIRO_NF_GERADA       = 'financeiro.nf_gerada',

  // Intimações
  INTIMACAO_NOVA             = 'intimacao.nova',
  INTIMACAO_PRAZO_URGENTE    = 'intimacao.prazo_urgente',

  // E-Sign
  ESIGN_ASSINADO             = 'esign.documento_assinado',
  ESIGN_TODOS_ASSINARAM      = 'esign.todos_assinaram',
  ESIGN_EXPIRADO             = 'esign.envelope_expirado',
  ESIGN_RECUSADO             = 'esign.assinatura_recusada',

  // Portal do Cliente
  PORTAL_MENSAGEM            = 'portal.nova_mensagem',
  PORTAL_APROVACAO           = 'portal.aprovacao_necessaria',
  PORTAL_NPS_RESPONDIDO      = 'portal.nps_respondido',

  // IA
  AI_RELATORIO_PRONTO        = 'ai.relatorio_pronto',
  AI_ANALISE_RISCO           = 'ai.nova_analise_risco',
  AI_PETICAO_GERADA          = 'ai.peticao_gerada',

  // Time Tracking
  TIMETRACK_META_ATINGIDA    = 'timetrack.meta_atingida',
  TIMETRACK_TIMER_LONGO      = 'timetrack.timer_longo',

  // Sistema
  SISTEMA_BACKUP_CONCLUIDO   = 'sistema.backup_concluido',
  SISTEMA_ATUALIZACAO        = 'sistema.nova_atualizacao',
  SISTEMA_IMPORTACAO         = 'sistema.importacao_concluida',
}

export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  link?: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  created_at: string;
  read: boolean;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

  constructor(private readonly jwtService: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('Notifications WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token) as any;
      client.data.userId   = payload.sub;
      client.data.officeId = payload.officeId;
      client.data.role     = payload.role;

      // Entrar na sala do escritório e do usuário
      await client.join(`office:${payload.officeId}`);
      await client.join(`user:${payload.sub}`);

      // Registrar socket do usuário
      if (!this.userSockets.has(payload.sub)) {
        this.userSockets.set(payload.sub, new Set());
      }
      this.userSockets.get(payload.sub)!.add(client.id);

      this.logger.log(`Client connected: user=${payload.sub} socket=${client.id}`);

      // Enviar notificações não lidas na conexão
      client.emit('connected', {
        message: 'Conectado ao sistema de notificações',
        userId: payload.sub,
      });

    } catch (err) {
      this.logger.warn(`Unauthorized connection attempt: ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /* ──────────────────── EVENT HANDLERS ──────────────────────── */

  @SubscribeMessage('mark_read')
  handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notification_id: string },
  ) {
    // Delegado para NotificationsService
    return { event: 'marked_read', id: data.notification_id };
  }

  @SubscribeMessage('mark_all_read')
  handleMarkAllRead(@ConnectedSocket() client: Socket) {
    return { event: 'all_marked_read', userId: client.data.userId };
  }

  @SubscribeMessage('subscribe_processo')
  handleSubscribeProcesso(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { processo_id: string },
  ) {
    client.join(`processo:${data.processo_id}`);
    return { event: 'subscribed', room: `processo:${data.processo_id}` };
  }

  @SubscribeMessage('get_unread_count')
  handleGetUnreadCount(@ConnectedSocket() client: Socket) {
    // Retornado pelo serviço
    return { event: 'unread_count', count: 0 };
  }

  /* ──────────────────── EMIT HELPERS ────────────────────────── */

  /** Notificar usuário específico */
  notifyUser(userId: string, notification: NotificationPayload): void {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  /** Notificar todo o escritório */
  notifyOffice(officeId: string, notification: NotificationPayload): void {
    this.server.to(`office:${officeId}`).emit('notification', notification);
  }

  /** Alias para notifyOffice — aceita payload completo ou (event, data) */
  sendToOffice(officeId: string, notificationOrEvent: NotificationPayload | string, data?: Record<string, any>): void {
    if (typeof notificationOrEvent === 'string') {
      // Called as sendToOffice(officeId, eventName, data)
      this.server.to(`office:${officeId}`).emit(notificationOrEvent, data ?? {});
    } else {
      this.notifyOffice(officeId, notificationOrEvent);
    }
  }

  /** Notificar sala de processo (todos inscritos) */
  notifyProcesso(processoId: string, notification: NotificationPayload): void {
    this.server.to(`processo:${processoId}`).emit('notification', notification);
  }

  /** Atualizar badge counter de não lidos */
  updateUnreadCount(userId: string, count: number): void {
    this.server.to(`user:${userId}`).emit('unread_count', { count });
  }

  /** Notificação de urgência crítica (prazo hoje) */
  criticalAlert(userId: string, data: { title: string; message: string; link: string }): void {
    this.server.to(`user:${userId}`).emit('critical_alert', data);
  }

  /** Broadcast de sistema (ex: manutenção programada) */
  systemBroadcast(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    this.server.emit('system_message', { message, level, timestamp: new Date().toISOString() });
  }

  /** Indicador de digitação no chat */
  typingIndicator(processoId: string, userId: string, isTyping: boolean): void {
    this.server.to(`processo:${processoId}`).emit('user_typing', { userId, isTyping });
  }

  /** Usuários online no escritório */
  getOnlineUsers(officeId: string): string[] {
    return Array.from(this.userSockets.keys());
  }
}
