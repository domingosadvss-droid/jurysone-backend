/**
 * Notifications REST Controller
 * Gerencia notificações persistidas no banco
 */

import {
  Controller, Get, Patch, Delete, Param,
  Query, UseGuards, Request, HttpCode, HttpStatus, Post, Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notificações')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {

  constructor(private readonly service: NotificationsService) {}

  /**
   * GET /notifications
   * Lista notificações do usuário
   * Query: { unread, type, page, per_page }
   */
  @Get()
  async list(
    @Request() req: any,
    @Query() query: {
      unread?: string;
      type?: string;
      page?: string;
      per_page?: string;
    },
  ) {
    return this.service.list(req.user.id, query);
  }

  /**
   * GET /notifications/count
   * Contagem de não lidas (para badge)
   */
  @Get('count')
  async getUnreadCount(@Request() req: any) {
    return this.service.getUnreadCount(req.user.id);
  }

  /**
   * PATCH /notifications/:id/read
   * Marcar como lida
   */
  @Patch(':id/read')
  async markRead(@Request() req: any, @Param('id') id: string) {
    return this.service.markRead(req.user.id, id);
  }

  /**
   * POST /notifications/read-all
   * Marcar todas como lidas
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@Request() req: any) {
    return this.service.markAllRead(req.user.id);
  }

  /**
   * DELETE /notifications/:id
   * Remover notificação
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Request() req: any, @Param('id') id: string) {
    return this.service.delete(req.user.id, id);
  }

  /**
   * GET /notifications/preferences
   * Preferências de notificação do usuário
   */
  @Get('preferences')
  async getPreferences(@Request() req: any) {
    return this.service.getPreferences(req.user.id);
  }

  /**
   * Patch /notifications/preferences
   * Atualizar preferências
   * Body: { email: { prazo: bool, tarefa: bool, ... }, push: {...}, whatsapp: {...} }
   */
  @Patch('preferences')
  async updatePreferences(@Request() req: any, @Body() dto: any) {
    return this.service.updatePreferences(req.user.id, dto);
  }

  /**
   * POST /notifications/push/subscribe
   * Registrar token de push notification (Web Push)
   * Body: { endpoint, keys: { p256dh, auth } }
   */
  @Post('push/subscribe')
  async subscribePush(@Request() req: any, @Body() dto: any) {
    return this.service.subscribePush(req.user.id, dto);
  }
}
