import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Listagem ────────────────────────────────────────────────────────────

  async findAll(query: { page?: string; lida?: string; tipo?: string }, userId: string) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = 20;
    const where: any = { usuarioId: userId };
    if (query.lida !== undefined) where.lida = query.lida === 'true';
    if (query.tipo) where.tipo = query.tipo;

    const [total, data] = await Promise.all([
      this.prisma.notificacao.count({ where }),
      this.prisma.notificacao.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, userId: string) {
    const n = await this.prisma.notificacao.findFirst({ where: { id, usuarioId: userId } });
    if (!n) throw new NotFoundException('Notificação não encontrada');
    return n;
  }

  async create(body: {
    tipo: string;
    titulo: string;
    mensagem: string;
    dados?: any;
    link?: string;
    prioridade?: string;
    usuarioId: string;
    escritorioId: string;
  }) {
    return this.prisma.notificacao.create({
      data: {
        tipo: body.tipo,
        titulo: body.titulo,
        mensagem: body.mensagem,
        dados: body.dados ?? null,
        link: body.link ?? null,
        prioridade: body.prioridade ?? 'normal',
        usuarioId: body.usuarioId,
        escritorioId: body.escritorioId,
      },
    });
  }

  async markAsRead(id: string, userId: string) {
    const n = await this.prisma.notificacao.findFirst({ where: { id, usuarioId: userId } });
    if (!n) throw new NotFoundException('Notificação não encontrada');
    return this.prisma.notificacao.update({
      where: { id },
      data: { lida: true, lidaEm: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    const { count } = await this.prisma.notificacao.updateMany({
      where: { usuarioId: userId, lida: false },
      data: { lida: true, lidaEm: new Date() },
    });
    return { updated: count };
  }

  async delete(id: string, userId: string) {
    const n = await this.prisma.notificacao.findFirst({ where: { id, usuarioId: userId } });
    if (!n) throw new NotFoundException('Notificação não encontrada');
    await this.prisma.notificacao.delete({ where: { id } });
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notificacao.count({
      where: { usuarioId: userId, lida: false },
    });
    return { count };
  }

  // ─── Preferências ────────────────────────────────────────────────────────

  async getPreferences(userId: string) {
    const prefs = await this.prisma.preferenciaNotificacao.findMany({
      where: { usuarioId: userId },
    });
    return { data: prefs };
  }

  async updatePreferences(
    userId: string,
    preferences: Array<{ canal: string; tipo: string; ativo: boolean }>,
  ) {
    const ops = preferences.map(p =>
      this.prisma.preferenciaNotificacao.upsert({
        where: { usuarioId_canal_tipo: { usuarioId: userId, canal: p.canal, tipo: p.tipo } },
        create: { usuarioId: userId, canal: p.canal, tipo: p.tipo, ativo: p.ativo },
        update: { ativo: p.ativo },
      }),
    );
    await Promise.all(ops);
    return this.getPreferences(userId);
  }

  // ─── Push Subscriptions ──────────────────────────────────────────────────

  async subscribePush(
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  ) {
    await this.prisma.inscricaoPush.upsert({
      where: {
        // Use endpoint as unique key (may need migration if not unique in schema)
        // Fallback: create if not exists
        id: (
          await this.prisma.inscricaoPush
            .findFirst({ where: { usuarioId: userId, endpoint: subscription.endpoint } })
            .then(r => r?.id ?? 'new')
        ),
      },
      create: {
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh ?? '',
        auth: subscription.keys?.auth ?? '',
        usuarioId: userId,
      },
      update: {
        p256dh: subscription.keys?.p256dh ?? '',
        auth: subscription.keys?.auth ?? '',
      },
    });
    return { message: 'Push subscription registrada com sucesso' };
  }

  // ─── Aliases para compatibilidade com o gateway ──────────────────────────

  list(userId: string, query: any) {
    return this.findAll(query, userId);
  }

  markRead(userId: string, id: string) {
    return this.markAsRead(id, userId);
  }

  markAllRead(userId: string) {
    return this.markAllAsRead(userId);
  }
}
