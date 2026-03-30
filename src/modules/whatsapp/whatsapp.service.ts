import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class WhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  getConfig(officeId: string) {
    return { message: 'WhatsApp config', officeId };
  }

  updateConfig(officeId: string, config: any) {
    return { message: 'WhatsApp config updated', officeId, config };
  }

  sendMessage(body: any, officeId: string) {
    return { message: 'WhatsApp message sent', body, officeId };
  }

  getMessages(query: any, officeId: string) {
    return { message: 'WhatsApp messages', officeId, query };
  }

  getConversations(query: any, officeId: string) {
    return { message: 'WhatsApp conversations', officeId, query };
  }

  webhook(body: any) {
    return { message: 'WhatsApp webhook received', body };
  }

  connect(body: any, officeId: string) {
    return { message: 'WhatsApp connected', body, officeId };
  }

  disconnect(officeId: string) {
    return { message: 'WhatsApp disconnected', officeId };
  }

  getStatus(officeId: string) {
    return { message: 'WhatsApp status', officeId };
  }

  enviarMensagem(user: any, dto: any) {
    return { message: 'Mensagem enviada', user, dto };
  }

  enviarLote(user: any, dto: any) {
    return { message: 'Lote enviado', user, dto };
  }

  getHistorico(officeId: string, query: any) {
    return { data: [], officeId, query };
  }

  listTemplates(officeId: string) {
    return { data: [], officeId };
  }

  createTemplate(officeId: string, dto: any) {
    return { message: 'Template created', officeId, dto };
  }

  deleteTemplate(officeId: string, id: string) {
    return { message: 'Template deleted', officeId, id };
  }

  listAutomacoes(officeId: string) {
    return { data: [], officeId };
  }

  createAutomacao(officeId: string, dto: any) {
    return { message: 'Automacao created', officeId, dto };
  }

  updateAutomacao(officeId: string, id: string, dto: any) {
    return { message: 'Automacao updated', officeId, id, dto };
  }

  toggleAutomacao(officeId: string, id: string) {
    return { message: 'Automacao toggled', officeId, id };
  }

  getChatbotConfig(officeId: string) {
    return { config: {}, officeId };
  }

  updateChatbotConfig(officeId: string, dto: any) {
    return { message: 'Chatbot config updated', officeId, dto };
  }

  processarWebhook(payload: any) {
    return { message: 'Webhook processed', payload };
  }

  verificarWebhook(query: any) {
    return { verified: true, query };
  }

  getStats(officeId: string, query: any) {
    return { data: {}, officeId, query };
  }
}
