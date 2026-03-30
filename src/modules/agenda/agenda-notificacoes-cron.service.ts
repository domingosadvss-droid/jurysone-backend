/**
 * JURYSONE — Agenda Notificações Cron Service (B-009)
 *
 * Executa a cada 5 minutos e despacha notificações de eventos
 * cuja janela de alerta (notifyAt) já chegou e ainda não foram enviadas.
 *
 * Fluxo:
 *   1. Busca eventos com notifyAt <= agora AND notificacaoEnviada = false
 *   2. Para cada evento dispara: e-mail (se notifyEmail) e WhatsApp (se notifyWhatsapp)
 *   3. Marca notificacaoEnviada = true para não reenviar
 *
 * Dependências já no package.json:
 *   - @nestjs/schedule ^4.0.0
 *   - node-cron ^4.x (via @nestjs/schedule internamente)
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AgendaNotificacoesCronService {
  private readonly logger = new Logger(AgendaNotificacoesCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roda a cada 5 minutos.
   * Busca eventos pendentes de notificação e os despacha.
   */
  @Cron('*/5 * * * *', { name: 'agenda-notificacoes' })
  async despacharNotificacoes(): Promise<void> {
    const agora = new Date();

    // ── 1. Buscar eventos que precisam de notificação ──────────────────────
    const eventos = await this.prisma.calendarEvent.findMany({
      where: {
        notificacaoEnviada: false,
        notifyAt: { lte: agora },
        status: { not: 'CANCELADO' },
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, phone: true } },
        responsibles: {
          include: { user: { select: { id: true, name: true, email: true, phone: true } } },
        },
        process: { select: { number: true, tribunal: true } },
        client: { select: { name: true } },
        office: { select: { name: true } },
      },
      take: 200, // limite de segurança por ciclo
    });

    if (eventos.length === 0) return;

    this.logger.log(`[B-009] ${eventos.length} evento(s) para notificar`);

    // ── 2. Processar cada evento ───────────────────────────────────────────
    const ids: string[] = [];

    for (const ev of eventos) {
      try {
        // Coletar destinatários únicos (criador + responsáveis)
        const destinatariosMap = new Map<string, { name: string; email: string; phone?: string }>();
        destinatariosMap.set(ev.createdBy.id, {
          name: ev.createdBy.name,
          email: ev.createdBy.email,
          phone: ev.createdBy.phone ?? undefined,
        });
        for (const resp of ev.responsibles) {
          destinatariosMap.set(resp.user.id, {
            name: resp.user.name,
            email: resp.user.email,
            phone: resp.user.phone ?? undefined,
          });
        }

        // Texto base da notificação
        const dataFormatada = this.formatarData(ev.date);
        const horaFormatada = ev.isAllDay ? 'Dia inteiro' : this.formatarHora(ev.date);
        const processoInfo = ev.process
          ? ` | Proc. ${ev.process.number} (${ev.process.tribunal})`
          : '';
        const clienteInfo = ev.client ? ` | Cliente: ${ev.client.name}` : '';
        const localInfo = ev.location ? ` | Local: ${ev.location}` : '';

        const assunto = `[JurysOne] Lembrete: ${ev.title}`;
        const corpo = [
          `Lembrete de evento — ${ev.office.name}`,
          ``,
          `📌 ${ev.title}`,
          `📅 ${dataFormatada} às ${horaFormatada}`,
          processoInfo ? `⚖️  ${processoInfo.slice(3)}` : '',
          clienteInfo ? `👤 ${clienteInfo.slice(3)}` : '',
          localInfo ? `📍 ${localInfo.slice(3)}` : '',
          ev.description ? `\n📝 ${ev.description}` : '',
          ``,
          `— Enviado automaticamente pelo JurysOne`,
        ]
          .filter(l => l !== '')
          .join('\n');

        for (const dest of destinatariosMap.values()) {
          // ── E-mail ───────────────────────────────────────────────────
          if (ev.notifyEmail && dest.email) {
            await this.enviarEmail(dest.email, dest.name, assunto, corpo).catch(err =>
              this.logger.warn(`[B-009] Email falhou para ${dest.email}: ${err.message}`),
            );
          }

          // ── WhatsApp ─────────────────────────────────────────────────
          if (ev.notifyWhatsapp && dest.phone) {
            const telefone = this.normalizarTelefone(dest.phone);
            if (telefone) {
              await this.enviarWhatsapp(telefone, corpo).catch(err =>
                this.logger.warn(`[B-009] WhatsApp falhou para ${telefone}: ${err.message}`),
              );
            }
          }
        }

        ids.push(ev.id);
        this.logger.debug(`[B-009] Notificado: "${ev.title}" (${ev.id})`);
      } catch (err: any) {
        this.logger.error(`[B-009] Erro ao processar evento ${ev.id}: ${err.message}`);
        // Não adiciona a ids[] → será tentado no próximo ciclo
      }
    }

    // ── 3. Marcar como enviado (batch) ────────────────────────────────────
    if (ids.length > 0) {
      await this.prisma.calendarEvent.updateMany({
        where: { id: { in: ids } },
        data: { notificacaoEnviada: true },
      });
      this.logger.log(`[B-009] ${ids.length} notificação(ões) marcada(s) como enviada(s)`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Envia e-mail usando Nodemailer com transporte SMTP configurado via env.
   * Variáveis necessárias no .env:
   *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
   */
  private async enviarEmail(
    para: string,
    nome: string,
    assunto: string,
    corpo: string,
  ): Promise<void> {
    // Importação dinâmica para não quebrar caso nodemailer não esteja instalado
    let nodemailer: any;
    try {
      nodemailer = require('nodemailer');
    } catch {
      this.logger.warn('[B-009] nodemailer não instalado — e-mail ignorado');
      return;
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.debug('[B-009] SMTP não configurado — e-mail ignorado');
      return;
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? smtpUser,
      to: `"${nome}" <${para}>`,
      subject: assunto,
      text: corpo,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${corpo}</pre>`,
    });
  }

  /**
   * Envia mensagem WhatsApp via API configurada (ex.: Evolution API, Z-API, WPPConnect).
   * Variáveis necessárias no .env:
   *   WHATSAPP_API_URL   — ex.: https://api.evolution.io/message/sendText/INSTANCE
   *   WHATSAPP_API_KEY   — bearer token da API
   */
  private async enviarWhatsapp(telefone: string, texto: string): Promise<void> {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const apiKey = process.env.WHATSAPP_API_KEY;

    if (!apiUrl || !apiKey) {
      this.logger.debug('[B-009] WHATSAPP_API_URL/KEY não configurados — mensagem ignorada');
      return;
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ number: telefone, text: texto }),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp API respondeu ${response.status}`);
    }
  }

  /** Formata Date para pt-BR: "seg, 22 de mar. de 2026" */
  private formatarData(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo',
    });
  }

  /** Formata Date para pt-BR: "14:30" */
  private formatarHora(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  }

  /**
   * Normaliza telefone para formato E.164 com DDI Brasil.
   * Ex.: "(11) 91234-5678" → "5511912345678"
   */
  private normalizarTelefone(tel: string): string | null {
    const digits = tel.replace(/\D/g, '');
    if (digits.length === 11) return `55${digits}`; // celular BR sem DDI
    if (digits.length === 13 && digits.startsWith('55')) return digits; // já com DDI
    if (digits.length >= 10) return `55${digits}`;
    return null;
  }
}
