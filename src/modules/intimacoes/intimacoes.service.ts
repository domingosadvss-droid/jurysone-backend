import { Prisma } from '@prisma/client';
/**
 * JURYSONE — IntimacoesService
 * Gerencia intimações (fonte: DJEN) + monitoramentos antigos
 */
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PublicacoesService } from '../publicacoes/publicacoes.service';
import { filtroPublicacoes } from '../publicacoes/visibilidade';

@Injectable()
export class IntimacoesService {
  private readonly logger = new Logger(IntimacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publicacoes: PublicacoesService,
  ) {}

  // ── Includes padrão ─────────────────────────────────────────────────────

  private get defaultInclude() {
    return {
      processo:     { select: { id: true, numero: true, tribunal: true } },
      cliente:      { select: { id: true, nome: true } },
      lidaPor:      { select: { id: true, nome: true } },
      monitoramento:{ select: { id: true, nome: true, tipo: true } },
    } as const;
  }

  // ── Listar ───────────────────────────────────────────────────────────────

  async findAll(query: any, officeId: string, user?: any) {
    const where: Prisma.IntimacaoWhereInput = user ? { AND: [filtroPublicacoes(user)] } : { escritorioId: officeId };

    if (query.status)      where.status         = query.status;
    if (query.tribunal)    where.tribunal        = { contains: query.tribunal, mode: 'insensitive' };
    if (query.process_id)  where.processoId      = query.process_id;
    if (query.lida !== undefined) where.lida     = query.lida === 'true';
    if (query.fonte)       where.fonte           = query.fonte;
    if (query.start_date || query.end_date) {
      where.dataPublicacao = {};
      if (query.start_date) where.dataPublicacao.gte = new Date(query.start_date);
      if (query.end_date)   where.dataPublicacao.lte = new Date(query.end_date + 'T23:59:59');
    }
    if (query.search) {
      where.OR = [
        { titulo:    { contains: query.search, mode: 'insensitive' } },
        { conteudo:  { contains: query.search, mode: 'insensitive' } },
        { tribunal:  { contains: query.search, mode: 'insensitive' } },
        { numeroProcesso: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page    = parseInt(query.page ?? '1');
    const perPage = parseInt(query.per_page ?? '20');

    const [total, data] = await Promise.all([
      this.prisma.intimacao.count({ where }),
      this.prisma.intimacao.findMany({
        where,
        include: this.defaultInclude,
        orderBy: { dataPublicacao: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      data,
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
    };
  }

  async getUnreadCount(officeId: string, user?: any) {
    const count = await this.prisma.intimacao.count({
      where: { AND: [user ? filtroPublicacoes(user) : { escritorioId: officeId }], lida: false, status: 'NAO_LIDA' },
    });
    return { count };
  }

  async findOne(id: string, officeId: string, user?: any) {
    const item = await this.prisma.intimacao.findFirst({
      where: { id, AND: [user ? filtroPublicacoes(user) : { escritorioId: officeId }] },
      include: this.defaultInclude,
    });
    if (!item) throw new NotFoundException(`Intimação ${id} não encontrada`);
    return item;
  }

  // ── Ações ────────────────────────────────────────────────────────────────

  async marcarLida(id: string, userId: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.intimacao.update({
      where: { id },
      data: {
        lida:    true,
        lidaEm:  new Date(),
        lidaPorId: userId,
        status:  'LIDA',
      },
      include: this.defaultInclude,
    });
  }

  async vincularProcesso(id: string, processId: string, officeId: string) {
    await this.findOne(id, officeId);
    const process = await this.prisma.processo.findFirst({ where: { id: processId, escritorioId: officeId } });
    if (!process) throw new NotFoundException(`Processo ${processId} não encontrado`);

    return this.prisma.intimacao.update({
      where: { id },
      data:  { processoId: processId, clienteId: (process as any).clienteId },
      include: this.defaultInclude,
    });
  }

  async registrarProvidencia(id: string, providencia: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.intimacao.update({
      where: { id },
      data: {
        providencia,
        providenciaEm: new Date(),
        status: 'RESPONDIDA',
      },
      include: this.defaultInclude,
    });
  }

  async arquivar(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.intimacao.update({
      where: { id },
      data: { status: 'ARQUIVADA' },
      include: this.defaultInclude,
    });
  }

  // ── Monitoramentos ────────────────────────────────────────────────────────

  async listarMonitoramentos(officeId: string) {
    return this.prisma.diarioMonitoramento.findMany({
      where: { escritorioId: officeId },
      include: {
        responsavel: { select: { id: true, nome: true } },
        criadoPor:   { select: { id: true, nome: true } },
        _count: { select: { intimacoes: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async criarMonitoramento(body: any, userId: string, officeId: string) {
    return this.prisma.diarioMonitoramento.create({
      data: {
        ...body,
        officeId,
        criadoPorId: userId,
        tribunais: body.tribunais ?? ['TJSP'],
      },
      include: {
        responsavel: { select: { id: true, nome: true } },
      },
    });
  }

  async atualizarMonitoramento(id: string, body: any, officeId: string) {
    const mon = await this.prisma.diarioMonitoramento.findFirst({ where: { id, escritorioId: officeId } });
    if (!mon) throw new NotFoundException(`Monitoramento ${id} não encontrado`);
    // Apenas campos editáveis (evita sobrescrever escritorioId, contadores etc.)
    const campos = [
      'nome', 'ativo', 'tipo', 'termoBusca', 'oabNumero', 'oabEstado', 'nomeAdvogado', 'cpfCnpj',
      'tribunais', 'cadernos', 'notificarEmail', 'notificarWhatsapp', 'emailsAlerta', 'responsavelId',
    ] as const;
    const data: Prisma.DiarioMonitoramentoUncheckedUpdateInput = {};
    for (const c of campos) if (body?.[c] !== undefined) (data as any)[c] = body[c];
    return this.prisma.diarioMonitoramento.update({ where: { id }, data });
  }

  async removerMonitoramento(id: string, officeId: string) {
    const mon = await this.prisma.diarioMonitoramento.findFirst({ where: { id, escritorioId: officeId } });
    if (!mon) throw new NotFoundException(`Monitoramento ${id} não encontrado`);
    await this.prisma.diarioMonitoramento.delete({ where: { id } });
    return { success: true };
  }

  // ── Sincronização / Scraping ──────────────────────────────────────────────

  /**
   * Executa sincronização de todos os monitoramentos ativos do escritório
   * Chamado pelo scheduler (cron) ou manualmente
   */
  async sincronizar(officeId: string): Promise<{
    executados: number;
    novasIntimacoes: number;
    erros: number;
  }> {
    // Fonte única: DJEN, pela OAB de cada advogado do escritório (mesma captura do cron 7h/12h/19h).
    const r = await this.publicacoes.capturarEscritorio(officeId);
    const capturas: any[] = r.capturas ?? [];
    return {
      executados: capturas.length,
      novasIntimacoes: capturas.reduce((t, c) => t + (c.novas ?? 0), 0),
      erros: capturas.filter((c) => c.erro).length,
    };
  }

  /**
   * Monitoramentos antigos (por OAB) agora são atendidos pela captura do DJEN.
   * Outros tipos (nome, CPF/CNPJ, palavra-chave) não existem no DJEN por OAB e ficam sem efeito.
   */
  async sincronizarMonitoramento(
    mon: any,
    officeId: string,
  ): Promise<{ novas: number; aviso?: string }> {
    if (mon.tipo !== 'OAB') {
      const aviso = 'Monitoramento por nome, CPF/CNPJ ou palavra-chave não é usado: as publicações vêm do DJEN pela OAB de cada advogado.';
      await this.prisma.diarioMonitoramento.update({ where: { id: mon.id }, data: { ultimaExecucao: new Date(), erroUltimaSync: aviso } });
      return { novas: 0, aviso };
    }
    const r = await this.sincronizar(officeId);
    await this.prisma.diarioMonitoramento.update({
      where: { id: mon.id },
      data: { ultimaExecucao: new Date(), totalCapturado: { increment: r.novasIntimacoes }, erroUltimaSync: r.erros ? 'Falha em parte da captura do DJEN' : null },
    });
    this.logger.log(`Monitoramento ${mon.nome}: ${r.novasIntimacoes} novas publicações (DJEN)`);
    return { novas: r.novasIntimacoes };
  }

  // ── Tribunais disponíveis ────────────────────────────────────────────────

  getTribunais() {
    // O DJEN (Diário de Justiça Eletrônico Nacional) reúne as comunicações de todos os tribunais.
    return [{ sigla: 'DJEN', nome: 'Diário de Justiça Eletrônico Nacional (todos os tribunais)', fonte: 'comunicaapi.pje.jus.br' }];
  }

  // ── Estatísticas ──────────────────────────────────────────────────────────

  async getEstatisticas(officeId: string) {
    const [
      totalGeral,
      naoLidas,
      hoje,
      porTribunal,
      porStatus,
    ] = await Promise.all([
      this.prisma.intimacao.count({ where: { escritorioId: officeId } }),
      this.prisma.intimacao.count({ where: { escritorioId: officeId, lida: false } }),
      this.prisma.intimacao.count({
        where: {
          escritorioId: officeId,
          dataCaptura: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      this.prisma.intimacao.groupBy({
        by: ['tribunal'],
        where: { escritorioId: officeId },
        _count: true,
        orderBy: { _count: { tribunal: 'desc' } },
      }),
      this.prisma.intimacao.groupBy({
        by: ['status'],
        where: { escritorioId: officeId },
        _count: true,
      }),
    ]);

    return {
      totalGeral,
      naoLidas,
      capturadosHoje: hoje,
      porTribunal:    porTribunal.map(t => ({ tribunal: t.tribunal, total: t._count })),
      porStatus:      porStatus.map(s => ({ status: s.status, total: s._count })),
    };
  }
}
