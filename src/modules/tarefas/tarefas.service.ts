import { Prioridade, Prisma, StatusTarefa } from '@prisma/client';
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}

interface StatusCount {
  pendente: number;
  em_andamento: number;
  concluida: number;
  atrasadas: number;
}

const STATUS_VALIDOS = Object.values(StatusTarefa);
const PRIORIDADE_ALIASES: Record<string, Prioridade> = {
  BAIXA: 'BAIXA', MEDIA: 'MEDIA', NORMAL: 'MEDIA', ALTA: 'ALTA', URGENTE: 'URGENTE',
};

/** Aceita 'pendente', 'PENDENTE', 'em-andamento' etc. e devolve o enum do banco. */
function normalizarStatus(valor?: string): StatusTarefa | undefined {
  if (!valor) return undefined;
  const v = String(valor).trim().toUpperCase().replace(/[\s-]/g, '_') as StatusTarefa;
  if (!STATUS_VALIDOS.includes(v)) {
    throw new BadRequestException(`Status inválido: ${valor}. Use: ${STATUS_VALIDOS.join(', ')}`);
  }
  return v;
}

function normalizarPrioridade(valor?: string): Prioridade | undefined {
  if (!valor) return undefined;
  const p = PRIORIDADE_ALIASES[String(valor).trim().toUpperCase()];
  if (!p) throw new BadRequestException(`Prioridade inválida: ${valor}. Use: BAIXA, MEDIA, ALTA, URGENTE`);
  return p;
}

const INCLUDE = {
  responsavel: { select: { id: true, nome: true, email: true, avatarUrl: true } },
  processo:    { select: { id: true, numero: true, titulo: true } },
} as const;

