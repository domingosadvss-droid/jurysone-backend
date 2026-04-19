/**
 * JURYSONE — WhatsApp Service
 *
 * Integração genérica via HTTP POST com Bearer token.
 * Compatível com: Evolution API, Z-API, WPPConnect.
 *
 * Env vars necessárias:
 *   WHATSAPP_API_URL   — URL completa do endpoint de envio
 *                        Ex Evolution API: https://api.evolution.io/message/sendText/INSTANCIA
 *                        Ex Z-API:         https://api.z-api.io/instances/ID/token/TOKEN/send-text
 *   WHATSAPP_API_KEY   — Bearer token / API key
 *   WHATSAPP_VERIFY_TOKEN — Token para verificação de webhook (opcional)
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Configurações ────────────────────────────────────────────────────────

  getConfig(officeId: string) {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const configured = !!(apiUrl && process.env.WHATSAPP_API_KEY);
    return {
      configured,
      api_url: apiUrl ? apiUrl.replace(/\/[^/]+$/, '/***') : null, // mascara instância
      status: configured ? 'connected' : 'not_configured',
      message: configured
        ? 'WhatsApp API configurada via variáveis de ambiente'
        : 'Configure WHATSAPP_API_URL e WHATSAPP_API_KEY no Render',
    };
  }

  updateConfig(_officeId: string, _config: any) {
    return {
      message:
        'As credenciais do WhatsApp são configuradas via variáveis de ambiente no Render. ' +
        'Acesse o dashboard do Render e configure WHATSAPP_API_URL e WHATSAPP_API_KEY.',
    };
  }

  // ─── Envio de Mensagens ───────────────────────────────────────────────────

  async enviarMensagem(
    user: { id: string; officeId: string },
    dto: {
      telefone: string;
      mensagem?: string;
      template_id?: string;
      template_variaveis?: Record<string, string>;
      cliente_id?: string;
      processo_id?: string;
      tipo: 'texto' | 'documento' | 'template';
      arquivo_url?: string;
    },
  ) {
    const telefone = this.normalizarTelefone(dto.telefone);
    if (!telefone) {
      throw new BadRequestException(`Telefone inválido: ${dto.telefone}`);
    }

    let conteudo = dto.mensagem ?? '';

    // Se for template, busca o corpo e aplica variáveis
    if (dto.tipo === 'template' && dto.template_id) {
      const tpl = await this.prisma.whatsappTemplate.findFirst({
        where: { id: dto.template_id, escritorioId: user.officeId },
      });
      if (!tpl) throw new NotFoundException('Template não encontrado');

      conteudo = tpl.corpo;
      if (dto.template_variaveis) {
        for (const [chave, valor] of Object.entries(dto.template_variaveis)) {
          conteudo = conteudo.replaceAll(`{{${chave}}}`, valor);
        }
      }
    }

    // Salva mensagem como pendente
    const mensagem = await this.prisma.whatsappMessage.create({
      data: {
        telefone,
        tipo: dto.tipo,
        conteudo,
        templateId: dto.template_id ?? null,
        variaveis: (dto.template_variaveis as any) ?? null,
        status: 'pendente',
        escritorioId: user.officeId,
        enviadoPorId: user.id,
        clienteId: dto.cliente_id ?? null,
        processoId: dto.processo_id ?? null,
      },
    });

    // Envia via API
    try {
      const msgId = await this.chamarApiWhatsapp(telefone, conteudo, dto.arquivo_url);
      await this.prisma.whatsappMessage.update({
        where: { id: mensagem.id },
        data: { status: 'enviada', enviadoEm: new Date(), whatsappMsgId: msgId ?? null },
      });
      return { id: mensagem.id, status: 'enviada', telefone };
    } catch (err: any) {
      await this.prisma.whatsappMessage.update({
        where: { id: mensagem.id },
        data: { status: 'erro', erroMensagem: err.message },
      });
      throw err;
    }
  }

  async enviarLote(
    user: { id: string; officeId: string },
    dto: {
      destinatarios: Array<{ telefone: string; variaveis?: Record<string, string> }>;
      template_id: string;
      agendamento?: string;
      processo_id?: string;
    },
  ) {
    const tpl = await this.prisma.whatsappTemplate.findFirst({
      where: { id: dto.template_id, escritorioId: user.officeId },
    });
    if (!tpl) throw new NotFoundException('Template não encontrado');

    const resultados: Array<{ telefone: string; status: string; erro?: string }> = [];

    for (const dest of dto.destinatarios) {
      try {
        await this.enviarMensagem(user, {
          telefone: dest.telefone,
          tipo: 'template',
          template_id: dto.template_id,
          template_variaveis: dest.variaveis,
          processo_id: dto.processo_id,
        });
        resultados.push({ telefone: dest.telefone, status: 'enviada' });
      } catch (err: any) {
        resultados.push({ telefone: dest.telefone, status: 'erro', erro: err.message });
      }
    }

    const enviadas = resultados.filter(r => r.status === 'enviada').length;
    const erros = resultados.filter(r => r.status === 'erro').length;

    return { total: dto.destinatarios.length, enviadas, erros, resultados };
  }

  // ─── Histórico ────────────────────────────────────────────────────────────

  async getHistorico(
    officeId: string,
    query: {
      cliente_id?: string;
      processo_id?: string;
      status?: string;
      page?: string;
    },
  ): Promise<any> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = 20;

    const where: any = { escritorioId: officeId };
    if (query.cliente_id) where.clienteId = query.cliente_id;
    if (query.processo_id) where.processoId = query.processo_id;
    if (query.status) where.status = query.status;

    const [total, data] = await Promise.all([
      this.prisma.whatsappMessage.count({ where }),
      this.prisma.whatsappMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          cliente: { select: { nome: true } },
          processo: { select: { numero: true } },
          enviadoPor: { select: { nome: true } },
        },
      }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  // ─── Templates ───────────────────────────────────────────────────────────

  async listTemplates(officeId: string): Promise<any> {
    const data = await this.prisma.whatsappTemplate.findMany({
      where: { escritorioId: officeId },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  }

  async createTemplate(
    officeId: string,
    dto: {
      nome: string;
      categoria: string;
      idioma?: string;
      corpo: string;
      variaveis?: string[];
      botoes?: any[];
    },
  ): Promise<any> {
    const template = await this.prisma.whatsappTemplate.create({
      data: {
        nome: dto.nome,
        categoria: dto.categoria,
        idioma: dto.idioma ?? 'pt_BR',
        corpo: dto.corpo,
        variaveis: (dto.variaveis as any) ?? null,
        botoes: (dto.botoes as any) ?? null,
        escritorioId: officeId,
      },
    });
    return template;
  }

  async deleteTemplate(officeId: string, id: string) {
    const tpl = await this.prisma.whatsappTemplate.findFirst({
      where: { id, escritorioId: officeId },
    });
    if (!tpl) throw new NotFoundException('Template não encontrado');
    await this.prisma.whatsappTemplate.delete({ where: { id } });
  }

  // ─── Automações ───────────────────────────────────────────────────────────

  async listAutomacoes(officeId: string): Promise<any> {
    const data = await this.prisma.whatsappAutomation.findMany({
      where: { escritorioId: officeId },
      orderBy: { createdAt: 'desc' },
    });
    return { data };
  }

  async createAutomacao(
    officeId: string,
    dto: {
      nome: string;
      ativa?: boolean;
      gatilho: string;
      template_id?: string;
      atraso_minutos?: number;
      filtros?: Record<string, any>;
    },
  ): Promise<any> {
    return this.prisma.whatsappAutomation.create({
      data: {
        nome: dto.nome,
        ativa: dto.ativa ?? true,
        gatilho: dto.gatilho,
        templateId: dto.template_id ?? null,
        atrasoMinutos: dto.atraso_minutos ?? 0,
        filtros: (dto.filtros as any) ?? null,
        escritorioId: officeId,
      },
    });
  }

  async updateAutomacao(officeId: string, id: string, dto: any): Promise<any> {
    const existing = await this.prisma.whatsappAutomation.findFirst({
      where: { id, escritorioId: officeId },
    });
    if (!existing) throw new NotFoundException('Automação não encontrada');

    return this.prisma.whatsappAutomation.update({
      where: { id },
      data: {
        nome: dto.nome,
        ativa: dto.ativa,
        gatilho: dto.gatilho,
        templateId: dto.template_id ?? undefined,
        atrasoMinutos: dto.atraso_minutos,
        filtros: dto.filtros ?? undefined,
      },
    });
  }

  async toggleAutomacao(officeId: string, id: string): Promise<any> {
    const existing = await this.prisma.whatsappAutomation.findFirst({
      where: { id, escritorioId: officeId },
    });
    if (!existing) throw new NotFoundException('Automação não encontrada');

    return this.prisma.whatsappAutomation.update({
      where: { id },
      data: { ativa: !existing.ativa },
    });
  }

  // ─── Chatbot (sem modelo DB — configuração futura) ────────────────────────

  getChatbotConfig(officeId: string) {
    return {
      officeId,
      ativo: false,
      saudacao: 'Olá! Sou o assistente virtual do escritório. Como posso ajudar?',
      menu_opcoes: [
        { numero: 1, texto: 'Status do processo', acao: 'status_processo' },
        { numero: 2, texto: 'Falar com advogado', acao: 'falar_advogado' },
        { numero: 3, texto: 'Informações de pagamento', acao: 'pagamento' },
        { numero: 4, texto: 'Enviar documento', acao: 'documentos' },
      ],
      horario_atendimento: { inicio: '09:00', fim: '18:00', dias_semana: [1, 2, 3, 4, 5] },
      mensagem_fora_horario: 'Nosso horário de atendimento é de segunda a sexta, das 9h às 18h.',
      ia_habilitada: false,
      message: 'Configuração de chatbot será persistida em versão futura.',
    };
  }

  updateChatbotConfig(_officeId: string, _dto: any) {
    return { message: 'Configuração de chatbot recebida. Persistência em versão futura.' };
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  async processarWebhook(payload: any) {
    // Suporte a webhooks de status (Evolution API / Z-API / WPPConnect)
    try {
      // Evolution API: payload.data.key.id + payload.data.status
      const msgId = payload?.data?.key?.id ?? payload?.messageId ?? payload?.id;
      const status = payload?.data?.status ?? payload?.status ?? payload?.event;

      if (msgId && status) {
        const statusMap: Record<string, string> = {
          DELIVERY_ACK: 'entregue',
          READ: 'lida',
          PLAYED: 'lida',
          FAILED: 'erro',
          // Z-API
          received: 'entregue',
          read: 'lida',
          failed: 'erro',
          // WPPConnect
          ACK_RECEIVED: 'entregue',
          ACK_READ: 'lida',
        };
        const novoStatus = statusMap[status as string];
        if (novoStatus) {
          await this.prisma.whatsappMessage.updateMany({
            where: { whatsappMsgId: msgId },
            data: {
              status: novoStatus,
              ...(novoStatus === 'lida' ? { lidaEm: new Date() } : {}),
            },
          });
          this.logger.debug(`[WhatsApp] Webhook: msg ${msgId} → ${novoStatus}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`[WhatsApp] Erro ao processar webhook: ${err.message}`);
    }
    return { received: true };
  }

  verificarWebhook(query: { 'hub.verify_token'?: string; 'hub.challenge'?: string }) {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? 'jurysone-webhook';
    if (query['hub.verify_token'] === verifyToken) {
      return query['hub.challenge'];
    }
    return { verified: true }; // Evolution API / outros não usam challenge
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  async getStats(officeId: string, query: { periodo?: string }) {
    const dias = query.periodo === '7d' ? 7 : query.periodo === '90d' ? 90 : 30;
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const [total, enviadas, entregues, lidas, erros, automacoes] = await Promise.all([
      this.prisma.whatsappMessage.count({ where: { escritorioId: officeId, createdAt: { gte: desde } } }),
      this.prisma.whatsappMessage.count({ where: { escritorioId: officeId, status: 'enviada', createdAt: { gte: desde } } }),
      this.prisma.whatsappMessage.count({ where: { escritorioId: officeId, status: 'entregue', createdAt: { gte: desde } } }),
      this.prisma.whatsappMessage.count({ where: { escritorioId: officeId, status: 'lida', createdAt: { gte: desde } } }),
      this.prisma.whatsappMessage.count({ where: { escritorioId: officeId, status: 'erro', createdAt: { gte: desde } } }),
      this.prisma.whatsappAutomation.count({ where: { escritorioId: officeId, ativa: true } }),
    ]);

    return {
      periodo: `${dias}d`,
      total,
      enviadas,
      entregues,
      lidas,
      erros,
      taxa_entrega: total > 0 ? ((entregues + lidas) / total * 100).toFixed(1) + '%' : '0%',
      taxa_leitura: total > 0 ? (lidas / total * 100).toFixed(1) + '%' : '0%',
      automacoes_ativas: automacoes,
    };
  }

  // ─── Métodos legados (compatibilidade com chamadas internas) ──────────────

  sendMessage(body: any, officeId: string) {
    return this.enviarMensagem(
      { id: 'system', officeId },
      { telefone: body.number ?? body.phone, mensagem: body.text ?? body.message, tipo: 'texto' },
    );
  }

  getMessages(query: any, officeId: string): Promise<any> {
    return this.getHistorico(officeId, query);
  }

  getConversations(query: any, officeId: string): Promise<any> {
    return this.getHistorico(officeId, query);
  }

  getStatus(officeId: string) {
    return this.getConfig(officeId);
  }

  connect(_body: any, officeId: string) {
    return this.getConfig(officeId);
  }

  disconnect(officeId: string) {
    return this.getConfig(officeId);
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  /**
   * Chama a API de WhatsApp configurada via env.
   * Retorna o ID da mensagem retornado pela API (se disponível).
   */
  private async chamarApiWhatsapp(
    telefone: string,
    texto: string,
    arquivoUrl?: string,
  ): Promise<string | undefined> {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const apiKey = process.env.WHATSAPP_API_KEY;

    if (!apiUrl || !apiKey) {
      this.logger.debug('[WhatsApp] API não configurada — mensagem ignorada');
      return undefined;
    }

    const isMetaApi = apiUrl.includes('graph.facebook.com');

    let body: Record<string, any>;

    if (isMetaApi) {
      // ── Meta WhatsApp Cloud API ──────────────────────────────────────────
      if (arquivoUrl) {
        body = {
          messaging_product: 'whatsapp',
          to: telefone,
          type: 'document',
          document: { link: arquivoUrl, caption: texto },
        };
      } else {
        body = {
          messaging_product: 'whatsapp',
          to: telefone,
          type: 'text',
          text: { body: texto, preview_url: false },
        };
      }
    } else {
      // ── Evolution API / Z-API / WPPConnect ───────────────────────────────
      body = {
        number: telefone,
        text: texto,
        phone: telefone,
        message: texto,
      };
      if (arquivoUrl) {
        body.mediaUrl = arquivoUrl;
        body.mediaMessage = { mediaUrl: arquivoUrl, caption: texto };
      }
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(isMetaApi ? {} : { apikey: apiKey }),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => response.statusText);
      throw new Error(`WhatsApp API ${response.status}: ${err}`);
    }

    const json: any = await response.json().catch(() => ({}));
    // Meta: json.messages[0].id | Evolution: json.key?.id | Z-API: json.messageId
    return json?.messages?.[0]?.id ?? json?.key?.id ?? json?.messageId ?? json?.id ?? undefined;
  }

  /** Normaliza telefone para E.164 com DDI Brasil. */
  private normalizarTelefone(tel: string): string | null {
    const digits = tel.replace(/\D/g, '');
    if (digits.length === 11) return `55${digits}`;
    if (digits.length === 13 && digits.startsWith('55')) return digits;
    if (digits.length >= 10) return `55${digits}`;
    return null;
  }
}
