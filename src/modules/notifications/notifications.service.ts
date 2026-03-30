import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: any, userId: string) {
    return { message: 'Notifications', userId, query };
  }

  findOne(id: string, userId: string) {
    return { message: 'Notification', id, userId };
  }

  create(body: any, userId: string) {
    return { message: 'Notification created', body, userId };
  }

  markAsRead(id: string, userId: string) {
    return { message: 'Notification marked as read', id, userId };
  }

  markAllAsRead(userId: string) {
    return { message: 'All notifications marked as read', userId };
  }

  delete(id: string, userId: string) {
    return { message: 'Notification deleted', id, userId };
  }

  getPreferences(userId: string) {
    return { message: 'Notification preferences', userId };
  }

  updatePreferences(userId: string, preferences: any) {
    return { message: 'Notification preferences updated', userId, preferences };
  }

  list(userId: string, query: any) {
    return this.findAll(query, userId);
  }

  getUnreadCount(userId: string) {
    return { count: 0, userId };
  }

  markRead(userId: string, id: string) {
    return this.markAsRead(id, userId);
  }

  markAllRead(userId: string) {
    return this.markAllAsRead(userId);
  }

  subscribePush(userId: string, subscription: any) {
    return { message: 'Push subscription registered', userId, subscription };
  }
}
