/**
 * JURYSONE — Google Calendar Integration Service
 *
 * Responsabilidades:
 *  - Autenticar via OAuth 2.0 (access_token por usuário)
 *  - Criar / atualizar / excluir eventos no Google Calendar
 *  - Importar eventos do Google → JurysOne (sync bidirecional)
 *  - Salvar googleEventId no CalendarEvent para vincular as duas sides
 *
 * Variáveis de ambiente necessárias (.env):
 *   GOOGLE_CLIENT_ID      — do Google Cloud Console
 *   GOOGLE_CLIENT_SECRET  — do Google Cloud Console
 *   GOOGLE_REDIRECT_URI   — ex: http://localhost:3001/api/auth/google/callback
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// googleapis importado de forma dinâmica para não quebrar se não estiver instalado
type GoogleCalendarClient = any;

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── OAuth ──────────────────────────────────────────────────────────────────

  /**
   * Retorna a URL de autorização para redirecionar o usuário ao Google.
   * Após consentir, o Google redireciona para GOOGLE_REDIRECT_URI com um `code`.
   */
  getAuthUrl(): string {
    const { OAuth2Client } = this.getGoogleAuth();
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
    });
  }

  /**
   * Troca o `code` OAuth pelo access_token + refresh_token.
   * Retorna os tokens para o frontend armazenar (criptografado no DB).
   */
  async exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string }> {
    const { OAuth2Client } = this.getGoogleAuth();
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) {
      throw new BadRequestException('Não foi possível obter tokens do Google');
    }
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? '',
    };
  }

  // ── Criar evento no Google ─────────────────────────────────────────────────

  /**
   * Cria um evento no Google Calendar e salva o googleEventId no JurysOne.
   */
  async pushEvento(
    jurysoneEventId: string,
    accessToken: string,
    calendarId = 'primary',
  ): Promise<string | null> {
    const ev = await this.prisma.calendarEvent.findUnique({
      where: { id: jurysoneEventId },
      include: {
        responsibles: { include: { user: { select: { email: true } } } },
        createdBy: { select: { email: true } },
      },
    });
    if (!ev) return null;

    try {
      const calendar = this.buildCalendarClient(accessToken);
      const payload = this.toGooglePayload(ev);

      const response = await calendar.events.insert({
        calendarId,
        resource: payload,
      });

      const googleId: string = response.data.id;

      // Persiste o vínculo
      await this.prisma.calendarEvent.update({
        where: { id: jurysoneEventId },
        data: { googleEventId: googleId, googleCalendarId: calendarId },
      });

      this.logger.log(`[GCal] Evento "${ev.title}" criado → ${googleId}`);
      return googleId;
    } catch (err: any) {
      this.logger.error(`[GCal] Falha ao criar evento ${jurysoneEventId}: ${err.message}`);
      return null;
    }
  }

  // ── Atualizar evento no Google ─────────────────────────────────────────────

  /**
   * Atualiza um evento já sincronizado no Google Calendar.
   */
  async updateEvento(
    jurysoneEventId: string,
    accessToken: string,
  ): Promise<boolean> {
    const ev = await this.prisma.calendarEvent.findUnique({
      where: { id: jurysoneEventId },
      include: {
        responsibles: { include: { user: { select: { email: true } } } },
        createdBy: { select: { email: true } },
      },
    });
    if (!ev?.googleEventId) return false;

    try {
      const calendar = this.buildCalendarClient(accessToken);
      await calendar.events.update({
        calendarId: ev.googleCalendarId ?? 'primary',
        eventId: ev.googleEventId,
        resource: this.toGooglePayload(ev),
      });
      this.logger.log(`[GCal] Evento "${ev.title}" atualizado → ${ev.googleEventId}`);
      return true;
    } catch (err: any) {
      this.logger.error(`[GCal] Falha ao atualizar ${jurysoneEventId}: ${err.message}`);
      return false;
    }
  }

  // ── Excluir evento no Google ───────────────────────────────────────────────

  async deleteEvento(jurysoneEventId: string, accessToken: string): Promise<boolean> {
    const ev = await this.prisma.calendarEvent.findUnique({
      where: { id: jurysoneEventId },
    });
    if (!ev?.googleEventId) return false;

    try {
      const calendar = this.buildCalendarClient(accessToken);
      await calendar.events.delete({
        calendarId: ev.googleCalendarId ?? 'primary',
        eventId: ev.googleEventId,
      });
      await this.prisma.calendarEvent.update({
        where: { id: jurysoneEventId },
        data: { googleEventId: null, googleCalendarId: null },
      });
      this.logger.log(`[GCal] Evento "${ev.title}" removido do Google`);
      return true;
    } catch (err: any) {
      this.logger.error(`[GCal] Falha ao excluir ${jurysoneEventId}: ${err.message}`);
      return false;
    }
  }

  // ── Importar eventos do Google → JurysOne ─────────────────────────────────

  /**
   * Importa todos os eventos do Google Calendar para o JurysOne.
   * Usa upsert baseado em googleEventId para evitar duplicatas.
   */
  async importFromGoogle(
    officeId: string,
    userId: string,
    accessToken: string,
    calendarId = 'primary',
    daysBack = 30,
    daysForward = 90,
  ): Promise<{ created: number; updated: number; skipped: number }> {
    const stats = { created: 0, updated: 0, skipped: 0 };

    try {
      const calendar = this.buildCalendarClient(accessToken);
      const timeMin = new Date();
      timeMin.setDate(timeMin.getDate() - daysBack);
      const timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + daysForward);

      const res = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 500,
      });

      const items: any[] = res.data.items ?? [];
      this.logger.log(`[GCal] Importando ${items.length} eventos do Google`);

      for (const item of items) {
        if (item.status === 'cancelled') { stats.skipped++; continue; }

        const startDate = item.start?.dateTime ?? item.start?.date;
        const endDate   = item.end?.dateTime ?? item.end?.date;
        if (!startDate) { stats.skipped++; continue; }

        const existing = await this.prisma.calendarEvent.findFirst({
          where: { googleEventId: item.id, officeId },
        });

        const data = {
          title:           item.summary ?? '(sem título)',
          description:     item.description ?? undefined,
          date:            new Date(startDate),
          endDate:         endDate ? new Date(endDate) : undefined,
          isAllDay:        !item.start?.dateTime,
          location:        item.location ?? undefined,
          googleEventId:   item.id,
          googleCalendarId: calendarId,
          type:            'OUTRO' as const,
          officeId,
          createdById:     userId,
        };

        if (existing) {
          await this.prisma.calendarEvent.update({
            where: { id: existing.id },
            data: {
              title:       data.title,
              description: data.description,
              date:        data.date,
              endDate:     data.endDate,
              isAllDay:    data.isAllDay,
              location:    data.location,
            },
          });
          stats.updated++;
        } else {
          await this.prisma.calendarEvent.create({ data });
          stats.created++;
        }
      }

      this.logger.log(`[GCal] Importação concluída: ${JSON.stringify(stats)}`);
    } catch (err: any) {
      this.logger.error(`[GCal] Falha na importação: ${err.message}`);
    }

    return stats;
  }

  // ── Listar calendários disponíveis ────────────────────────────────────────

  async listCalendarios(accessToken: string): Promise<{ id: string; summary: string; primary: boolean }[]> {
    try {
      const calendar = this.buildCalendarClient(accessToken);
      const res = await calendar.calendarList.list();
      return (res.data.items ?? []).map((c: any) => ({
        id:      c.id,
        summary: c.summary,
        primary: c.primary ?? false,
      }));
    } catch (err: any) {
      this.logger.error(`[GCal] Falha ao listar calendários: ${err.message}`);
      return [];
    }
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private getGoogleAuth() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('googleapis').google.auth;
    } catch {
      throw new BadRequestException(
        'googleapis não instalado. Execute: npm install googleapis',
      );
    }
  }

  private buildCalendarClient(accessToken: string): GoogleCalendarClient {
    let google: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      google = require('googleapis').google;
    } catch {
      throw new BadRequestException('googleapis não instalado');
    }

    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    auth.setCredentials({ access_token: accessToken });

    return google.calendar({ version: 'v3', auth });
  }

  /** Converte um CalendarEvent do JurysOne para o formato da API do Google */
  private toGooglePayload(ev: any): Record<string, any> {
    const startDate = new Date(ev.date);
    const endDate   = ev.endDate ? new Date(ev.endDate) : new Date(startDate.getTime() + 3_600_000);

    const payload: Record<string, any> = {
      summary:     ev.title,
      description: ev.description ?? '',
      location:    ev.location ?? '',
    };

    if (ev.isAllDay) {
      // Formato de dia inteiro: YYYY-MM-DD
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      payload.start = { date: fmt(startDate) };
      payload.end   = { date: fmt(endDate) };
    } else {
      payload.start = { dateTime: startDate.toISOString(), timeZone: 'America/Sao_Paulo' };
      payload.end   = { dateTime: endDate.toISOString(),   timeZone: 'America/Sao_Paulo' };
    }

    // Adicionar participantes (responsáveis + criador)
    const attendees: { email: string }[] = [];
    if (ev.createdBy?.email) attendees.push({ email: ev.createdBy.email });
    for (const r of ev.responsibles ?? []) {
      if (r.user?.email && r.user.email !== ev.createdBy?.email) {
        attendees.push({ email: r.user.email });
      }
    }
    if (attendees.length) payload.attendees = attendees;

    // Recorrência via RRULE RFC 5545
    const rruleMap: Record<string, string> = {
      daily:   'RRULE:FREQ=DAILY',
      weekly:  'RRULE:FREQ=WEEKLY',
      monthly: 'RRULE:FREQ=MONTHLY',
      yearly:  'RRULE:FREQ=YEARLY',
    };
    if (ev.recurrence && rruleMap[ev.recurrence]) {
      let rule = rruleMap[ev.recurrence];
      if (ev.recurrenceEndDate) {
        const until = new Date(ev.recurrenceEndDate)
          .toISOString()
          .replace(/[-:.]/g, '')
          .slice(0, 15) + 'Z';
        rule += `;UNTIL=${until}`;
      }
      payload.recurrence = [rule];
    }

    return payload;
  }
}
