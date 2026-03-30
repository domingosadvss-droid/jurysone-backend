import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProcessDto } from './dto/create-process.dto';
import { ListProcessesDto } from './dto/list-processes.dto';

@Injectable()
export class ProcessesService {
  constructor(private prisma: PrismaService) {}

  // ─── Criar Processo ────────────────────────────────────────────────────────
  async create(dto: CreateProcessDto, userId: string, officeId: string) {
    return this.prisma.processo.create({
      data: {
        ...(dto as any),
        escritorioId: officeId,
      } as any,
      include: { cliente: true, responsavel: true } as any,
    });
  }

  // ─── Listar Processos (paginado) ───────────────────────────────────────────
  async findAll(filters: ListProcessesDto, officeId: string) {
    const { skip = 0, take: perPage = 20, search, status } = filters;
    const page = Math.floor(skip / perPage) + 1;

    const where: any = {
      escritorioId: officeId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { numero: { contains: search } },
          { cliente: { nome: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.processo.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { updatedAt: 'desc' },
        include: {
          cliente:    { select: { id: true, nome: true } as any },
          responsavel: { select: { id: true, nome: true } as any },
          _count: { select: { movimentacoes: true, tarefas: true, documentos: true } },
        } as any,
      }),
      this.prisma.processo.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        perPage,
        lastPage: Math.ceil(total / perPage),
      },
    };
  }

  // ─── Buscar por ID ─────────────────────────────────────────────────────────
  async findOne(id: string, officeId: string) {
    const process = await this.prisma.processo.findFirst({
      where: { id, escritorioId: officeId },
      include: {
        cliente:     true,
        responsavel: { select: { id: true, nome: true, email: true } as any },
        movimentacoes: { orderBy: { data: 'desc' }, take: 10 } as any,
        documentos:    { orderBy: { createdAt: 'desc' }, take: 5 } as any,
        tarefas:       { where: { status: { not: 'CONCLUIDA' } }, orderBy: { dataPrazo: 'asc' } } as any,
      } as any,
    });

    if (!process) throw new NotFoundException('Processo não encontrado.');
    return process;
  }

  // ─── Atualizar Processo ────────────────────────────────────────────────────
  async update(id: string, dto: Partial<CreateProcessDto>, officeId: string) {
    await this.findOne(id, officeId); // Verifica existência e ownership
    return this.prisma.processo.update({
      where: { id },
      data: dto as any,
    });
  }

  // ─── Remover Processo ──────────────────────────────────────────────────────
  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.process.update({
      where: { id },
      data: { status: 'ARQUIVADO' },
    });
  }

  // ─── Andamentos do Processo ────────────────────────────────────────────────
  async getMovements(processId: string, officeId: string, page = 1) {
    await this.findOne(processId, officeId);
    const skip = (page - 1) * 20;

    const [data, total] = await Promise.all([
      this.prisma.movimentacao.findMany({
        where: { processoId: processId },
        orderBy: { data: 'desc' },
        skip,
        take: 20,
      }),
      this.prisma.movimentacao.count({ where: { processoId: processId } }),
    ]);

    return { data, meta: { total, page, lastPage: Math.ceil(total / 20) } };
  }

  // ─── Dashboard KPIs ───────────────────────────────────────────────────────
  async getDashboardKPIs(officeId: string) {
    const now = new Date();
    const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [activeProcesses, weekDeadlines, pendingTasks, monthRevenue] =
      await Promise.all([
        this.prisma.processo.count({ where: { escritorioId: officeId, status: 'ATIVO' } }),
        this.prisma.evento.count({
          where: { escritorioId: officeId, data: { gte: now, lte: weekEnd }, tipo: 'PRAZO' } as any,
        }),
        this.prisma.tarefa.count({ where: { escritorioId: officeId, status: 'PENDENTE' } }),
        this.prisma.pagamento.aggregate({
          where: {
            escritorioId: officeId,
            status: 'PAGO',
          } as any,
          _sum: { valor: true } as any,
        }),
      ]);

    return {
      activeProcesses,
      weekDeadlines,
      pendingTasks,
      monthRevenue: ((monthRevenue._sum as any).valor || 0),
    };
  }
}
