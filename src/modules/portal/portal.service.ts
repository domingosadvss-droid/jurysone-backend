import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { getPortalSecret } from './guards/portal-auth.guard';

const CONVITE_VALIDADE_DIAS = 7;

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async getPortalUser(clienteId: string) {
    const portalUser = await this.prisma.usuarioPortal.findUnique({ where: { clienteId } });
    if (!portalUser) throw new UnauthorizedException('Acesso ao portal não configurado.');
    return portalUser;
  }

  private async assertProcessoDoCliente(processoId: string, clienteId: string) {
    const processo = await this.prisma.processo.findFirst({
      where: { id: processoId, clienteId, deletedAt: null },
      select: { id: true },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
  }

  // ── Convite (chamado pelo escritório, autenticado como advogado) ────────────

  async criarConvite(clienteId: string, escritorioId: string, email?: string) {
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, escritorioId },
      select: { id: true, nome: true, email: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');

    const emailPortal = (email || cliente.email || '').trim().toLowerCase();
    if (!emailPortal) {
      throw new BadRequestException('Cliente sem e-mail cadastrado. Informe o campo "email".');
    }

    const emUso = await this.prisma.usuarioPortal.findUnique({ where: { email: emailPortal } });
    if (emUso && emUso.clienteId !== clienteId) {
      throw new ConflictException(
        'Este e-mail já está vinculado a outro acesso ao portal. Informe um e-mail diferente no campo "email".',
      );
    }

    const tokenConvite  = randomBytes(32).toString('hex');
    const tokenExpiraEm = new Date(Date.now() + CONVITE_VALIDADE_DIAS * 86_400_000);

    await this.prisma.usuarioPortal.upsert({
      where:  { clienteId },
      create: { clienteId, email: emailPortal, tokenConvite, tokenExpiraEm },
      update: { email: emailPortal, tokenConvite, tokenExpiraEm },
    });

    const base = process.env.FRONTEND_URL || '';
    return {
      cliente: cliente.nome,
      email: emailPortal,
      token: tokenConvite,
      expira_em: tokenExpiraEm,
      link: `${base}/portal/primeiro-acesso?token=${tokenConvite}`,
    };
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  async loginPortal(dto: { email: string; senha?: string; password?: string }) {
    const email = (dto?.email || '').trim().toLowerCase();
    const senha = dto?.senha || dto?.password || '';
    if (!email || !senha) throw new UnauthorizedException('E-mail ou senha inválidos');

    const portalUser = await this.prisma.usuarioPortal.findUnique({
      where: { email },
      include: { cliente: { select: { id: true, nome: true, email: true, escritorioId: true } } },
    });
    if (!portalUser?.senhaHash || !portalUser.ativo) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    const valido = await argon2.verify(portalUser.senhaHash, senha);
    if (!valido) throw new UnauthorizedException('E-mail ou senha inválidos');

    await this.prisma.usuarioPortal.update({
      where: { id: portalUser.id },
      data:  { ultimoLoginEm: new Date() },
    });

    const token = this.jwt.sign(
      {
        sub:          portalUser.id,
        id:           portalUser.clienteId,
        clienteId:    portalUser.clienteId,
        escritorioId: portalUser.cliente.escritorioId,
        userType:     'CLIENT',
        ativo:        true,
      },
      { secret: getPortalSecret(), expiresIn: '7d' },
    );

    return {
      token,
      cliente: { id: portalUser.cliente.id, nome: portalUser.cliente.nome, email: portalUser.email },
    };
  }

  async setupPassword(dto: { token: string; password?: string; senha?: string; confirm_password?: string }) {
    const senha = dto?.senha || dto?.password || '';
    if (!dto?.token) throw new BadRequestException('Token é obrigatório');
    if (senha.length < 8) throw new BadRequestException('A senha deve ter pelo menos 8 caracteres');
    if (dto.confirm_password !== undefined && dto.confirm_password !== senha) {
      throw new BadRequestException('As senhas não conferem');
    }

    const portalUser = await this.prisma.usuarioPortal.findUnique({
      where: { tokenConvite: dto.token },
    });
    if (!portalUser || !portalUser.tokenExpiraEm || portalUser.tokenExpiraEm < new Date()) {
      throw new UnauthorizedException('Convite inválido ou expirado. Solicite um novo ao escritório.');
    }

    await this.prisma.usuarioPortal.update({
      where: { id: portalUser.id },
      data: {
        senhaHash:     await argon2.hash(senha),
        ativo:         true,
        ativadoEm:     portalUser.ativadoEm ?? new Date(),
        tokenConvite:  null,
        tokenExpiraEm: null,
      },
    });

    return { sucesso: true };
  }

  async changePassword(
    clienteId: string,
    dto: { senha_atual?: string; current_password?: string; nova_senha?: string; new_password?: string },
  ) {
    const portalUser = await this.getPortalUser(clienteId);
    if (!portalUser.senhaHash) throw new UnauthorizedException('Senha não configurada');

    const valido = await argon2.verify(portalUser.senhaHash, dto.senha_atual || dto.current_password || '');
    if (!valido) throw new UnauthorizedException('Senha atual incorreta');

    const nova = dto.nova_senha || dto.new_password || '';
    if (nova.length < 8) throw new BadRequestException('A nova senha deve ter pelo menos 8 caracteres');

    await this.prisma.usuarioPortal.update({
      where: { id: portalUser.id },
      data:  { senhaHash: await argon2.hash(nova) },
    });
    return { sucesso: true };
  }

  requestAccess(dto: any) {
    return { message: 'Solicitação recebida. O escritório entrará em contato.', email: dto?.email };
  }

  confirmEmail(token: string) {
    return { message: 'E-mail confirmado', token };
  }

  resetPassword(dto: any) {
    return { message: 'Solicite ao escritório um novo convite de acesso.', email: dto?.email };
  }

  setNewPassword(dto: any) {
    return this.setupPassword(dto);
  }

  // ── Dashboard ───────────────────────────────────────────────────────────────

  async getDashboard(clienteId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { email: true },
    });

    const [processos, pendentes, financeiro, assinaturas] = await Promise.all([
      this.prisma.processo.count({ where: { clienteId, status: 'ATIVO', deletedAt: null } }),
      this.prisma.tarefa.count({
        where: { processo: { clienteId }, status: 'PENDENTE', deletedAt: null },
      }),
      this.prisma.lancamentoFinanceiro.aggregate({
        where: { clienteId, status: 'pendente', deletedAt: null },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      cliente?.email
        ? this.prisma.esignSignatario.count({
            where: { email: cliente.email, status: 'pendente', envelope: { status: 'enviado' } },
          })
        : Promise.resolve(0),
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
    const page = Math.max(parseInt(query?.page || '1', 10) || 1, 1);
    const limit = 10;
    const where = { clienteId, deletedAt: null };

    const [total, items] = await Promise.all([
      this.prisma.processo.count({ where }),
      this.prisma.processo.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, numero: true, titulo: true, status: true, area: true,
          tribunal: true, fase: true, updatedAt: true, valor: true,
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  async getProcesso(clienteId: string, processoId: string) {
    const processo = await this.prisma.processo.findFirst({
      where: { id: processoId, clienteId, deletedAt: null },
      include: {
        movimentacoes: { orderBy: { data: 'desc' }, take: 20 },
        documentos: {
          where: { deletedAt: null },
          select: { id: true, nome: true, tipo: true, createdAt: true },
        },
      },
    });

    if (!processo) throw new NotFoundException('Processo não encontrado');
    return processo;
  }

  getProcessoDetail(clienteId: string, processoId: string) {
    return this.getProcesso(clienteId, processoId);
  }

  async getTimeline(clienteId: string, processoId: string) {
    await this.assertProcessoDoCliente(processoId, clienteId);
    return this.prisma.movimentacao.findMany({
      where: { processoId },
      orderBy: { data: 'desc' },
    });
  }

  // ── Documentos ──────────────────────────────────────────────────────────────

  async getDocumentos(clienteId: string, _query?: any) {
    return this.prisma.documento.findMany({
      where: { processo: { clienteId }, deletedAt: null },
      select: { id: true, nome: true, tipo: true, url: true, processoId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getDocumentoDownload(clienteId: string, documentoId: string) {
    const doc = await this.prisma.documento.findFirst({
      where: { id: documentoId, processo: { clienteId }, deletedAt: null },
      select: { url: true, nome: true },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    return { url: doc.url, nome: doc.nome };
  }

  // ── Financeiro ──────────────────────────────────────────────────────────────

  async getFinanceiro(clienteId: string) {
    const [pendentes, pagos] = await Promise.all([
      this.prisma.lancamentoFinanceiro.findMany({
        where: { clienteId, status: 'pendente', deletedAt: null },
        orderBy: { vencimento: 'asc' },
      }),
      this.prisma.lancamentoFinanceiro.findMany({
        where: { clienteId, status: 'pago', deletedAt: null },
        orderBy: { paidAt: 'desc' },
        take: 10,
      }),
    ]);

    return { pendentes, historico: pagos };
  }

  getHistoricoFinanceiro(clienteId: string) {
    return this.getFinanceiro(clienteId);
  }

  async getBoletos(clienteId: string) {
    return this.prisma.lancamentoFinanceiro.findMany({
      where: {
        clienteId,
        status: 'pendente',
        deletedAt: null,
        formaPagamento: { equals: 'boleto', mode: 'insensitive' },
      },
      orderBy: { vencimento: 'asc' },
    });
  }

  iniciarPagamento(clienteId: string, lancamentoId: string) {
    return {
      message: 'Pagamento online ainda não habilitado — entre em contato com o escritório.',
      clienteId,
      lancamentoId,
    };
  }

  // ── E-sign ──────────────────────────────────────────────────────────────────

  async getAssinaturasPendentes(clienteId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { email: true },
    });
    if (!cliente?.email) return [];

    return this.prisma.esignSignatario.findMany({
      where: { email: cliente.email, status: 'pendente', envelope: { status: 'enviado' } },
      select: {
        id: true,
        token: true,
        envelope: { select: { id: true, titulo: true, createdAt: true, expiraEm: true } },
      },
    });
  }

  getDocumentosParaAssinar(clienteId: string) {
    return this.getAssinaturasPendentes(clienteId);
  }

  assinarDocumento(clienteId: string, documentoId: string, _dto?: any) {
    return { message: 'Use o link de assinatura recebido por e-mail', clienteId, documentoId };
  }

  // ── Perfil ──────────────────────────────────────────────────────────────────

  async getPerfil(clienteId: string) {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nome: true, email: true, telefone: true, cpf: true, cpfCnpj: true, createdAt: true },
    });
    if (!cliente) throw new NotFoundException('Cliente não encontrado');
    return cliente;
  }

  async updatePerfil(clienteId: string, body: { nome?: string; telefone?: string }) {
    return this.prisma.cliente.update({
      where: { id: clienteId },
      data: {
        ...(body?.nome ? { nome: body.nome } : {}),
        ...(body?.telefone ? { telefone: body.telefone } : {}),
      },
      select: { id: true, nome: true, email: true, telefone: true },
    });
  }

  atualizarPerfil(clienteId: string, body: any) {
    return this.updatePerfil(clienteId, body);
  }

  // ── Notificações (o modelo Notificacao é dos usuários do escritório) ───────

  async getNotificacoes(clienteId: string, _query?: any) {
    const portalUser = await this.getPortalUser(clienteId);
    const [mensagens, aprovacoes] = await Promise.all([
      this.prisma.mensagemPortal.count({
        where: { portalUserId: portalUser.id, remetente: 'escritorio', lida: false },
      }),
      this.prisma.aprovacaoPortal.count({
        where: { portalUserId: portalUser.id, status: 'pendente' },
      }),
    ]);
    return { mensagens_nao_lidas: mensagens, aprovacoes_pendentes: aprovacoes };
  }

  async marcarNotificacaoLida(clienteId: string, id: string) {
    const portalUser = await this.getPortalUser(clienteId);
    await this.prisma.mensagemPortal.updateMany({
      where: { id, portalUserId: portalUser.id },
      data:  { lida: true },
    });
    return { sucesso: true };
  }

  // ── Mensagens ───────────────────────────────────────────────────────────────

  async getMensagens(clienteId: string, query: any) {
    const portalUser = await this.getPortalUser(clienteId);
    return this.prisma.mensagemPortal.findMany({
      where: {
        portalUserId: portalUser.id,
        ...(query?.processo_id ? { processoId: query.processo_id } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
  }

  async enviarMensagem(clienteId: string, body: { conteudo?: string; mensagem?: string; processo_id?: string }) {
    const conteudo = (body?.conteudo || body?.mensagem || '').trim();
    if (!conteudo) throw new BadRequestException('Mensagem vazia');

    const portalUser = await this.getPortalUser(clienteId);
    if (body.processo_id) await this.assertProcessoDoCliente(body.processo_id, clienteId);

    return this.prisma.mensagemPortal.create({
      data: {
        conteudo,
        remetente:    'cliente',
        portalUserId: portalUser.id,
        processoId:   body.processo_id || null,
      },
    });
  }

  // ── Aprovações ──────────────────────────────────────────────────────────────

  async getAprovacoes(clienteId: string) {
    const portalUser = await this.getPortalUser(clienteId);
    return this.prisma.aprovacaoPortal.findMany({
      where: { portalUserId: portalUser.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async responderAprovacao(clienteId: string, id: string, status: 'aprovado' | 'rejeitado', dto: any) {
    const portalUser = await this.getPortalUser(clienteId);
    const aprovacao = await this.prisma.aprovacaoPortal.findFirst({
      where: { id, portalUserId: portalUser.id },
    });
    if (!aprovacao) throw new NotFoundException('Aprovação não encontrada');
    if (aprovacao.status !== 'pendente') throw new BadRequestException('Esta aprovação já foi respondida');

    return this.prisma.aprovacaoPortal.update({
      where: { id },
      data:  { status, comentario: dto?.comentario ?? null, respondidoEm: new Date() },
    });
  }

  aprovar(clienteId: string, id: string, dto: any) {
    return this.responderAprovacao(clienteId, id, 'aprovado', dto);
  }

  rejeitar(clienteId: string, id: string, dto: any) {
    return this.responderAprovacao(clienteId, id, 'rejeitado', dto);
  }

  getPropostas(clienteId: string) {
    return this.getAprovacoes(clienteId);
  }

  aprovarProposta(clienteId: string, propostaId: string) {
    return this.aprovar(clienteId, propostaId, {});
  }

  // ── Preferências ────────────────────────────────────────────────────────────

  getPreferencesNotificacoes(clienteId: string) {
    return { clienteId, email: true, whatsapp: false };
  }

  atualizarPreferences(clienteId: string, _preferences: any) {
    return { sucesso: true, clienteId };
  }

  // ── NPS ─────────────────────────────────────────────────────────────────────

  async getNpsSurvey(clienteId: string) {
    const portalUser = await this.getPortalUser(clienteId);
    const ultima = await this.prisma.respostaNps.findFirst({
      where: { portalUserId: portalUser.id },
      orderBy: { createdAt: 'desc' },
    });
    const noventaDias = 90 * 86_400_000;
    const pendente = !ultima || Date.now() - ultima.createdAt.getTime() > noventaDias;
    return { pendente, ultima_resposta: ultima };
  }

  async responderNps(clienteId: string, dto: { pontuacao?: number; score?: number; comentario?: string }) {
    const pontuacao = Number(dto?.pontuacao ?? dto?.score);
    if (!Number.isInteger(pontuacao) || pontuacao < 0 || pontuacao > 10) {
      throw new BadRequestException('Pontuação deve ser um inteiro de 0 a 10');
    }

    const portalUser = await this.prisma.usuarioPortal.findUnique({
      where: { clienteId },
      include: { cliente: { select: { escritorioId: true } } },
    });
    if (!portalUser) throw new UnauthorizedException('Acesso ao portal não configurado.');

    return this.prisma.respostaNps.create({
      data: {
        pontuacao,
        comentario:   dto.comentario ?? null,
        portalUserId: portalUser.id,
        escritorioId: portalUser.cliente.escritorioId,
      },
    });
  }
}
