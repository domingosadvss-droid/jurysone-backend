import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

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
  constructor(private prisma: PrismaService) {}

  async findAll(query: any, officeId: string): Promise<PaginatedResponse<any>> {
    const {
      clienteId,
      status,
      area,
      search,
      page = 1,
      limit = 10,
    } = query;

    const escritorioId = officeId;

    const skip = (page - 1) * limit;

    const where: any = {
      escritorioId,
      deletedAt: null,
    };

    if (clienteId) {
      where.clienteId = clienteId;
    }

    if (status) {
      where.status = status;
    }

    if (area) {
      where.area = area;
    }

    if (search) {
      where.OR = [
        { numero: { contains: search, mode: 'insensitive' } },
        { titulo: { contains: search, mode: 'insensitive' } },
        { descricao: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.processo.findMany({
        where,
        skip,
        take: limit,
        include: {
          cliente: true,
          tarefas: { where: { deletedAt: null } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.processo.count({ where }),
    ]);

    const pages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      pages,
    };
  }

  async findById(id: string, officeId?: string): Promise<any> {
    const where: any = { id };
    if (officeId) {
      where.escritorioId = officeId;
    }

    return this.prisma.processo.findUnique({
      where: { id },
      include: {
        cliente: true,
        tarefas: { where: { deletedAt: null } },
        documentos: { where: { deletedAt: null } },
      },
    });
  }

  async create(dto: any, userId?: string, officeId?: string): Promise<any> {
    // Validate that cliente belongs to escritorio
    const cliente = await this.prisma.cliente.findUnique({
      where: { id: dto.clienteId },
    });

    if (!cliente || cliente.escritorioId !== dto.escritorioId) {
      throw new BadRequestException(
        'Cliente não pertence a este escritório',
      );
    }

    return this.prisma.processo.create({
      data: {
        numero: dto.numero,
        titulo: dto.titulo,
        descricao: dto.descricao,
        status: dto.status || 'aberto',
        area: dto.area,
        clienteId: dto.clienteId,
        escritorioId: dto.escritorioId,
        dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : new Date(),
        dataPrazo: dto.dataPrazo ? new Date(dto.dataPrazo) : null,
      },
      include: {
        cliente: true,
      },
    });
  }

  async update(id: string, dto: any, officeId?: string): Promise<any> {
    return this.prisma.processo.update({
      where: { id },
      data: {
        numero: dto.numero,
        titulo: dto.titulo,
        descricao: dto.descricao,
        status: dto.status,
        area: dto.area,
        dataPrazo: dto.dataPrazo ? new Date(dto.dataPrazo) : undefined,
      },
      include: {
        cliente: true,
      },
    });
  }

  async remove(id: string, officeId: string): Promise<any> {
    if (!officeId) {
      throw new BadRequestException('officeId é obrigatório');
    }

    return this.prisma.processo.update({
      where: { id, escritorioId: officeId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  findDatatable(query: any, officeId: string) {
    return { data: [], total: 0, officeId, query };
  }

  findOne(id: string, officeId: string) {
    return this.findById(id, officeId);
  }

  getAndamentos(id: string, query: any, officeId: string) {
    return { data: [], id, officeId };
  }

  addAndamento(id: string, body: any, officeId: string) {
    return { message: 'Andamento adicionado', id, body, officeId };
  }

  syncTribunal(id: string, officeId: string) {
    return { message: 'Sync iniciado', id, officeId };
  }

  getDocumentos(id: string, officeId: string) {
    return { data: [], id, officeId };
  }

  getTarefas(id: string, officeId: string) {
    return { data: [], id, officeId };
  }

  getPartes(id: string, officeId: string) {
    return { data: [], id, officeId };
  }

  addParte(id: string, body: any, officeId: string) {
    return { message: 'Parte adicionada', id, body, officeId };
  }

  getPrazos(id: string, officeId: string) {
    return { data: [], id, officeId };
  }

  getHonorarios(id: string, officeId: string) {
    return { data: [], id, officeId };
  }

  analyzeWithAI(id: string, question: string, officeId: string) {
    return { analysis: '', id, question, officeId };
  }

  getRiskAnalysis(id: string, officeId: string) {
    return { risks: [], id, officeId };
  }

  getDashboardKPIs(officeId: string) {
    return { totalProcessos: 0, ativos: 0, concluidos: 0, officeId };
  }
}
