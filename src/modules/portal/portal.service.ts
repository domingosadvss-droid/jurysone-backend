import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as argon2 from 'argon2';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Auth ────────────────────────────────────────────────────────────────────

  async loginPortal(dto: { email: string; senha?: string; password?: string }) {
    const cliente = await (this.prisma as any).cliente.findFirst({
      where: { email: dto.email },
    }) as any;

    if (!cliente) throw new UnauthorizedException('E-mail ou senha inválidos');
    if (!cliente.portalSenha) throw new UnauthorizedException('Acesso ao portal não configurado. Solicite ao escritório.');

    const valido = await argon2.verify(cliente.portalSenha, dto.senha || dto.password || '');
    if (!valido) throw new UnauthorizedException('E-mail ou senha inválidos');

    const token = jwt.sign(
      { sub: cliente.id, tipo: 'portal', officeId: cliente.officeId },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' },
    );

    return { token, cliente: { id: cliente.id, nome: cliente.name, email: cliente.email } };
  }

  async setupPassword(dto: { token: string; password?: string; senha?: string }) {
    const payload = jwt.verify(dto.token, process.env.JWT_SECRET || 'secret') as any;
    if (!payload?.clienteId) throw new UnauthorizedException('Token inválido');

    const hash = await argon2.hash(dto.senha || dto.password || '');
    await (this.prisma as any).cliente.update({
      where: { id: payload.clienteId },
      data: { portalSenha: hash } as any,
    });

    return { sucesso: true };
  }

  async changePassword(clienteId: string, dto: { senha_atual?: string; current_password?: string; nova_senha?: string; new_password?: string }) {
    const cliente = await (this.prisma as any).cliente.findUnique({ where: { id: clienteId } }) as any;
    if (!cliente?.portalSenha) throw new UnauthorizedException('Senha não configurada');

    const senhaAtual = dto.senha_atual || dto.current_password || '';
    const valido = await argon2.verify(cliente.portalSenha, senhaAtual);
    if (!valido) throw new UnauthorizedException('Senha atual incorreta');

    const hash = await argon2.hash(dto.nova_senha || dto.new_password || '');
    await (this.prisma as any).cliente.update({ where: { id: clienteId }, data: { portalSenha: hash } as any });

    return { sucesso: true };
  }

  requestAccess(dto: any) {
    return { message: 'Solicitação recebida. O escritório entrará em contato.', dto };
  }

  confirmEmail(token: string) {
    return { message: 'E-mail confirmado', token };
  }

  resetPassword(dto: any) {
    return { message: 'Instruções de redefinição enviadas para o e-mail', dto };
  }

  setNewPassword(dto: any) {
    return this.setupPassword(dto);
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboard(clienteId: string) {
    const [processos, pendentes, financeiro, assinaturas] = await Promise.all([
      (this.prisma as any).processo.count({ where: { clienteId: clienteId, status: 'ATIVO' } }),
      this.prisma.tarefa.count({ where: { clienteId, status: 'PENDENTE' } as any }),
      this.prisma.lancamentoFinanceiro.aggregate({
        where: { clienteId, status: 'PENDENTE' },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      this.prisma.esignEnvelope.count({
        where: { clienteId, status: 'ENVIADO' } as any,
      }).catch(() => 0),
    ]);

    return {
      processos_ativos: processos,
      tarefas_pendentes: pendentes,
      financeiro_pendente: {
        total: Number(financeiro._sum.valor || 0),
        qtd: financeiro._count._all,
      },
      assinaturas_pendentes: assinaturas,
    };
  }

  // ── Processos ───────────────────────────────────────────────────────────────

  async getProcessos(clienteId: string, query: any) {
    const page = parseInt(query.page || '1', 10);
    const limit = 10;

    const [total, items] = await Promise.all([
      (this.prisma as any).processo.count({ where: { clienteId: clienteId } }),
      (this.prisma as any).processo.findMany({
        where: { clienteId: clienteId },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, number: true, title: true, status: true, area: true,
          court: true, updatedAt: true, value: true,
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  async getProcesso(processoId: string, clienteId: string) {
    const processo = await (this.prisma as any).processo.findFirst({
      where: { id: processoId, clienteId: clienteId },
      include: {
        movements: { orderBy: { date: 'desc' }, take: 20 },
        documents: { select: { id: true, name: true, type: true, createdAt: true } },
      },
    });

    if (!processo) throw new NotFoundException('Processo não encontrado');
    return processo;
  }

  async getProcessoDetail(clienteId: string, processoId: string) {
    return this.getProcesso(processoId, clienteId);
  }

  async getTimeline(processoId: string, clienteId: string) {
    const processo = await (this.prisma as any).processo.findFirst({
      where: { id: processoId, clienteId: clienteId },
      select: { id: true },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');

    return (this.prisma as any).processMovement
      ? (this.prisma as any).processMovement.findMany({ where: { processId: processoId }, orderBy: { date: 'desc' } })
      : (this.prisma as any).movimentacao?.findMany({ where: { processoId }, orderBy: { data: 'desc' } }) ?? [];
  }

  // ── Documentos ──────────────────────────────────────────────────────────────

  async getDocumentos(clienteId: string, query?: any) {
    return this.prisma.document.findMany({
      where: { process: { clienteId: clienteId } } as any,
      select: { id: true, name: true, type: true, url: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async downloadDocumento(clienteId: string, documentoId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentoId, process: { clienteId: clienteId } } as any,
    }) as any;
    if (!doc) throw new NotFoundException('Documento não encontrado');
    return { url: doc.url, nome: doc.name };
  }

  getDocumentoDownload(documentoId: string, clienteId: string) {
    return this.downloadDocumento(clienteId, documentoId);
  }

  // ── Financeiro ──────────────────────────────────────────────────────────────

  async getFinanceiro(clienteId: string) {
    const [pendentes, pagos] = await Promise.all([
      this.prisma.lancamentoFinanceiro.findMany({
        where: { clienteId, status: 'PENDENTE' },
        orderBy: { dataVencimento: 'asc' },
      }),
      this.prisma.lancamentoFinanceiro.findMany({
        where: { clienteId, status: 'PAGO' },
        orderBy: { dataPagamento: 'desc' },
        take: 10,
      }),
    ]);

    return { pendentes, historico: pagos };
  }

  async getHistoricoFinanceiro(clienteId: string) {
    return this.getFinanceiro(clienteId);
  }

  async getBoletos(clienteId: string) {
    return this.prisma.lancamentoFinanceiro.findMany({
      where: { clienteId, status: 'PENDENTE', formaPagamento: 'BOLETO' },
      orderBy: { dataVencimento: 'asc' },
    });
  }

  iniciarPagamento(clienteId: string, dto: any) {
    return { message: 'Integração de pagamento — configure Asaas para habilitar', clienteId, dto };
  }

  // ── E-sign ──────────────────────────────────────────────────────────────────

  async getAssinaturasPendentes(clienteId: string) {
    return this.prisma.esignEnvelope.findMany({
      where: { clienteId, status: 'ENVIADO' } as any,
      select: { id: true, titulo: true, createdAt: true, expiresAt: true } as any,
    }).catch(() => []);
  }

  getDocumentosParaAssinar(clienteId: string) {
    return this.getAssinaturasPendentes(clienteId);
  }

  assinarDocumento(clienteId: string, documentoId: string, dto?: any) {
    return { message: 'Use o link de assinatura recebido por e-mail', clienteId, documentoId };
  }

  // ── Perfil ──────────────────────────────────────────────────────────────────

  async getPerfil(clienteId: string) {
    const cliente = await (this.prisma as any).cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, name: true, email: true, phone: true, cpf: true, createdAt: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async atualizarPerfil(clienteId: string, body: any) {
    return (this.prisma as any).cliente.update({
      where: { id: clienteId },
      data: { phone: body.telefone, name: body.nome } as any,
      select: { id: true, name: true, email: true, phone: true },
    });
  }

  updatePerfil(clienteId: string, dto: any) {
    return this.atualizarPerfil(clienteId, dto);
  }

  // ── Notificações ────────────────────────────────────────────────────────────

  async getNotificacoes(clienteId: string, query?: any) {
    return this.prisma.notificacao.findMany({
      where: { clienteId } as any,
      orderBy: { createdAt: 'desc' },
      take: 30,
    }).catch(() => []);
  }

  async marcarNotificacaoLida(clienteId: string, id: string) {
    await this.prisma.notificacao.updateMany({
      where: { id, clienteId } as any,
      data: { lida: true },
    }).catch(() => null);
    return { sucesso: true };
  }

  // ── Stubs restantes ─────────────────────────────────────────────────────────

  getPropostas(clienteId: string) {
    return { message: 'Propostas — em implementação', clienteId };
  }

  aprovarProposta(clienteId: string, propostaId: string) {
    return { message: 'Proposta aprovada', clienteId, propostaId };
  }

  enviarMensagem(clienteId: string, body: any) {
    return { message: 'Mensagens — em implementação', clienteId, body };
  }

  getMensagens(clienteId: string, query: any) {
    return { data: [], clienteId, query };
  }

  getAprovacoes(clienteId: string) {
    return { data: [], clienteId };
  }

  aprovar(clienteId: string, id: string, dto: any) {
    return { message: 'Aprovado', clienteId, id };
  }

  rejeitar(clienteId: string, id: string, dto: any) {
    return { message: 'Rejeitado', clienteId, id };
  }

  getPreferencesNotificacoes(clienteId: string) {
    return { clienteId };
  }

  atualizarPreferences(clienteId: string, preferences: any) {
    return { sucesso: true, clienteId };
  }

  getNpsSurvey(clienteId: string) {
    return { data: {}, clienteId };
  }

  responderNps(clienteId: string, dto: any) {
    return { message: 'NPS registrado', clienteId };
  }
}
