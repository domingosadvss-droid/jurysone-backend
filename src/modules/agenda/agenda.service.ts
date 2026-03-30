import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GoogleCalendarService } from './google-calendar.service';

// ─── Helpers de data (sem dependências externas) ──────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Dom
  const diff = d.getDate() - day;
  return startOfDay(new Date(d.setDate(diff)));
}

function endOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() + (6 - day);
  return endOfDay(new Date(d.setDate(diff)));
}

function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ─── DTOs inline ─────────────────────────────────────────────────────────────

export interface CreateEventDto {
  title: string;
  description?: string;
  date: string;
  endDate?: string;
  type?: 'PRAZO' | 'AUDIENCIA' | 'REUNIAO' | 'TAREFA' | 'OUTRO';
  isAllDay?: boolean;
  location?: string;
  color?: string;
  processId?: string;
  clientId?: string;
  responsibleIds?: string[];
  notifyAt?: string;
  notifyBeforeMinutes?: number;
  notifyEmail?: boolean;
  notifyWhatsapp?: boolean;
  recurrence?: string;
  recurrenceEndDate?: string;
  status?: 'PENDENTE' | 'CONFIRMADO' | 'CANCELADO' | 'CONCLUIDO';
}

export interface ListEventsQuery {
  start?: string;
  end?: string;
  type?: string;
  view?: 'month' | 'week' | 'day' | 'list';
  responsibleId?: string;
  processId?: string;
  clientId?: string;
  status?: string;
  search?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AgendaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  // ── Includes padrão ─────────────────────────────────────────────────────

