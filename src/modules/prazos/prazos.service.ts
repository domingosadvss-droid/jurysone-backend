import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { calcularVencimento } from '../../utils/calculadora-prazos';

interface FindAllFilters {
  escritorioId: string;
  page?: number;
  limit?: number;
  processoId?: string;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}

@Injectable()
export class PrazosService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: FindAllFilters): Promise<PaginatedResponse<any>> {
    const { escritorioId, page = 1, limit = 20, processoId } = filters;
    const skip = (page - 1) * limit;

    const where: any = { escritorioId, deletedAt: null };
    if (processoId) where.processoId = processoId;

    const [data, total] = await Promise.all([
      this.prisma.prazo.findMany({
        where,
        skip,
        take: limit,
        include: { processo: true },
        orderBy: { dataPrazo: 'asc' },
      }),
      this.prisma.prazo.count({ where }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findById(id: string): Promise<any> {
    return this.prisma.prazo.findUnique({
      where: { id },
      include: { processo: true },
    });
  }

  async create(dto: any): Promise<any> {
    return this.prisma.prazo.create({
      data: {
        descricao:    dto.descricao,
        dataPrazo:    new Date(dto.dataPrazo),
        tipo:         dto.tipo ?? 'judicial',
        status:       dto.status ?? 'pendente',
        processoId:   dto.processoId ?? null,
        escritorioId: dto.escritorioId,
      },
      include: { processo: true },
    });
  }

  async update(id: string, dto: any): Promise<any> {
    return this.prisma.prazo.update({
      where: { id },
      data: {
        descricao:  dto.descricao,
        dataPrazo:  dto.dataPrazo ? new Date(dto.dataPrazo) : undefined,
        tipo:       dto.tipo,
        status:     dto.status,
      },
      include: { processo: true },
    });
  }

  async remove(id: string): Promise<any> {
    return this.prisma.prazo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findHoje(escritorioId: string): Promise<any[]> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje.getTime() + 86_400_000);

    return this.prisma.prazo.findMany({
      where: { escritorioId, dataPrazo: { gte: hoje, lt: amanha }, deletedAt: null },
      include: { processo: true },
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async findProximos(escritorioId: string, dias = 7): Promise<any[]> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const futuro = new Date(hoje.getTime() + dias * 86_400_000);

    return this.prisma.prazo.findMany({
      where: { escritorioId, dataPrazo: { gte: hoje, lte: futuro }, deletedAt: null },
      include: { processo: true },
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async findAtrasados(escritorioId: string): Promise<any[]> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return this.prisma.prazo.findMany({
      where: { escritorioId, dataPrazo: { lt: hoje }, status: 'pendente', deletedAt: null },
      include: { processo: true },
      orderBy: { dataPrazo: 'asc' },
    });
  }

  async countUrgentes(escritorioId: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha     = new Date(hoje.getTime() + 86_400_000);
    const depoisAmanha = new Date(amanha.getTime() + 86_400_000);
    const semana     = new Date(hoje.getTime() + 7 * 86_400_000);

    const base = { escritorioId, status: 'pendente', deletedAt: null } as const;

    const [hoje_n, amanha_n, esta_semana] = await Promise.all([
      this.prisma.prazo.count({ where: { ...base, dataPrazo: { gte: hoje, lt: amanha } } }),
      this.prisma.prazo.count({ where: { ...base, dataPrazo: { gte: amanha, lt: depoisAmanha } } }),
      this.prisma.prazo.count({ where: { ...base, dataPrazo: { gte: hoje, lte: semana } } }),
    ]);

    return { hoje: hoje_n, amanha: amanha_n, esta_semana };
  }

  /**
   * Calcula a data de vencimento sem persistir.
   * Body: { dataPublicacao, diasPrazo, tipoPrazo? }
   */
  async calcular(body: any) {
    const { dataPublicacao, diasPrazo, tipoPrazo = 'util' } = body;

    if (!dataPublicacao || !diasPrazo) {
      return { erro: 'dataPublicacao e diasPrazo são obrigatórios' };
    }

    const resultado = await calcularVencimento({
      dataPublicacao: new Date(dataPublicacao),
      diasPrazo:      Number(diasPrazo),
      tipoPrazo,
    });

    return {
      dataPublicacao,
      diasPrazo,
      tipoPrazo,
      dataVencimento:      resultado.dataVencimento.toISOString().slice(0, 10),
      dataInicioPrazo:     resultado.dataInicioPrazo.toISOString().slice(0, 10),
      diasUteis:           resultado.diasUteis,
      diasCorridos:        resultado.diasCorridos,
      feriadosNoPeriodo:   resultado.feriadosNoPeriodo,
    };
  }
}
