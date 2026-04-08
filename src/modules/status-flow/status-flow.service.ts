/**
 * ════════════════════════════════════════════════════════════════
 * JURYSONE — StatusFlowService
 * Máquina de estados para transições automáticas de status
 *
 * Fluxo do Atendimento:
 *   novo → atendendo → aguardando_assinatura → assinado
 *        → iniciando → ativo → encerrado
 *
 * Fluxo do Processo:
 *   atendendo → aguardando_assinatura → contrato_assinado
 *            → em_andamento → finalizado
 *
 * Fluxo Financeiro:
 *   a_efetuar → cadastrado → pago | pago_em_atraso | cancelado
 * ════════════════════════════════════════════════════════════════
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

// ─── Status constants ────────────────────────────────────────────
export const ATENDIMENTO_STATUSES = {
  ATENDENDO:             'atendendo',
  AGUARDANDO_ASSINATURA: 'aguardando_assinatura',
  ASSINADO:              'assinado',
  INICIANDO:             'iniciando',
  ATIVO:                 'ativo',
  ENCERRADO:             'encerrado',
} as const;

export const PROCESSO_STATUSES = {
  ATENDENDO:         'atendendo',
  AG_ASSINATURA:     'aguardando_assinatura',
  CONTRATO_ASSINADO: 'contrato_assinado',
  EM_ANDAMENTO:      'em_andamento',
  FINALIZADO:        'finalizado',
} as const;

export const FINANCEIRO_STATUSES = {
  A_EFETUAR:      'a_efetuar',
  CADASTRADO:     'cadastrado',
  PAGO:           'pago',
  PAGO_EM_ATRASO: 'pago_em_atraso',
  CANCELADO:      'cancelado',
} as const;

// ─── Valid transitions map ───────────────────────────────────────
const VALID_ATENDIMENTO_TRANSITIONS: Record<string, string[]> = {
  atendendo:             ['aguardando_assinatura', 'encerrado'],
  aguardando_assinatura: ['assinado', 'encerrado'],
  assinado:              ['iniciando', 'encerrado'],
  iniciando:             ['ativo', 'encerrado'],
  ativo:                 ['encerrado'],
  encerrado:             [],
};

export type EsignEventType = 'enviado' | 'visualizado' | 'assinado' | 'rejeitado' | 'expirado';
export type PaymentEventType = 'confirmed' | 'overdue' | 'cancelled' | 'refunded';

@Injectable()
export class StatusFlowService {
  private readonly logger = new Logger(StatusFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsGateway,
  ) {}

  // ════════════════════════════════════════════════════════════
  // PASSO 5 — Processar evento de E-Sign
  // Chamado pelo webhook do provedor de assinatura
  // ════════════════════════════════════════════════════════════
  async processEsignEvent(
    envelopeExternalId: string,
    event: EsignEventType,
    metadata: Record<string, any> = {},
  ) {
    this.logger.log(`E-Sign event: ${event} for envelope ${envelopeExternalId}`);

    // 1. Find envelope in DB
    const envelope = await this.prisma.esignEnvelope.findFirst({
      where: { externalId: envelopeExternalId },
      include: {} as any,
    });

    if (!envelope) {
      this.logger.warn(`Envelope not found: ${envelopeExternalId}`);
      return { ok: false, error: 'Envelope não encontrado' };
    }

    // 2. Update envelope status
    const envelopeStatusMap: Record<EsignEventType, string> = {
      enviado:     'enviado',
      visualizado: 'visualizado',
      assinado:    'assinado',
      rejeitado:   'rejeitado',
      expirado:    'expirado',
    };

    await this.prisma.esignEnvelope.update({
      where: { id: envelope.id },
      data: {
        status: envelopeStatusMap[event],
        assinadoEm: event === 'assinado' ? new Date() : undefined,
      },
    });

    // 3. Log webhook event
    await this.logStatusHistory({
      entidade: 'esign_envelope',
      entidadeId: envelope.id,
      statusAnterior: envelope.status,
      statusNovo: envelopeStatusMap[event],
      origem: 'webhook_esign',
      metadata,
    });

    // 4. Trigger status transitions based on esign event
    if (event === 'assinado') {
      await this.onDocumentSigned((envelope as any).processoId, metadata);
    } else if (event === 'rejeitado') {
      await this.onDocumentRejected((envelope as any).processoId, metadata);
    } else if (event === 'expirado') {
      await this.onDocumentExpired((envelope as any).processoId, metadata);
    }

    return { ok: true, event, envelopeId: envelope.id };
  }

  // ════════════════════════════════════════════════════════════
  // Triggered when document is signed
  // ════════════════════════════════════════════════════════════
  private async onDocumentSigned(processoId: string, metadata: any) {
    // 1. Find the atendimento for this processo
    const atendimento = await this.prisma.atendimento.findFirst({
      where: { processoId },
      include: { cliente: true, processo: true },
    });

    if (!atendimento) return;

    // 2. atendimento: aguardando_assinatura → assinado
    await this.transitionAtendimentoStatus(
      atendimento.id,
      ATENDIMENTO_STATUSES.ASSINADO,
      'webhook_esign',
      metadata,
    );

    // 3. processo: aguardando_assinatura → contrato_assinado
    await this.prisma.processo.update({
      where: { id: processoId },
      data: { status: PROCESSO_STATUSES.CONTRATO_ASSINADO as any },
    });

    // 4. After a delay, automatically move to "iniciando" → "ativo"
    // In production: use a scheduled job (Bull queue)
    setTimeout(async () => {
      await this.transitionAtendimentoStatus(
        atendimento.id,
        ATENDIMENTO_STATUSES.INICIANDO,
        'sistema',
        { auto: true },
      );

      setTimeout(async () => {
        await this.transitionAtendimentoStatus(
          atendimento.id,
          ATENDIMENTO_STATUSES.ATIVO,
          'sistema',
          { auto: true },
        );

        await this.prisma.processo.update({
          where: { id: processoId },
          data: { status: PROCESSO_STATUSES.EM_ANDAMENTO as any },
        });

        // Notify via WebSocket
        this.notifications.sendToOffice(atendimento.escritorioId, 'atendimento_ativo', {
          atendimentoId: atendimento.id,
          clienteNome: atendimento.cliente?.nome,
          area: atendimento.area,
        });
      }, 3000); // 3 seconds in demo (should be hours in production)
    }, 2000); // 2 seconds in demo

    // 5. Update financeiro: a_efetuar → cadastrado (payment link now active)
    await this.prisma.lancamentoFinanceiro.updateMany({
      where: { atendimentoId: atendimento.id, status: FINANCEIRO_STATUSES.A_EFETUAR },
      data: { status: FINANCEIRO_STATUSES.CADASTRADO },
    });

    // 6. Notify office
    this.notifications.sendToOffice(atendimento.escritorioId, 'documento_assinado', {
      atendimentoId: atendimento.id,
      clienteNome: atendimento.cliente?.nome,
      message: `✅ ${atendimento.cliente?.nome} assinou os documentos!`,
    });

    // 7. Create internal notification
    await this.createInternalNotification(
      atendimento.escritorioId,
      '✅ Documentos Assinados',
      `${atendimento.cliente?.nome} assinou todos os documentos. Atendimento jurídico iniciado.`,
      'success',
      atendimento.id,
    );
  }

  // ════════════════════════════════════════════════════════════
  // Triggered when document is rejected
  // ════════════════════════════════════════════════════════════
  private async onDocumentRejected(processoId: string, metadata: any) {
    const atendimento = await this.prisma.atendimento.findFirst({
      where: { processoId },
      include: { cliente: true },
    });
    if (!atendimento) return;

    await this.createInternalNotification(
      atendimento.escritorioId,
      '⚠️ Assinatura Rejeitada',
      `${atendimento.cliente?.nome} rejeitou a assinatura. Motivo: ${metadata.motivo || 'Não informado'}`,
      'warning',
      atendimento.id,
    );
  }

  // ════════════════════════════════════════════════════════════
  // Triggered when document expires
  // ════════════════════════════════════════════════════════════
  private async onDocumentExpired(processoId: string, metadata: any) {
    const atendimento = await this.prisma.atendimento.findFirst({
      where: { processoId },
      include: { cliente: true },
    });
    if (!atendimento) return;

    await this.createInternalNotification(
      atendimento.escritorioId,
      '⏰ Envelope Expirado',
      `O prazo para assinatura de ${atendimento.cliente?.nome} expirou.`,
      'error',
      atendimento.id,
    );
  }

  // ════════════════════════════════════════════════════════════
  // PASSO 7 — Processar evento de Pagamento
  // Chamado pelo webhook do provedor de cobrança (Asaas, Stripe, etc.)
  // ════════════════════════════════════════════════════════════
  async processPaymentEvent(
    externalPaymentId: string,
    event: PaymentEventType,
    metadata: Record<string, any> = {},
  ) {
    this.logger.log(`Payment event: ${event} for payment ${externalPaymentId}`);

    // 1. Find lancamento by external ID
    const lancamento = await this.prisma.lancamentoFinanceiro.findFirst({
      where: { externalPaymentId },
      include: { cliente: true, atendimento: true },
    });

    if (!lancamento) {
      this.logger.warn(`Lancamento not found: ${externalPaymentId}`);
      return { ok: false, error: 'Lançamento não encontrado' };
    }

    const statusAnterior = lancamento.status;
    let statusNovo: string;
    let paidAt: Date | null = null;

    // 2. Map payment event to financial status
    switch (event) {
      case 'confirmed':
        const hoje = new Date();
        const vencimento = lancamento.vencimento;
        if (vencimento && hoje > vencimento) {
          statusNovo = FINANCEIRO_STATUSES.PAGO_EM_ATRASO;
        } else {
          statusNovo = FINANCEIRO_STATUSES.PAGO;
        }
        paidAt = new Date();
        break;
      case 'overdue':
        statusNovo = FINANCEIRO_STATUSES.PAGO_EM_ATRASO;
        break;
      case 'cancelled':
      case 'refunded':
        statusNovo = FINANCEIRO_STATUSES.CANCELADO;
        break;
      default:
        return { ok: false, error: `Evento desconhecido: ${event}` };
    }

    // 3. Update lancamento status
    await this.prisma.lancamentoFinanceiro.update({
      where: { id: lancamento.id },
      data: {
        status: statusNovo,
        paidAt,
        cancelledAt: event === 'cancelled' ? new Date() : undefined,
      },
    });

    // 4. Log status history
    await this.logStatusHistory({
      entidade: 'lancamento_financeiro',
      entidadeId: lancamento.id,
      statusAnterior,
      statusNovo,
      origem: 'webhook_pagamento',
      metadata,
    });

    // 5. Notify office
    if (event === 'confirmed') {
      const valor = lancamento.valor.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      this.notifications.sendToOffice(lancamento.escritorioId, 'pagamento_confirmado', {
        lancamentoId: lancamento.id,
        clienteNome: lancamento.cliente?.nome,
        valor,
        message: `💰 Pagamento de ${valor} confirmado — ${lancamento.cliente?.nome}`,
      });

      await this.createInternalNotification(
        lancamento.escritorioId,
        '💰 Pagamento Confirmado',
        `${lancamento.descricao} — ${valor} — Cliente: ${lancamento.cliente?.nome}`,
        'success',
        lancamento.atendimentoId,
      );
    }

    return { ok: true, event, lancamentoId: lancamento.id, statusNovo };
  }

  // ════════════════════════════════════════════════════════════
  // Transição de status do atendimento (com validação)
  // ════════════════════════════════════════════════════════════
  async transitionAtendimentoStatus(
    atendimentoId: string,
    newStatus: string,
    origem: string,
    metadata: any = {},
  ) {
    const atendimento = await this.prisma.atendimento.findUnique({
      where: { id: atendimentoId },
    });

    if (!atendimento) {
      throw new Error(`Atendimento ${atendimentoId} não encontrado`);
    }

    const statusAtual = atendimento.status;
    const transicoesValidas = VALID_ATENDIMENTO_TRANSITIONS[statusAtual] || [];

    if (!transicoesValidas.includes(newStatus)) {
      this.logger.warn(
        `Transição inválida: ${statusAtual} → ${newStatus} para atendimento ${atendimentoId}`,
      );
      return { ok: false, error: `Transição ${statusAtual} → ${newStatus} não permitida` };
    }

    // Update atendimento status
    await this.prisma.atendimento.update({
      where: { id: atendimentoId },
      data: { status: newStatus },
    });

    // Log status history
    await this.logStatusHistory({
      entidade: 'atendimento',
      entidadeId: atendimentoId,
      statusAnterior: statusAtual,
      statusNovo: newStatus,
      origem,
      metadata,
    });

    this.logger.log(`Atendimento ${atendimentoId}: ${statusAtual} → ${newStatus}`);

    return { ok: true, statusAnterior: statusAtual, statusNovo: newStatus };
  }

  // ════════════════════════════════════════════════════════════
  // Verificar lançamentos vencidos e marcar como pago_em_atraso
  // Chamado por job agendado (CronService)
  // ════════════════════════════════════════════════════════════
  async verificarLancamentosVencidos() {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const vencidos = await this.prisma.lancamentoFinanceiro.findMany({
      where: {
        status: FINANCEIRO_STATUSES.CADASTRADO,
        vencimento: { lt: hoje },
      },
      include: { cliente: true },
    });

    this.logger.log(`Verificando vencidos: ${vencidos.length} lançamentos`);

    for (const lancamento of vencidos) {
      await this.prisma.lancamentoFinanceiro.update({
        where: { id: lancamento.id },
        data: { status: FINANCEIRO_STATUSES.PAGO_EM_ATRASO },
      });

      await this.logStatusHistory({
        entidade: 'lancamento_financeiro',
        entidadeId: lancamento.id,
        statusAnterior: FINANCEIRO_STATUSES.CADASTRADO,
        statusNovo: FINANCEIRO_STATUSES.PAGO_EM_ATRASO,
        origem: 'cron_vencimento',
        metadata: { vencimento: lancamento.vencimento },
      });

      // Notify
      if (lancamento.escritorioId) {
        await this.createInternalNotification(
          lancamento.escritorioId,
          '⚠️ Pagamento em Atraso',
          `Honorários de ${lancamento.cliente?.nome} estão em atraso desde ${lancamento.vencimento?.toLocaleDateString('pt-BR')}.`,
          'warning',
          lancamento.atendimentoId,
        );
      }
    }

    return { processados: vencidos.length };
  }

  // ════════════════════════════════════════════════════════════
  // PASSO 6 — Criar pasta e CRM record do cliente
  // ════════════════════════════════════════════════════════════
  async criarPastaCliente(clienteId: string, atendimentoId: string) {
    const pasta = await this.prisma.pastaCliente.create({
      data: {
        clienteId,
        atendimentoId,
        nome: `Atendimento ${new Date().toLocaleDateString('pt-BR')}`,
        status: 'ativa',
      },
    });

    return pasta;
  }

  async criarRegistroCRM(
    escritorioId: string,
    clienteId: string,
    atendimentoId: string,
    area: string,
    tipoAcao: string,
  ) {
    const crmRecord = await this.prisma.crmRecord.create({
      data: {
        escritorioId,
        clienteId,
        atendimentoId,
        tipo: 'atendimento',
        titulo: `Novo atendimento — ${area}`,
        descricao: `${tipoAcao}`,
        status: 'ativo',
        etapa: 'novo',
      },
    });

    return crmRecord;
  }

  // ════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════
  private async logStatusHistory(data: {
    entidade: string;
    entidadeId: string;
    statusAnterior: string;
    statusNovo: string;
    origem: string;
    metadata?: any;
  }) {
    return this.prisma.statusHistory.create({
      data: {
        entidade: data.entidade,
        entidadeId: data.entidadeId,
        statusAnterior: data.statusAnterior,
        statusNovo: data.statusNovo,
        origem: data.origem,
        metadata: data.metadata || {},
        timestamp: new Date(),
      },
    });
  }

  async getStatusHistory(entidade: string, entidadeId: string) {
    return this.prisma.statusHistory.findMany({
      where: { entidade, entidadeId },
      orderBy: { timestamp: 'asc' },
    });
  }

  private async createInternalNotification(
    escritorioId: string,
    titulo: string,
    mensagem: string,
    tipo: 'success' | 'warning' | 'error' | 'info',
    atendimentoId?: string,
  ) {
    return this.prisma.notificacao.create({
      data: {
        escritorioId,
        usuarioId: escritorioId, // fallback: notificação de sistema
        titulo,
        mensagem,
        tipo,
        atendimentoId,
        lida: false,
      },
    });
  }
}
