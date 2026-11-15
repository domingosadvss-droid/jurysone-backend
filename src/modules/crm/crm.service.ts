import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// Etapas padrão do funil jurídico
const ETAPAS_PADRAO = [
  { id: 'lead',      nome: 'Lead',      cor: '#6366f1', ordem: 1 },
  { id: 'consulta',  nome: 'Consulta',  cor: '#f59e0b', ordem: 2 },
  { id: 'proposta',  nome: 'Proposta',  cor: '#3b82f6', ordem: 3 },
  { id: 'contrato',  nome: 'Contrato',  cor: '#10b981', ordem: 4 },
];

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: any, officeId: string) {
    const where: any = { escritorioId: officeId };
    const etapa = query.etapa ?? query.stage;
    if (etapa)        where.etapa  = etapa;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { titulo:    { contains: query.search, mode: 'insensitive' } },
        { descricao: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page  = Math.max(parseInt(query.page  ?? '1',  10) || 1, 1);
    const limit = Math.min(parseInt(query.limit ?? '50', 10) || 50, 200);

    const [registros, total] = await Promise.all([
      this.prisma.registroCrm.findMany({
        where,
        include: { cliente: { select: { id: true, nome: true, email: true, telefone: true } } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      this.prisma.registroCrm.count({ where }),
    ]);

    return { registros, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, officeId: string) {
    const reg = await this.prisma.registroCrm.findFirst({
      where: { id, escritorioId: officeId },
      include: {
        cliente: true,
        atendimento: {
          include: { processo: { select: { id: true, numero: true, area: true, status: true } } },
        },
      },
    });
    if (!reg) throw new NotFoundException(`Oportunidade ${id} não encontrada`);
    return reg;
  }

  async create(body: any, userId: string, officeId: string) {
    return this.prisma.registroCrm.create({
      data: {
        escritorioId:  officeId,
        clienteId:     body.clienteId     ?? body.cliente_id  ?? null,
        atendimentoId: body.atendimentoId ?? body.atendimento_id ?? null,
        tipo:          body.tipo          ?? 'oportunidade',
        titulo:        body.titulo        ?? body.title ?? 'Nova oportunidade',
        descricao:     body.descricao     ?? body.description ?? null,
        etapa:         body.etapa         ?? body.stage ?? 'lead',
        status:        'aberto',
      },
      include: { cliente: { select: { id: true, nome: true, email: true } } },
    });
  }

  async update(id: string, body: any, officeId: string) {
    const reg = await this.prisma.registroCrm.findFirst({ where: { id, escritorioId: officeId } });
    if (!reg) throw new NotFoundException(`Oportunidade ${id} não encontrada`);

    const data: any = {};
    const titulo    = body.titulo    ?? body.title;
    const descricao = body.descricao ?? body.description;
    const etapa     = body.etapa     ?? body.stage;
    const clienteId = body.clienteId ?? body.cliente_id;

    if (titulo)      data.titulo    = titulo;
    if (descricao)   data.descricao = descricao;
    if (etapa)       data.etapa     = etapa;
    if (body.status) data.status    = body.status;
    if (clienteId)   data.clienteId = clienteId;

    return this.prisma.registroCrm.update({ where: { id }, data });
  }

  async remove(id: string, officeId: string) {
    const reg = await this.prisma.registroCrm.findFirst({ where: { id, escritorioId: officeId } });
    if (!reg) throw new NotFoundException(`Oportunidade ${id} não encontrada`);
    await this.prisma.registroCrm.delete({ where: { id } });
    return { message: 'Oportunidade removida' };
  }

  async getBoard(officeId: string) {
    const registros = await this.prisma.registroCrm.findMany({
      where: { escritorioId: officeId, status: { notIn: ['ganho', 'perdido'] } },
      include: { cliente: { select: { id: true, nome: true, email: true, telefone: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const stages = ETAPAS_PADRAO.map((etapa) => ({
      ...etapa,
      oportunidades: registros.filter((r) => (r.etapa ?? 'lead') === etapa.id),
      total: registros.filter((r) => (r.etapa ?? 'lead') === etapa.id).length,
    }));

    return { stages, total: registros.length };
  }

  async moveStage(id: string, stageId: string, officeId: string) {
    const reg = await this.prisma.registroCrm.findFirst({ where: { id, escritorioId: officeId } });
    if (!reg) throw new NotFoundException(`Oportunidade ${id} não encontrada`);

    const validas = [...ETAPAS_PADRAO.map((e) => e.id), 'ganho', 'perdido'];
    if (!validas.includes(stageId)) {
      throw new BadRequestException(`Etapa "${stageId}" inválida. Use: ${validas.join(', ')}`);
    }

    return this.prisma.registroCrm.update({ where: { id }, data: { etapa: stageId } });
  }

  async markWon(id: string, body: any, officeId: string) {
    const reg = await this.prisma.registroCrm.findFirst({
      where: { id, escritorioId: officeId },
      include: { cliente: true },
    });
    if (!reg) throw new NotFoundException(`Oportunidade ${id} não encontrada`);
    await this.prisma.registroCrm.update({ where: { id }, data: { status: 'ganho', etapa: 'ganho' } });
    return { message: 'Oportunidade marcada como GANHA', titulo: reg.titulo, cliente: reg.cliente?.nome };
  }

  async markLost(id: string, reason: string, officeId: string) {
    const reg = await this.prisma.registroCrm.findFirst({ where: { id, escritorioId: officeId } });
    if (!reg) throw new NotFoundException(`Oportunidade ${id} não encontrada`);
    await this.prisma.registroCrm.update({
      where: { id },
      data: {
        status:    'perdido',
        etapa:     'perdido',
        descricao: reg.descricao ? `${reg.descricao}\n\n[PERDIDO] ${reason ?? ''}` : `[PERDIDO] ${reason ?? ''}`,
      },
    });
    return { message: 'Oportunidade marcada como PERDIDA', motivo: reason };
  }

  async getPerformance(query: any, officeId: string) {
    const periodo = query.period ?? 'month';
    const dataInicio = this.getPeriodStart(periodo);

    const [total, ganhos, perdidos, porEtapa] = await Promise.all([
      this.prisma.registroCrm.count({ where: { escritorioId: officeId, createdAt: { gte: dataInicio } } }),
      this.prisma.registroCrm.count({ where: { escritorioId: officeId, status: 'ganho',   createdAt: { gte: dataInicio } } }),
      this.prisma.registroCrm.count({ where: { escritorioId: officeId, status: 'perdido', createdAt: { gte: dataInicio } } }),
      this.prisma.registroCrm.groupBy({
        by: ['etapa'],
        where: { escritorioId: officeId, createdAt: { gte: dataInicio } },
        _count: { id: true },
      }),
    ]);

    const taxaConversao = total > 0 ? Math.round((ganhos / total) * 100) : 0;
    const funil = ETAPAS_PADRAO.map((etapa) => {
      const item = porEtapa.find((e) => e.etapa === etapa.id);
      return { ...etapa, count: item?._count.id ?? 0 };
    });

    return { periodo, total, ganhos, perdidos, emAberto: total - ganhos - perdidos, taxaConversao, funil };
  }

  getStages(_officeId: string) {
    return { stages: ETAPAS_PADRAO };
  }

  createStage(_body: any, _officeId: string) {
    return { message: 'Use as etapas padrão. Customização via configuração.', stages: ETAPAS_PADRAO };
  }

  updateStage(id: string, body: any, _officeId: string) {
    return { message: 'Etapa atualizada', id, ...body };
  }

  private getPeriodStart(period: string): Date {
    const now = new Date();
    switch (period) {
      case 'week':    return new Date(new Date().setDate(now.getDate() - 7));
      case 'month':   return new Date(new Date().setMonth(now.getMonth() - 1));
      case 'quarter': return new Date(new Date().setMonth(now.getMonth() - 3));
      case 'year':    return new Date(new Date().setFullYear(now.getFullYear() - 1));
      default:        return new Date(new Date().setMonth(now.getMonth() - 1));
    }
  }
}