@Injectable()
export class TarefasService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any, officeId: string): Promise<PaginatedResponse<any>> {
    const page  = Math.max(parseInt(query?.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(query?.limit, 10) || 10, 1), 200);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: Prisma.TarefaWhereInput = { escritorioId: officeId, deletedAt: null };
    if (query?.responsavelId) where.responsavelId = query.responsavelId;
    if (query?.processoId)    where.processoId    = query.processoId;
    if (query?.status)        where.status        = normalizarStatus(query.status);
    if (query?.prioridade)    where.prioridade    = normalizarPrioridade(query.prioridade);
    if (query?.vencimentoHoje === true || query?.vencimentoHoje === 'true') {
      where.dataPrazo = { gte: today, lt: new Date(today.getTime() + 86_400_000) };
    }
    if (query?.atrasadas === true || query?.atrasadas === 'true') {
      where.AND = [
        { dataPrazo: { lt: today } },
        { status: { notIn: ['CONCLUIDA', 'CANCELADA'] } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.tarefa.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: INCLUDE,
        orderBy: [{ dataPrazo: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.tarefa.count({ where }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string, officeId: string) {
    const tarefa = await this.prisma.tarefa.findFirst({
      where: { id, escritorioId: officeId, deletedAt: null },
      include: INCLUDE,
    });
    if (!tarefa) throw new NotFoundException('Tarefa não encontrada');
    return tarefa;
  }

  findById(id: string, officeId: string) {
    return this.findOne(id, officeId);
  }

  /** Impede vincular processo/cliente de outro escritório. */
  private async assertVinculos(officeId: string, processoId?: string, clienteId?: string) {
    if (processoId) {
      const p = await this.prisma.processo.findFirst({ where: { id: processoId, escritorioId: officeId }, select: { id: true } });
      if (!p) throw new BadRequestException('Processo não pertence a este escritório');
    }
    if (clienteId) {
      const c = await this.prisma.cliente.findFirst({ where: { id: clienteId, escritorioId: officeId }, select: { id: true } });
      if (!c) throw new BadRequestException('Cliente não pertence a este escritório');
    }
  }

  async create(dto: any, _userId: string, officeId: string) {
    if (!dto?.titulo) throw new BadRequestException('Campo obrigatório: titulo');
    await this.assertVinculos(officeId, dto.processoId);

    return this.prisma.tarefa.create({
      data: {
        titulo:        dto.titulo,
        descricao:     dto.descricao ?? null,
        status:        normalizarStatus(dto.status) ?? 'PENDENTE',
        prioridade:    normalizarPrioridade(dto.prioridade) ?? 'MEDIA',
        dataPrazo:     dto.dataPrazo ? new Date(dto.dataPrazo) : null,
        responsavelId: dto.responsavelId || null,
        processoId:    dto.processoId || null,
        escritorioId:  officeId,
      },
      include: INCLUDE,
    });
  }

  async update(id: string, dto: any, officeId: string) {
    await this.findOne(id, officeId);
    await this.assertVinculos(officeId, dto?.processoId);
    const status = normalizarStatus(dto?.status);

    return this.prisma.tarefa.update({
      where: { id },
      data: {
        titulo:        dto?.titulo,
        descricao:     dto?.descricao,
        prioridade:    normalizarPrioridade(dto?.prioridade),
        dataPrazo:     dto?.dataPrazo ? new Date(dto.dataPrazo) : undefined,
        responsavelId: dto?.responsavelId,
        processoId:    dto?.processoId,
        ...(status ? { status, dataConclusa: status === 'CONCLUIDA' ? new Date() : null } : {}),
      },
      include: INCLUDE,
    });
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    await this.prisma.tarefa.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true, id };
  }

  async updateStatus(id: string, status: string, officeId: string) {
    await this.findOne(id, officeId);
    const novo = normalizarStatus(status);

    return this.prisma.tarefa.update({
      where: { id },
      data: { status: novo, dataConclusa: novo === 'CONCLUIDA' ? new Date() : null },
      include: INCLUDE,
    });
  }

  async findAtrasadas(escritorioId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.tarefa.findMany({
      where: {
        escritorioId,
        dataPrazo: { lt: today },
        status: { notIn: ['CONCLUIDA', 'CANCELADA'] },
        deletedAt: null,
      },
      include: INCLUDE,
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async countByStatus(escritorioId: string): Promise<StatusCount> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = { escritorioId, deletedAt: null };

    const [pendente, em_andamento, concluida, atrasadas] = await Promise.all([
      this.prisma.tarefa.count({ where: { ...base, status: 'PENDENTE' } }),
      this.prisma.tarefa.count({ where: { ...base, status: 'EM_ANDAMENTO' } }),
      this.prisma.tarefa.count({ where: { ...base, status: 'CONCLUIDA' } }),
      this.prisma.tarefa.count({
        where: { ...base, dataPrazo: { lt: today }, status: { notIn: ['CONCLUIDA', 'CANCELADA'] } },
      }),
    ]);

    return { pendente, em_andamento, concluida, atrasadas };
  }

  findDatatable(query: any, officeId: string) {
    return this.findAll(query, officeId);
  }

  async getKanban(query: any, officeId: string) {
    const tarefas = await this.prisma.tarefa.findMany({
      where: {
        escritorioId: officeId,
        deletedAt: null,
        status: { not: 'CANCELADA' },
        ...(query?.responsavelId ? { responsavelId: query.responsavelId } : {}),
        ...(query?.processoId ? { processoId: query.processoId } : {}),
      },
      include: INCLUDE,
      orderBy: [{ dataPrazo: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });

    return {
      pendente:     tarefas.filter(t => t.status === 'PENDENTE'),
      em_andamento: tarefas.filter(t => t.status === 'EM_ANDAMENTO'),
      concluida:    tarefas.filter(t => t.status === 'CONCLUIDA'),
    };
  }

  async getPushes(userId: string, officeId: string) {
    const amanha = new Date(Date.now() + 86_400_000);
    const data = await this.prisma.tarefa.findMany({
      where: {
        escritorioId: officeId,
        responsavelId: userId,
        deletedAt: null,
        status: { in: ['PENDENTE', 'EM_ANDAMENTO'] },
        dataPrazo: { lte: amanha },
      },
      include: INCLUDE,
      orderBy: { dataPrazo: 'asc' },
      take: 50,
    });
    return { data, total: data.length };
  }

  concluir(id: string, _body: any, _userId: string, officeId: string) {
    return this.updateStatus(id, 'CONCLUIDA', officeId);
  }

  reabrir(id: string, officeId: string) {
    return this.updateStatus(id, 'PENDENTE', officeId);
  }

  async addComentario(id: string, comment: string, userId: string, officeId: string) {
    await this.findOne(id, officeId);
    return { message: 'Comentários de tarefa ainda não são persistidos', id, comment, userId };
  }
}
