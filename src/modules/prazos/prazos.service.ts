import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface FindAllFilters {
  escritorioId: string;
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}

interface UrgencyCount {
  hoje: number;
  amanha: number;
  esta_semana: number;
}

@Injectable()
export class PrazosService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: FindAllFilters): Promise<PaginatedResponse<any>> {
    const { escritorioId, page = 1, limit = 10 } = filters;
    const skip = (page - 1) * limit;

    const where = {
      escritorioId,
      deletedAt: null,
    };

    const [data, total] = await Promise.all([
      this.prisma.prazo.findMany({
        where,
        skip,
        take: limit,
        include: {
          processo: true,
        },
        orderBy: { dataPrazo: 'asc' },
      }),
      this.prisma.prazo.count({ where }),
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
    return this.prisma.prazo.findUnique({
      where: { id },
      include: {
        processo: true,
      },
    });
  }

  async create(dto: any): Promise<any> {
    return this.prisma.prazo.create({
      data: {
        descricao: dto.descricao,
        dataPrazo: new Date(dto.dataPrazo),
        tipo: dto.tipo,
        processoId: dto.processoId,
        escritorioId: dto.escritorioId,
      },
      include: {
        processo: true,
      },
    });
  }

  async update(id: string, dto: any): Promise<any> {
    return this.prisma.prazo.update({
      where: { id },
      data: {
        descricao: dto.descricao,
        dataPrazo: dto.dataPrazo ? new Date(dto.dataPrazo) : undefined,
        tipo: dto.tipo,
      },
      include: {
        processo: true,
      },
    });
  }

  async remove(id: string): Promise<any> {
    return this.prisma.prazo.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async findHoje(escritorioId: string): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    return this.prisma.prazo.findMany({
      where: {
        escritorioId,
        dataPrazo: {
          gte: today,
          lt: tomorrow,
        },
        deletedAt: null,
      },
      include: {
        processo: true,
      },
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async findProximos(escritorioId: string, dias: number = 7): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const futuro = new Date(today.getTime() + dias * 24 * 60 * 60 * 1000);

    return this.prisma.prazo.findMany({
      where: {
        escritorioId,
        dataPrazo: {
          gte: today,
          lte: futuro,
        },
        deletedAt: null,
      },
      include: {
        processo: true,
      },
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async findAtrasados(escritorioId: string): Promise<any[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.prazo.findMany({
      where: {
        escritorioId,
        dataPrazo: { lt: today },
        deletedAt: null,
      },
      include: {
        processo: true,
      },
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async countUrgentes(escritorioId: string): Promise<UrgencyCount> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [hoje, amanha, esta_semana] = await Promise.all([
      this.prisma.prazo.count({
        where: {
          escritorioId,
          dataPrazo: {
            gte: today,
            lt: tomorrow,
          },
          deletedAt: null,
        },
      }),
      this.prisma.prazo.count({
        where: {
          escritorioId,
          dataPrazo: {
            gte: tomorrow,
            lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000),
          },
          deletedAt: null,
        },
      }),
      this.prisma.prazo.count({
        where: {
          escritorioId,
          dataPrazo: {
            gte: today,
            lte: weekLater,
          },
          deletedAt: null,
        },
      }),
    ]);

    return {
      hoje,
      amanha,
      esta_semana,
    };
  }

  async sendAlertas(escritorioId: string): Promise<void> {
    // Find prazos that need alerts
    const hoje = await this.findHoje(escritorioId);
    const proximosDias = await this.findProximos(escritorioId, 3);

    // Create notifications for each prazo
    // This is a placeholder - you would implement actual notification logic
    const prazosParaAlertar = [...hoje, ...proximosDias];

    for (const prazo of prazosParaAlertar) {
      // Create notification in database
      // You would implement this based on your Notificacao model
      await this.createNotification(prazo);
    }
  }

  private async createNotification(prazo: any): Promise<void> {
    // Placeholder for notification creation
    // Implement based on your Notificacao model and business logic
    console.log(`Alerta criado para prazo: ${prazo.descricao}`);
  }
}
