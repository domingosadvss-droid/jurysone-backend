import { Prisma } from '@prisma/client';
import { ehParceiro } from '../../common/perfis';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DjenCliente, ErroDjen } from '../publicacoes/djen-cliente';

interface FindAllFilters {
  escritorioId: string;
  clienteId?: string;
  status?: string;
  area?: string;
  search?: string;
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}

@Injectable()
export class ProcessosService {
  private readonly djen = new DjenCliente();

  constructor(
    private prisma: PrismaService,
  ) {}

  async findAll(query: any, officeId: string, user?: any): Promise<PaginatedResponse<any>> {
    const { clienteId, status, area, search, page = 1, limit = 10 } = query;
    const escritorioId = officeId;
    const skip = (Number(page) - 1) * Number(limit);

    const where: Prisma.ProcessoWhereInput = { escritorioId, deletedAt: null };
    // Parceiro externo só enxerga os processos em que participa
    if (user && ehParceiro(user)) {
      where.participacoes = { some: { parceiroId: user.parceiroId ?? '__sem_parceiro__' } };
    }
    if (clienteId)  where.clienteId = clienteId;
    if (status)     where.status    = status.toUpperCase();
    if (area)       where.area      = area;
    if (search) {
      where.OR = [
        { numero:    { contains: search, mode: 'insensitive' } },
        { titulo:    { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.processo.findMany({
        where,
        skip,
        take: Number(limit),
        include: { cliente: true, tarefas: { where: { deletedAt: null } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.processo.count({ where }),
    ]);

    return { data, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
  }

  /** Parceiro externo só acessa processos em que tem participação registrada. */
  async assertAcessoParceiro(id: string, user: any) {
    if (!ehParceiro(user)) return;
    const ok = await this.prisma.participacaoProcesso.findFirst({
      where: { processoId: id, escritorioId: user.officeId, parceiroId: user.parceiroId ?? '__sem_parceiro__' },
      select: { id: true },
    });
    if (!ok) throw new NotFoundException('Processo não encontrado');
  }

  /** Garante que o processo existe e pertence ao escritório (isolamento entre escritórios). */
  private async assertProcesso(id: string, officeId: string) {
    const processo = await this.prisma.processo.findFirst({
      where: { id, escritorioId: officeId, deletedAt: null },
      select: { id: true, clienteId: true },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    return processo;
  }

  async findById(id: string, officeId: string): Promise<any> {
    const processo = await this.prisma.processo.findFirst({
      where: { id, escritorioId: officeId, deletedAt: null },
      include: {
        cliente: true,
        tarefas:    { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
        prazos:     { where: { deletedAt: null }, orderBy: { dataPrazo: 'asc' } },
        movimentacoes: { orderBy: { data: 'desc' }, take: 20 },
      },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');
    return processo;
  }

  async create(dto: any, userId: string, officeId: string): Promise<any> {
    // O escritório vem SEMPRE do usuário autenticado — nunca do corpo da requisição.
    const escritorioId = officeId;

    const cliente = await this.prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente || cliente.escritorioId !== escritorioId) {
      throw new BadRequestException('Cliente não pertence a este escritório');
    }

    return this.prisma.processo.create({
      data: {
        numero:        dto.numero,
        tribunal:      dto.tribunal ?? null,
        titulo:        dto.titulo ?? null,
        descricao:     dto.descricao ?? null,
        status:        (dto.status ?? 'ATIVO').toUpperCase(),
        area:          dto.area ?? null,
        tipoAcao:      dto.tipoAcao ?? null,
        valor:         dto.valor ?? null,
        fase:          dto.fase ?? null,
        clienteId:     dto.clienteId,
        escritorioId,
        responsavelId: dto.responsavelId ?? userId ?? null,
        dataInicio:    dto.dataInicio ? new Date(dto.dataInicio) : new Date(),
        dataPrazo:     dto.dataPrazo  ? new Date(dto.dataPrazo)  : null,
      },
      include: { cliente: true },
    });
  }

  async update(id: string, dto: any, officeId: string): Promise<any> {
    await this.assertProcesso(id, officeId);
    return this.prisma.processo.update({
      where: { id },
      data: {
        numero:    dto.numero,
        titulo:    dto.titulo,
        descricao: dto.descricao,
        status:    dto.status ? dto.status.toUpperCase() : undefined,
        area:      dto.area,
        tribunal:  dto.tribunal,
        fase:      dto.fase,
        valor:     dto.valor,
        dataPrazo: dto.dataPrazo ? new Date(dto.dataPrazo) : undefined,
      },
      include: { cliente: true },
    });
  }

  async remove(id: string, officeId: string): Promise<any> {
    await this.assertProcesso(id, officeId);
    return this.prisma.processo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  findDatatable(query: any, officeId: string) {
    return this.findAll(query, officeId);
  }

  findOne(id: string, officeId: string) {
    return this.findById(id, officeId);
  }

  // ── Andamentos ──────────────────────────────────────────────────────────────

  async getAndamentos(id: string, query: any, officeId: string) {
    await this.assertProcesso(id, officeId);
    const page  = Math.max(1, Number(query.page ?? 1));
    const limit = 20;

    const where: Prisma.MovimentacaoWhereInput = { processoId: id };
    if (query.source) where.fonte = query.source;

    const [data, total] = await Promise.all([
      this.prisma.movimentacao.findMany({
        where,
        orderBy: { data: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      this.prisma.movimentacao.count({ where }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async addAndamento(id: string, body: any, officeId: string) {
    const processo = await this.prisma.processo.findFirst({
      where: { id, escritorioId: officeId, deletedAt: null },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');

    return this.prisma.movimentacao.create({
      data: {
        processoId: id,
        data:       body.data ? new Date(body.data) : new Date(),
        descricao:  body.descricao ?? body.description ?? '',
        fonte:      body.fonte ?? body.source ?? 'manual',
      },
    });
  }

  async syncTribunal(id: string, officeId: string) {
    const processo = await this.prisma.processo.findFirst({
      where: { id, escritorioId: officeId, deletedAt: null },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');

    // Fonte única: DJEN. Cada comunicação vira um andamento (fonte DJEN), sem duplicar.
    const numero = String(processo.numero ?? '').replace(/\D/g, '');
    if (numero.length !== 20) throw new BadRequestException('Número do processo inválido para consulta no DJEN (precisa do número CNJ completo).');
    let comunicacoes;
    try {
      comunicacoes = await this.djen.porProcesso(numero);
    } catch (e: any) {
      throw new BadRequestException(e instanceof ErroDjen ? e.message : `Falha ao consultar o DJEN: ${e?.message ?? e}`);
    }
    const jaGravados = new Set(
      (await this.prisma.movimentacao.findMany({ where: { processoId: id, fonte: 'DJEN' }, select: { descricao: true } }))
        .map((m) => (m.descricao.match(/^\[DJEN (\d+)\]/) ?? [])[1]).filter(Boolean),
    );
    let novas = 0;
    for (const c of comunicacoes) {
      if (jaGravados.has(c.id)) continue;
      const tipo = [c.tipoComunicacao, c.tipoDocumento].filter(Boolean).join(' — ') || 'Comunicação';
      const cancelada = c.motivoCancelamento ? ` (CANCELADA: ${c.motivoCancelamento})` : '';
      await this.prisma.movimentacao.create({
        data: {
          processoId: id,
          data: new Date(`${c.dataDisponibilizacao}T12:00:00-03:00`),
          descricao: `[DJEN ${c.id}] ${tipo}${cancelada}: ${c.texto.replace(/\s+/g, ' ').slice(0, 1500)}${c.link ? `\nLink: ${c.link}` : ''}`,
          fonte: 'DJEN',
        },
      });
      novas++;
    }
    return { fonte: 'DJEN', encontradas: comunicacoes.length, novas };
  }

  // ── Documentos, tarefas, partes ─────────────────────────────────────────────

  async getDocumentos(id: string, officeId: string) {
    await this.assertProcesso(id, officeId);
    const data = await this.prisma.documento.findMany({
      where: { processoId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  async getTarefas(id: string, officeId: string) {
    await this.assertProcesso(id, officeId);
    const data = await this.prisma.tarefa.findMany({
      where: { processoId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  // Partes são armazenadas em camposCustom (vindas do DJEN na importação)
  async getPartes(id: string, officeId: string) {
    await this.assertProcesso(id, officeId);
    const p = await this.prisma.processo.findUnique({ where: { id }, select: { camposCustom: true } });
    return { data: (p?.camposCustom as any)?.partes ?? [] };
  }

  async addParte(id: string, body: any, officeId: string) {
    const processo = await this.prisma.processo.findFirst({ where: { id, escritorioId: officeId, deletedAt: null } });
    if (!processo) throw new NotFoundException('Processo não encontrado');

    const custom = (processo.camposCustom as any) ?? {};
    const partes = (custom.partes ?? []) as any[];
    partes.push({ ...body, adicionadoEm: new Date().toISOString() });

    await this.prisma.processo.update({
      where: { id },
      data: { camposCustom: { ...custom, partes } },
    });

    return { message: 'Parte adicionada', partes };
  }

  // ── Prazos do processo ───────────────────────────────────────────────────────

  async getPrazos(id: string, officeId: string) {
    const data = await this.prisma.prazo.findMany({
      where: { processoId: id, escritorioId: officeId, deletedAt: null },
      orderBy: { dataPrazo: 'asc' },
    });
    return { data, total: data.length };
  }

  // ── Honorários ───────────────────────────────────────────────────────────────

  async getHonorarios(id: string, officeId: string) {
    const processo = await this.assertProcesso(id, officeId);
    const data = await this.prisma.lancamentoFinanceiro.findMany({
      where: { deletedAt: null, escritorioId: officeId, clienteId: processo.clienteId },
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  // ── IA — stubs conscientes (dependem do módulo AI) ──────────────────────────

  analyzeWithAI(id: string, question: string, officeId: string) {
    return { analysis: null, id, question, message: 'Integração IA disponível no módulo /ai/copiloto' };
  }

  getRiskAnalysis(id: string, officeId: string) {
    return { risks: [], id, message: 'Análise de risco disponível no módulo /ai' };
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────

  async getDashboardKPIs(officeId: string) {
    const base = { escritorioId: officeId, deletedAt: null } as const;

    const [total, ativos, encerrados, arquivados, suspensos] = await Promise.all([
      this.prisma.processo.count({ where: base }),
      this.prisma.processo.count({ where: { ...base, status: 'ATIVO' } }),
      this.prisma.processo.count({ where: { ...base, status: 'ENCERRADO' } }),
      this.prisma.processo.count({ where: { ...base, status: 'ARQUIVADO' } }),
      this.prisma.processo.count({ where: { ...base, status: 'SUSPENSO' } }),
    ]);

    return { total, ativos, encerrados, arquivados, suspensos };
  }
}
