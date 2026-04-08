import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface FindAllFilters {
  escritorioId: string;
  tipo?: string;
  status?: string;
  page?: number;
  limit?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}

interface Summary {
  receitas: number;
  despesas: number;
  saldo: number;
  inadimplencia: number;
}

interface FluxoItem {
  mes: string;
  receitas: number;
  despesas: number;
  saldo: number;
}

@Injectable()
export class FinanceiroService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: FindAllFilters): Promise<PaginatedResponse<any>> {
    const { escritorioId, tipo, status, page = 1, limit = 10 } = filters;
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

    const [data, total] = await Promise.all([
      this.prisma.lancamento.findMany({
        where,
        skip,
        take: limit,
        include: {
          cliente: true,
        },
        orderBy: { data: 'desc' },
      }),
      this.prisma.lancamento.count({ where }),
    ]);

    const pages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      pages,
    };
  }

  async getLancamentos(query: any, officeId: string): Promise<any> {
    return { message: 'Lançamentos', officeId, query };
  }

  async getLancamentosDatatable(query: any, officeId: string): Promise<any> {
    return { message: 'Lançamentos DataTable', officeId, query };
  }

  async createLancamento(body: any, userId: string, officeId: string): Promise<any> {
    return { message: 'Lançamento created', body, userId, officeId };
  }

  async getLancamento(id: string, officeId: string): Promise<any> {
    return { message: 'Lançamento detail', id, officeId };
  }

  async updateLancamento(id: string, body: any, officeId: string): Promise<any> {
    return { message: 'Lançamento updated', id, body, officeId };
  }

  async removeLancamento(id: string, officeId: string): Promise<any> {
    return { message: 'Lançamento removed', id, officeId };
  }

  async getCategories(query: any, officeId: string): Promise<any> {
    return { message: 'Categories', officeId, query };
  }

  async createCategory(body: any, officeId: string): Promise<any> {
    return { message: 'Category created', body, officeId };
  }

  async getBankAccounts(query: any, officeId: string): Promise<any> {
    return { message: 'Bank accounts', officeId, query };
  }

  async createBankAccount(body: any, officeId: string): Promise<any> {
    return { message: 'Bank account created', body, officeId };
  }

  async getCostCenters(query: any, officeId: string): Promise<any> {
    return { message: 'Cost centers', officeId, query };
  }

  async createCostCenter(body: any, officeId: string): Promise<any> {
    return { message: 'Cost center created', body, officeId };
  }

  async create(dto: any): Promise<any> {
    return this.prisma.lancamento.create({
      data: {
        descricao: dto.descricao,
        tipo: dto.tipo,
        valor: dto.valor,
        data: new Date(dto.data),
        status: dto.status || 'pendente',
        clienteId: dto.clienteId,
        escritorioId: dto.escritorioId,
      },
      include: {
        cliente: true,
      },
    });
  }

  async update(id: string, dto: any): Promise<any> {
    return this.prisma.lancamento.update({
      where: { id },
      data: {
        descricao: dto.descricao,
        tipo: dto.tipo,
        valor: dto.valor,
        data: dto.data ? new Date(dto.data) : undefined,
        status: dto.status,
      },
      include: {
        cliente: true,
      },
    });
  }

  async remove(id: string): Promise<any> {
    return this.prisma.lancamento.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async getSummary(escritorioId: string, periodo: string): Promise<Summary> {
    const now = new Date();
    let dataInicio = new Date();

    // Parse periodo: 'mes', 'trimestre', 'ano'
    if (periodo === 'mes') {
      dataInicio.setMonth(dataInicio.getMonth() - 1);
    } else if (periodo === 'trimestre') {
      dataInicio.setMonth(dataInicio.getMonth() - 3);
    } else if (periodo === 'ano') {
      dataInicio.setFullYear(dataInicio.getFullYear() - 1);
    }

    const where = {
      escritorioId,
      data: {
        gte: dataInicio,
        lte: now,
      },
      deletedAt: null,
    };

    const lancamentos = await this.prisma.lancamento.findMany({
      where,
    });

    const receitas = lancamentos
      .filter(l => l.tipo === 'receita' && l.status === 'pago')
      .reduce((sum, l) => sum + l.valor, 0);

    const despesas = lancamentos
      .filter(l => l.tipo === 'despesa' && l.status === 'pago')
      .reduce((sum, l) => sum + l.valor, 0);

    const inadimplencia = lancamentos
      .filter(l => l.tipo === 'receita' && l.status === 'pendente')
      .reduce((sum, l) => sum + l.valor, 0);

    return {
      receitas,
      despesas,
      saldo: receitas - despesas,
      inadimplencia,
    };
  }

  async getFluxo(escritorioId: string, meses: number = 12): Promise<FluxoItem[]> {
    const fluxo: FluxoItem[] = [];

    for (let i = meses - 1; i >= 0; i--) {
      const mes = new Date();
      mes.setMonth(mes.getMonth() - i);
      const ano = mes.getFullYear();
      const numeroMes = mes.getMonth();

      const dataInicio = new Date(ano, numeroMes, 1);
      const dataFim = new Date(ano, numeroMes + 1, 0);

      const lancamentos = await this.prisma.lancamento.findMany({
        where: {
          escritorioId,
          data: {
            gte: dataInicio,
            lte: dataFim,
          },
          status: 'pago',
          deletedAt: null,
        },
      });

      const receitas = lancamentos
        .filter(l => l.tipo === 'receita')
        .reduce((sum, l) => sum + l.valor, 0);

      const despesas = lancamentos
        .filter(l => l.tipo === 'despesa')
        .reduce((sum, l) => sum + l.valor, 0);

      fluxo.push({
        mes: `${numeroMes + 1}/${ano}`,
        receitas,
        despesas,
        saldo: receitas - despesas,
      });
    }

    return fluxo;
  }

  async getMRR(escritorioId: string): Promise<number> {
    // Monthly Recurring Revenue
    const mes = new Date();
    const ano = mes.getFullYear();
    const numeroMes = mes.getMonth();

    const dataInicio = new Date(ano, numeroMes, 1);
    const dataFim = new Date(ano, numeroMes + 1, 0);

    const receitas = await this.prisma.lancamento.findMany({
      where: {
        escritorioId,
        tipo: 'receita',
        status: 'pago',
        data: {
          gte: dataInicio,
          lte: dataFim,
        },
        deletedAt: null,
      },
    });

    return receitas.reduce((sum, l) => sum + l.valor, 0);
  }

  async findPendentes(escritorioId: string): Promise<any[]> {
    return this.prisma.lancamento.findMany({
      where: {
        escritorioId,
        status: 'pendente',
        deletedAt: null,
      },
      include: {
        cliente: true,
      },
      orderBy: { data: 'asc' },
    });
  }

  async findAtrasados(escritorioId: string): Promise<any[]> {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    return this.prisma.lancamento.findMany({
      where: {
        escritorioId,
        status: 'pendente',
        data: { lt: hoje },
        deletedAt: null,
      },
      include: {
        cliente: true,
      },
      orderBy: { data: 'asc' },
    });
  }

  getCategorias(query: any, officeId: string) {
    return this.getCategories(query, officeId);
  }

  getCategoriasDatatable(query: any, officeId: string) {
    return { data: [], total: 0, officeId, query };
  }

  createCategoria(body: any, officeId: string) {
    return this.createCategory(body, officeId);
  }

  updateCategoria(id: string, body: any, officeId: string) {
    return { message: 'Categoria updated', id, body, officeId };
  }

  removeCategoria(id: string, officeId: string) {
    return { message: 'Categoria removed', id, officeId };
  }

  getContas(query: any, officeId: string) {
    return this.getBankAccounts(query, officeId);
  }

  getContasDatatable(query: any, officeId: string) {
    return { data: [], total: 0, officeId, query };
  }

  createConta(body: any, officeId: string) {
    return this.createBankAccount(body, officeId);
  }

  updateConta(id: string, body: any, officeId: string) {
    return { message: 'Conta updated', id, body, officeId };
  }

  removeConta(id: string, officeId: string) {
    return { message: 'Conta removed', id, officeId };
  }

  getCentrosCusto(query: any, officeId: string) {
    return this.getCostCenters(query, officeId);
  }

  getCentrosCustoDatatable(query: any, officeId: string) {
    return { data: [], total: 0, officeId, query };
  }

  createCentroCusto(body: any, officeId: string) {
    return this.createCostCenter(body, officeId);
  }

  updateCentroCusto(id: string, body: any, officeId: string) {
    return { message: 'CentroCusto updated', id, body, officeId };
  }

  removeCentroCusto(id: string, officeId: string) {
    return { message: 'CentroCusto removed', id, officeId };
  }

  pagarLancamento(id: string, body: any, officeId: string) {
    return { message: 'Lançamento pago', id, body, officeId };
  }

  getOverview(query: any, officeId: string) {
    return { receitas: 0, despesas: 0, saldo: 0, officeId, query };
  }

  getChartData(query: any, officeId: string) {
    return { data: [], officeId, query };
  }

  getDRE(query: any, officeId: string) {
    return { data: [], officeId, query };
  }

  getFluxoCaixa(query: any, officeId: string) {
    return this.getFluxo(officeId);
  }
}
