import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface FindAllFilters {
  escritorioId: string;
  tipo?: string;
  status?: string;
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
export class ClientesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: FindAllFilters): Promise<PaginatedResponse<any>> {
    const {
      escritorioId,
      tipo,
      status,
      search,
      page = 1,
      limit = 10,
    } = filters;

    const skip = (page - 1) * limit;

    const where: any = {
      escritorioId,
      deletedAt: null,
    };

    if (tipo) {
      where.tipo = tipo;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { nome: { contains: search, mode: 'insensitive' } },
        { cpfCnpj: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { telefone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.cliente.findMany({
        where,
        skip,
        take: limit,
        include: {
          processos: { where: { deletedAt: null } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cliente.count({ where }),
    ]);

    // Add processos count to each cliente
    const dataWithCount = data.map(cliente => ({
      ...cliente,
      processosCount: cliente.processos.length,
    }));

    const pages = Math.ceil(total / limit);

    return {
      data: dataWithCount,
      total,
      page,
      pages,
    };
  }

  async findById(id: string): Promise<any> {
    const cliente = await this.prisma.cliente.findUnique({
      where: { id },
      include: {
        processos: { where: { deletedAt: null } },
      },
    });

    if (cliente) {
      return {
        ...cliente,
        processosCount: cliente.processos.length,
      };
    }

    return cliente;
  }

  async create(dto: any): Promise<any> {
    // Check CPF/CNPJ uniqueness within escritorio
    const existing = await this.prisma.cliente.findFirst({
      where: {
        cpfCnpj: dto.cpfCnpj,
        escritorioId: dto.escritorioId,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Cliente com este CPF/CNPJ já existe neste escritório',
      );
    }

    return this.prisma.cliente.create({
      data: {
        nome: dto.nome,
        tipo: dto.tipo,
        cpfCnpj: dto.cpfCnpj,
        email: dto.email,
        telefone: dto.telefone,
        endereco: dto.endereco,
        cidade: dto.cidade,
        estado: dto.estado,
        cep: dto.cep,
        status: dto.status || 'ativo',
        escritorioId: dto.escritorioId,
      },
    });
  }

  async update(id: string, dto: any): Promise<any> {
    // Check if updating CPF/CNPJ
    if (dto.cpfCnpj) {
      const cliente = await this.prisma.cliente.findUnique({
        where: { id },
      });

      if (cliente.cpfCnpj !== dto.cpfCnpj) {
        const existing = await this.prisma.cliente.findFirst({
          where: {
            cpfCnpj: dto.cpfCnpj,
            escritorioId: cliente.escritorioId,
            deletedAt: null,
            NOT: { id },
          },
        });

        if (existing) {
          throw new BadRequestException(
            'Cliente com este CPF/CNPJ já existe neste escritório',
          );
        }
      }
    }

    return this.prisma.cliente.update({
      where: { id },
      data: {
        nome: dto.nome,
        tipo: dto.tipo,
        cpfCnpj: dto.cpfCnpj,
        email: dto.email,
        telefone: dto.telefone,
        endereco: dto.endereco,
        cidade: dto.cidade,
        estado: dto.estado,
        cep: dto.cep,
        status: dto.status,
      },
    });
  }

  async remove(id: string): Promise<any> {
    return this.prisma.cliente.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
