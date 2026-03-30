/**
 * JURYSONE — IntimacoesService
 * Gerencia intimações capturadas dos Diários Oficiais + monitoramentos
 */
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DiarioOficialService } from './diario-oficial.service';

@Injectable()
export class IntimacoesService {
  private readonly logger = new Logger(IntimacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly diario: DiarioOficialService,
  ) {}

  // ── Includes padrão ─────────────────────────────────────────────────────

  private get defaultInclude() {
    return {
      process:      { select: { id: true, number: true, tribunal: true } },
      client:       { select: { id: true, nome: true } as any },
      lidaPor:      { select: { id: true, nome: true } as any },
      monitoramento:{ select: { id: true, nome: true, tipo: true } },
    };
  }

  // ── Listar ───────────────────────────────────────────────────────────────

  async findAll(query: any, officeId: string) {
    const where: any = { escritorioId: officeId };

    if (query.status)      where.status         = query.status;
    if (query.tribunal)    where.tribunal        = { contains: query.tribunal, mode: 'insensitive' };
    if (query.process_id)  where.processId       = query.process_id;
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

  async getUnreadCount(officeId: string) {
    const count = await this.prisma.intimacao.count({
      where: { escritorioId: officeId, lida: false, status: 'NAO_LIDA' },
    });
    return { count };
  }

  async findOne(id: string, officeId: string) {
    const item = await this.prisma.intimacao.findFirst({
      where: { id, escritorioId: officeId },
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
    const process = await this.prisma.processo.findFirst({ where: { id: processId, escritorioId: officeId } as any });
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
      where: { escritorioId: officeId } as any,
      include: {
        responsavel: { select: { id: true, nome: true } as any },
        criadoPor:   { select: { id: true, nome: true } as any },
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
        responsavel: { select: { id: true, nome: true } as any },
      },
    });
  }

  async atualizarMonitoramento(id: string, body: any, officeId: string) {
    const mon = await this.prisma.diarioMonitoramento.findFirst({ where: { id, escritorioId: officeId } as any });
    if (!mon) throw new NotFoundException(`Monitoramento ${id} não encontrado`);
    return this.prisma.diarioMonitoramento.update({ where: { id }, data: body });
  }

  async removerMonitoramento(id: string, officeId: string) {
    const mon = await this.prisma.diarioMonitoramento.findFirst({ where: { id, escritorioId: officeId } as any });
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
    const monitoramentos = await this.prisma.diarioMonitoramento.findMany({
      where: { escritorioId: officeId, ativo: true },
    });

    let novasIntimacoes = 0;
    let erros = 0;

    for (const mon of monitoramentos) {
      try {
        const resultado = await this.sincronizarMonitoramento(mon, officeId);
        novasIntimacoes += resultado.novas;
      } catch (err: any) {
        erros++;
        this.logger.error(`Erro ao sincronizar monitoramento ${mon.id}: ${err.message}`);
        await this.prisma.diarioMonitoramento.update({
          where: { id: mon.id },
          data: { erroUltimaSync: err.message, ultimaExecucao: new Date() },
        });
      }
    }

    return { executados: monitoramentos.length, novasIntimacoes, erros };
  }

  /**
   * Sincroniza um monitoramento específico
   */
  async sincronizarMonitoramento(
    mon: any,
    officeId: string,
  ): Promise<{ novas: number }> {
    const tribunais: string[] = mon.tribunais ?? [];

    // Monta os termos de busca baseado no tipo de monitoramento
    const termos: string[] = [];
    if (mon.tipo === 'OAB' && mon.oabNumero && mon.oabEstado) {
      termos.push(`${mon.oabNumero}/${mon.oabEstado}`);
    }
    if (mon.tipo === 'NOME' && mon.nomeAdvogado) {
      termos.push(mon.nomeAdvogado);
    }
    if (mon.tipo === 'CPF_CNPJ' && mon.cpfCnpj) {
      termos.push(mon.cpfCnpj);
    }
    if (mon.tipo === 'PALAVRA_CHAVE') {
      termos.push(mon.termoBusca);
    }
    if (mon.tipo === 'NUMERO_PROCESSO') {
      termos.push(mon.termoBusca);
    }

    if (termos.length === 0) return { novas: 0 };

    const resultados = await this.diario.buscarEmTodos({
      tribunais,
      termosBusca: termos,
      dataInicio: mon.ultimaExecucao ?? undefined,
    });

    let novas = 0;
    for (const r of resultados) {
      // Evita duplicatas: verifica se já existe intimação com a mesma edição + tribunal
      const existe = await this.prisma.intimacao.findFirst({
        where: {
          escritorioId: officeId,
          tribunal: r.tribunal,
          edicao:   r.edicao,
          titulo:   r.titulo,
        },
      });
      if (existe) continue;

      // Cria a intimação
      await this.prisma.intimacao.create({
        data: {
          escritorioId: officeId,
          monitoramentoId:   mon.id,
          fonte:             'DJE',
          tribunal:          r.tribunal,
          dataPublicacao:    new Date(r.dataPublicacao),
          edicao:            r.edicao,
          titulo:            r.titulo,
          conteudo:          r.conteudo,
          caderno:           r.caderno,
          paginaDiario:      r.pagina,
          urlOrigem:         r.urlOrigem,
          nomesEncontrados:  r.nomesEncontrados,
          numeroProcesso:    r.numeroProcesso,
          prazoIdentificado: r.prazoIdentificado,
          prazoFatal: r.prazoIdentificado
            ? new Date(Date.now() + r.prazoIdentificado * 24 * 60 * 60 * 1000)
            : null,
        },
      });
      novas++;
    }

    // Atualiza estatísticas do monitoramento
    await this.prisma.diarioMonitoramento.update({
      where: { id: mon.id },
      data: {
        ultimaExecucao: new Date(),
        totalCapturado: { increment: novas },
        erroUltimaSync: null,
      },
    });

    // Registra log de execução
    await this.prisma.diarioExecucaoLog.create({
      data: {
        escritorioId: officeId,
        tribunal:        tribunais.join(','),
        dataEdicao:      new Date(),
        status:          'sucesso',
        totalEncontrado: novas,
        monitoramentoId: mon.id,
      },
    });

    this.logger.log(`Monitoramento ${mon.nome}: ${novas} novas intimações capturadas`);
    return { novas };
  }

  // ── Tribunais disponíveis ────────────────────────────────────────────────

  getTribunais() {
    return this.diario.getTribunaisSuportados();
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
      this.prisma.intimacao.count({ where: { escritorioId: officeId } as any }),
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
        where: { escritorioId: officeId } as any,
        _count: true,
        orderBy: { _count: { tribunal: 'desc' } },
      }),
      this.prisma.intimacao.groupBy({
        by: ['status'],
        where: { escritorioId: officeId } as any,
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
