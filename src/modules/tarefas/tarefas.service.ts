import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface FindAllFilters {
  escritorioId: string;
  responsavelId?: string;
  processoId?: string;
  status?: string;
  prioridade?: string;
  vencimentoHoje?: boolean;
  atrasadas?: boolean;
  page?: number;
  limit?: number;
}

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

@Injectable()
export class TarefasService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any, officeId: string): Promise<PaginatedResponse<any>> {
    const {
      responsavelId,
      processoId,
      status,
      prioridade,
      vencimentoHoje,
      atrasadas,
      page = 1,
      limit = 10,
    } = query;

    const escritorioId = officeId;

    const skip = (page - 1) * limit;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: any = {
      escritorioId,
      deletedAt: null,
    };

    if (responsavelId) {
      where.responsavelId = responsavelId;
    }

    if (processoId) {
      where.processoId = processoId;
    }

    if (status) {
      where.status = status;
    }

    if (prioridade) {
      where.prioridade = prioridade;
    }

    if (vencimentoHoje) {
      where.dataPrazo = {
        gte: today,
        lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    }

    if (atrasadas) {
      where.AND = [
        { dataPrazo: { lt: today } },
        { status: { not: 'concluida' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.tarefa.findMany({
        where,
        skip,
        take: limit,
        include: {
          responsavel: true,
          processo: true,
        },
        orderBy: { dataPrazo: 'asc' },
      }),
      this.prisma.tarefa.count({ where }),
    ]);

    const pages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      pages,
    };
  }

  async findById(id: string): Promise<any> {
    return this.prisma.tarefa.findUnique({
      where: { id },
      include: {
        responsavel: true,
        processo: true,
      },
    });
  }

  async create(dto: any, userId?: string, officeId?: string): Promise<any> {
    return this.prisma.tarefa.create({
      data: {
        titulo: dto.titulo,
        descricao: dto.descricao,
        status: dto.status || 'pendente',
        prioridade: dto.prioridade || 'normal',
        dataPrazo: dto.dataPrazo ? new Date(dto.dataPrazo) : null,
        responsavelId: dto.responsavelId,
        processoId: dto.processoId,
        escritorioId: dto.escritorioId,
      },
      include: {
        responsavel: true,
        processo: true,
      },
    });
  }

  async update(id: string, dto: any, officeId?: string): Promise<any> {
    return this.prisma.tarefa.update({
      where: { id },
      data: {
        titulo: dto.titulo,
        descricao: dto.descricao,
        prioridade: dto.prioridade,
        dataPrazo: dto.dataPrazo ? new Date(dto.dataPrazo) : undefined,
        responsavelId: dto.responsavelId,
      },
      include: {
        responsavel: true,
        processo: true,
      },
    });
  }

  async remove(id: string, officeId?: string): Promise<any> {
    return this.prisma.tarefa.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async updateStatus(id: string, status: string): Promise<any> {
    // Validate status transition
    const validStatuses = ['pendente', 'em_andamento', 'concluida', 'cancelada'];

    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }

    return this.prisma.tarefa.update({
      where: { id },
      data: {
        status: status as any,
        dataConclusa: status === 'concluida' || status === 'CONCLUIDA' ? new Date() : null,
      },
      include: {
        responsavel: true,
        processo: true,
      },
    });
  }

  async findAtrasadas(escritorioId: string): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.tarefa.findMany({
      where: {
        escritorioId,
        dataPrazo: { lt: today },
        status: { not: 'CONCLUIDA' } as any,
        deletedAt: null,
      },
      include: {
        responsavel: true,
        processo: true,
      },
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async countByStatus(escritorioId: string): Promise<StatusCount> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendente, em_andamento, concluida, atrasadas] = await Promise.all([
      this.prisma.tarefa.count({
        where: {
          escritorioId,
          status: 'PENDENTE',
          deletedAt: null,
        },
      }),
      this.prisma.tarefa.count({
        where: {
          escritorioId,
          status: 'EM_ANDAMENTO',
          deletedAt: null,
        },
      }),
      this.prisma.tarefa.count({
        where: {
          escritorioId,
          status: 'CONCLUIDA',
          deletedAt: null,
        },
      }),
      this.prisma.tarefa.count({
        where: {
          escritorioId,
          dataPrazo: { lt: today },
          status: { not: 'CONCLUIDA' } as any,
          deletedAt: null,
        },
      }),
    ]);

    return {
      pendente,
      em_andamento,
      concluida,
      atrasadas,
    };
  }

  findDatatable(query: any, officeId: string) {
    return { data: [], total: 0, officeId, query };
  }

  getKanban(query: any, officeId: string) {
    return { pendente: [], em_andamento: [], concluida: [], officeId };
  }

  getPushes(userId: string, officeId: string) {
    return { data: [], userId, officeId };
  }

  findOne(id: string, officeId: string) {
    return this.findById(id);
  }

  concluir(id: string, body: any, userId: string, officeId: string) {
    return this.updateStatus(id, 'concluida');
  }

  reabrir(id: string, officeId: string) {
    return this.updateStatus(id, 'pendente');
  }

  addComentario(id: string, comment: string, userId: string, officeId: string) {
    return { message: 'Comentário adicionado', id, comment, userId, officeId };
  }
}