  private get defaultInclude() {
    return {
      process:  { select: { id: true, number: true, tribunal: true } },
      client:   { select: { id: true, name: true } },
      createdBy:{ select: { id: true, name: true, avatarUrl: true } },
      responsibles: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      },
    };
  }

  // ── Filtro de range de datas ─────────────────────────────────────────────

  private buildDateFilter(query: ListEventsQuery) {
    const now = new Date();

    if (query.start && query.end) {
      return {
        date: {
          gte: startOfDay(new Date(query.start)),
          lte: endOfDay(new Date(query.end)),
        },
      };
    }

    switch (query.view) {
      case 'month':
        return { date: { gte: startOfMonth(new Date(now)), lte: endOfMonth(new Date(now)) } };
      case 'week':
        return { date: { gte: startOfWeek(new Date(now)), lte: endOfWeek(new Date(now)) } };
      case 'day':
        return { date: { gte: startOfDay(new Date(now)), lte: endOfDay(new Date(now)) } };
      default:
        return {};
    }
  }

  // ── Expansão de recorrência (B-010) ──────────────────────────────────────

  private expandRecurrence(
    base: any,
    rangeStart: Date,
    rangeEnd: Date,
  ): any[] {
    if (!base.recurrence || base.recurrence === 'none') return [];

    const occurrences: any[] = [];
    const baseDate   = new Date(base.date);
    const endDate    = base.recurrenceEndDate
      ? new Date(base.recurrenceEndDate)
      : addDays(rangeEnd, 0); // expande até o fim do range se sem limite

    // Duração original do evento
    const durationMs = base.endDate
      ? new Date(base.endDate).getTime() - baseDate.getTime()
      : 3600_000; // 1h padrão

    // Avança a data de acordo com o tipo de recorrência
    const advance = (d: Date): Date => {
      const n = new Date(d);
      switch (base.recurrence) {
        case 'daily':   n.setDate(n.getDate() + 1);       break;
        case 'weekly':  n.setDate(n.getDate() + 7);       break;
        case 'monthly': n.setMonth(n.getMonth() + 1);     break;
        case 'yearly':  n.setFullYear(n.getFullYear() + 1); break;
      }
      return n;
    };

    let cursor = advance(baseDate); // começa na PRÓXIMA ocorrência (base já existe)
    let guard  = 0;                 // evitar loop infinito

    while (cursor <= endDate && cursor <= rangeEnd && guard++ < 500) {
      if (cursor >= rangeStart) {
        const occEnd = new Date(cursor.getTime() + durationMs);
        occurrences.push({
          ...base,
          id:      `${base.id}_rec_${cursor.getTime()}`, // ID sintético
          date:    cursor.toISOString(),
          endDate: base.endDate ? occEnd.toISOString() : undefined,
          _isRecurrence: true, // marcador para o frontend
        });
      }
      cursor = advance(cursor);
    }

    return occurrences;
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(query: ListEventsQuery, officeId: string) {
    const where: any = {
      officeId,
      ...this.buildDateFilter(query),
    };

    if (query.type)          where.type          = query.type;
    if (query.processId)     where.processId     = query.processId;
    if (query.clientId)      where.clientId      = query.clientId;
    if (query.status)        where.status        = query.status;
    if (query.responsibleId) {
      where.responsibles = { some: { userId: query.responsibleId } };
    }
    if (query.search) {
      where.OR = [
        { title:       { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { location:    { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // FIX B-006: limite de 500 eventos por consulta para evitar sobrecarga
    const baseEvents = await this.prisma.calendarEvent.findMany({
      where,
      include: this.defaultInclude,
      orderBy: { date: 'asc' },
      take: 500,
    });

    // FIX B-010: expandir eventos recorrentes dentro do range solicitado
    const rangeFilter = this.buildDateFilter(query) as any;
    const rangeStart  = rangeFilter.date?.gte ?? new Date(0);
    const rangeEnd    = rangeFilter.date?.lte ?? addDays(new Date(), 365);

    const expanded: any[] = [];
    for (const ev of baseEvents) {
      expanded.push(ev);
      if (ev.recurrence && ev.recurrence !== 'none') {
        const occs = this.expandRecurrence(ev, rangeStart, rangeEnd);
        expanded.push(...occs);
      }
    }

    // Re-ordenar após expansão
    expanded.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return { data: expanded, total: expanded.length, query };
  }

  async getHoje(officeId: string) {
    const today = new Date();
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        officeId,
        date: { gte: startOfDay(today), lte: endOfDay(today) },
      },
      include: this.defaultInclude,
      orderBy: { date: 'asc' },
    });
    return { data: events, total: events.length, date: today.toISOString().split('T')[0] };
  }

  async getSemana(officeId: string) {
    const today = new Date();
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        officeId,
        date: {
          gte: startOfDay(today),
          lte: endOfDay(addDays(today, 7)),
        },
      },
      include: this.defaultInclude,
      orderBy: { date: 'asc' },
    });
    return { data: events, total: events.length };
  }

  async getPrazos(query: { days_ahead?: string }, officeId: string) {
    const daysAhead = query.days_ahead ? parseInt(query.days_ahead) : 30;
    const now = new Date();
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        officeId,
        type: 'PRAZO',
        date: {
          gte: startOfDay(now),
          lte: endOfDay(addDays(now, daysAhead)),
        },
        status: { not: 'CANCELADO' },
      },
      include: this.defaultInclude,
      orderBy: { date: 'asc' },
    });
    return { data: events, total: events.length, days_ahead: daysAhead };
  }

  async findOne(id: string, officeId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id, officeId },
      include: this.defaultInclude,
    });
    if (!event) throw new NotFoundException(`Evento ${id} não encontrado`);
    return event;
  }

  async create(body: CreateEventDto, userId: string, officeId: string) {
    const { responsibleIds, ...data } = body;

    const event = await this.prisma.calendarEvent.create({
      data: {
        ...data,
        date:              new Date(body.date),
        endDate:           body.endDate           ? new Date(body.endDate)           : undefined,
        notifyAt:          body.notifyAt          ? new Date(body.notifyAt)          : undefined,
        recurrenceEndDate: body.recurrenceEndDate ? new Date(body.recurrenceEndDate) : undefined,
        officeId,
        createdById: userId,
        responsibles: responsibleIds?.length
          ? { create: responsibleIds.map(uid => ({ userId: uid })) }
          : undefined,
      },
      include: this.defaultInclude,
    });

    return event;
  }

  async update(id: string, body: Partial<CreateEventDto>, officeId: string) {
    await this.findOne(id, officeId);

    const { responsibleIds, ...rest } = body;
    const updateData: any = { ...rest };

    if (body.date)              updateData.date              = new Date(body.date);
    if (body.endDate)           updateData.endDate           = new Date(body.endDate);
    if (body.notifyAt)          updateData.notifyAt          = new Date(body.notifyAt);
    if (body.recurrenceEndDate) updateData.recurrenceEndDate = new Date(body.recurrenceEndDate);

    if (responsibleIds !== undefined) {
      await this.prisma.eventResponsible.deleteMany({ where: { eventId: id } });
      if (responsibleIds.length) {
        await this.prisma.eventResponsible.createMany({
          data: responsibleIds.map(uid => ({ eventId: id, userId: uid })),
        });
      }
    }

    return this.prisma.calendarEvent.update({
      where: { id },
      data:  updateData,
      include: this.defaultInclude,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    await this.prisma.calendarEvent.delete({ where: { id } });
    return { success: true, id };
  }

  // ── Exportar iCal ────────────────────────────────────────────────────────

  async exportICal(query: ListEventsQuery, officeId: string): Promise<string> {
    const result = await this.findAll(query, officeId);
    // Exportar apenas eventos base (não ocorrências sintéticas de recorrência)
    const events = (result.data as any[]).filter(ev => !ev._isRecurrence);

    // FIX iCal: timestamp UTC no formato iCalendar
    const fmtUtc = (d: Date) =>
      d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

    // FIX iCal: timestamp com TZID America/Sao_Paulo
    const fmtLocal = (d: Date) => {
      const brt = new Date(d.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const pad = (n: number) => String(n).padStart(2, '0');
      return (
        `${brt.getFullYear()}${pad(brt.getMonth() + 1)}${pad(brt.getDate())}` +
        `T${pad(brt.getHours())}${pad(brt.getMinutes())}${pad(brt.getSeconds())}`
      );
    };

    // FIX iCal RFC 5545 §3.3.11: escapar , ; \ em valores de texto
    const escapeText = (s: string) =>
      s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');

    // FIX iCal RFC 5545 §3.1: folding — linhas > 75 octets devem ser quebradas
    const foldLine = (line: string): string => {
      if (line.length <= 75) return line;
      const chunks: string[] = [];
      chunks.push(line.slice(0, 75));
      let i = 75;
      while (i < line.length) {
        chunks.push(' ' + line.slice(i, i + 74));
        i += 74;
      }
      return chunks.join('\r\n');
    };

    const push = (lines: string[], raw: string) => lines.push(foldLine(raw));

    const lines: string[] = [];
    push(lines, 'BEGIN:VCALENDAR');
    push(lines, 'VERSION:2.0');
    push(lines, 'PRODID:-//Jurysone//Agenda//PT-BR');
    push(lines, 'CALSCALE:GREGORIAN');
    push(lines, 'METHOD:PUBLISH');

    // FIX iCal: incluir definição de timezone BRT/BRST (RFC 5545 §3.6.5)
    push(lines, 'BEGIN:VTIMEZONE');
    push(lines, 'TZID:America/Sao_Paulo');
    push(lines, 'BEGIN:STANDARD');
    push(lines, 'TZNAME:BRT');
    push(lines, 'TZOFFSETFROM:-0200');
    push(lines, 'TZOFFSETTO:-0300');
    push(lines, 'DTSTART:19701004T000000');
    push(lines, 'END:STANDARD');
    push(lines, 'END:VTIMEZONE');

    const now = fmtUtc(new Date());

    for (const ev of events) {
      const start = new Date(ev.date);
      const end   = ev.endDate ? new Date(ev.endDate) : new Date(start.getTime() + 3600_000);

      push(lines, 'BEGIN:VEVENT');
      push(lines, `UID:${ev.id}@jurysone`);
      push(lines, `DTSTAMP:${now}`);

      if (ev.isAllDay) {
        // Eventos de dia inteiro usam DATE (sem hora)
        const d = start;
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
        push(lines, `DTSTART;VALUE=DATE:${dateStr}`);
        const de = end;
        const dateStrEnd = `${de.getFullYear()}${pad(de.getMonth() + 1)}${pad(de.getDate())}`;
        push(lines, `DTEND;VALUE=DATE:${dateStrEnd}`);
      } else {
        // FIX iCal: usar TZID em vez de UTC para eventos com hora
        push(lines, `DTSTART;TZID=America/Sao_Paulo:${fmtLocal(start)}`);
        push(lines, `DTEND;TZID=America/Sao_Paulo:${fmtLocal(end)}`);
      }

      push(lines, `SUMMARY:${escapeText(ev.title)}`);
      if (ev.description) push(lines, `DESCRIPTION:${escapeText(ev.description)}`);
      if (ev.location)    push(lines, `LOCATION:${escapeText(ev.location)}`);

      // FIX iCal: incluir CATEGORIES para tipo jurídico
      const catMap: Record<string, string> = {
        PRAZO: 'PRAZO PROCESSUAL', AUDIENCIA: 'AUDIÊNCIA',
        REUNIAO: 'REUNIÃO', TAREFA: 'TAREFA', OUTRO: 'OUTRO',
      };
      if (ev.type && catMap[ev.type]) push(lines, `CATEGORIES:${catMap[ev.type]}`);

      // FIX iCal: STATUS
      const statusMap: Record<string, string> = {
        PENDENTE: 'TENTATIVE', CONFIRMADO: 'CONFIRMED',
        CANCELADO: 'CANCELLED', CONCLUIDO: 'CONFIRMED',
      };
      if (ev.status && statusMap[ev.status]) push(lines, `STATUS:${statusMap[ev.status]}`);

      // FIX iCal: VALARM para notificações configuradas
      if (ev.notifyBeforeMinutes && ev.notifyBeforeMinutes > 0) {
        push(lines, 'BEGIN:VALARM');
        push(lines, 'ACTION:DISPLAY');
        push(lines, `DESCRIPTION:Lembrete: ${escapeText(ev.title)}`);
        push(lines, `TRIGGER:-PT${ev.notifyBeforeMinutes}M`);
        push(lines, 'END:VALARM');
      }

      // FIX iCal: RRULE para eventos recorrentes
      const rruleMap: Record<string, string> = {
        daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY',
        monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY',
      };
      if (ev.recurrence && rruleMap[ev.recurrence]) {
        let rrule = `RRULE:${rruleMap[ev.recurrence]}`;
        if (ev.recurrenceEndDate) {
          const re = new Date(ev.recurrenceEndDate);
          const pad = (n: number) => String(n).padStart(2, '0');
          rrule += `;UNTIL=${re.getFullYear()}${pad(re.getMonth() + 1)}${pad(re.getDate())}T235959Z`;
        }
        push(lines, rrule);
      }

      push(lines, 'END:VEVENT');
    }

    push(lines, 'END:VCALENDAR');
    return lines.join('\r\n');
  }

  // ── Sync Google Calendar ─────────────────────────────────────────────────

  async syncGoogle(
    body: {
      google_token: string;
      calendar_id?: string;
      direction?: 'import' | 'export' | 'both';
      event_id?: string;         // se quiser exportar apenas 1 evento
    },
    userId: string,
  ) {
    const { google_token, calendar_id = 'primary', direction = 'both', event_id } = body;

    if (!google_token) {
      return {
        success: false,
        message: 'google_token é obrigatório. Obtenha-o via GET /api/agenda/google/auth-url',
      };
    }

    const results: Record<string, any> = {};

    // ── Export: JurysOne → Google ──────────────────────────────────────────
    if (direction === 'export' || direction === 'both') {
      if (event_id) {
        // Exportar um único evento
        const googleId = await this.googleCalendar.pushEvento(event_id, google_token, calendar_id);
        results.export = googleId
          ? { success: true, googleEventId: googleId }
          : { success: false, message: 'Evento não encontrado ou já sincronizado' };
      }
    }

    // ── Import: Google → JurysOne ──────────────────────────────────────────
    if (direction === 'import' || direction === 'both') {
      // Para import precisamos do officeId — vem do JWT via userId
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { officeId: true },
      });
      if (user) {
        const stats = await this.googleCalendar.importFromGoogle(
          user.officeId,
          userId,
          google_token,
          calendar_id,
        );
        results.import = { success: true, ...stats };
      }
    }

    return { success: true, direction, ...results };
  }

  /** GET /api/agenda/google/auth-url — URL para iniciar OAuth */
  getGoogleAuthUrl() {
    return { url: this.googleCalendar.getAuthUrl() };
  }

  /** GET /api/agenda/google/callback?code=... — Trocar code por tokens */
  async googleOAuthCallback(code: string) {
    return this.googleCalendar.exchangeCode(code);
  }

  /** GET /api/agenda/google/calendarios — Listar calendários do usuário */
  async listGoogleCalendarios(accessToken: string) {
    return this.googleCalendar.listCalendarios(accessToken);
  }

  // ── Marcar como concluído ────────────────────────────────────────────────

  async concluir(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.calendarEvent.update({
      where: { id },
      data:  { status: 'CONCLUIDO', completedAt: new Date() },
      include: this.defaultInclude,
    });
  }
}
