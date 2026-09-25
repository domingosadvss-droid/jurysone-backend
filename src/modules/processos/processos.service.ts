import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { DatajudService } from '../datajud/datajud.service';

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
  constructor(
    private prisma: PrismaService,
    private datajud: DatajudService,
  ) {}

  async findAll(query: any, officeId: string): Promise<PaginatedResponse<any>> {
    const { clienteId, status, area, search, page = 1, limit = 10 } = query;
    const escritorioId = officeId;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { escritorioId, deletedAt: null };
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

  async findById(id: string, officeId?: string): Promise<any> {
    return this.prisma.processo.findUnique({
      where: { id },
      include: {
        cliente: true,
        tarefas:    { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
        prazos:     { where: { deletedAt: null }, orderBy: { dataPrazo: 'asc' } },
        movimentacoes: { orderBy: { data: 'desc' }, take: 20 },
      },
    });
  }

  async create(dto: any, userId?: string, officeId?: string): Promise<any> {
    const escritorioId = dto.escritorioId ?? officeId;

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

  async update(id: string, dto: any, officeId?: string): Promise<any> {
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
    if (!officeId) throw new BadRequestException('officeId é obrigatório');
    return this.prisma.processo.update({
      where: { id, escritorioId: officeId },
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
    const page  = Math.max(1, Number(query.page ?? 1));
    const limit = 20;

    const where: any = { processoId: id };
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

    return this.datajud.sincronizarProcesso(id);
  }

  // ── Documentos, tarefas, partes ─────────────────────────────────────────────

  async getDocumentos(id: string, officeId: string) {
    const data = await this.prisma.documento.findMany({
      where: { processoId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  async getTarefas(id: string, officeId: string) {
    const data = await this.prisma.tarefa.findMany({
      where: { processoId: id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return { data, total: data.length };
  }

  // Partes são armazenadas nos dados brutos do DataJud / campo camposCustom
  getPartes(id: string, officeId: string) {
    return this.prisma.processo.findUnique({
      where: { id },
      select: { camposCustom: true },
    }).then((p) => ({ data: (p?.camposCustom as any)?.partes ?? [] }));
  }

  async addParte(id: string, body: any, officeId: string) {
    const processo = await this.prisma.processo.findFirst({ where: { id, escritorioId: officeId } });
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
    const data = await this.prisma.lancamentoFinanceiro.findMany({
      where: { deletedAt: null, cliente: { processos: { some: { id } } } },
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
