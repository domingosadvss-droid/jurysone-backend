import { Prisma } from '@prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

    const where: Prisma.LancamentoFinanceiroWhereInput = {
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
      this.prisma.lancamentoFinanceiro.findMany({
        where,
        skip,
        take: limit,
        include: {
          cliente: true,
        },
        orderBy: { data: 'desc' },
      }),
      this.prisma.lancamentoFinanceiro.count({ where }),
    ]);

    const pages = Math.ceil(total / limit);

    return {
      data,
      total,
      page,
      pages,
    };
  }

  // ── Lançamentos ───────────────────────────────────────────────────────────

  private async assertLancamento(id: string, officeId: string) {
    const lanc = await this.prisma.lancamentoFinanceiro.findFirst({
      where: { id, escritorioId: officeId, deletedAt: null },
      include: { cliente: { select: { id: true, nome: true } } },
    });
    if (!lanc) throw new NotFoundException('Lançamento não encontrado');
    return lanc;
  }

  private async assertClienteDoEscritorio(clienteId: string | undefined, officeId: string) {
    if (!clienteId) return;
    const cliente = await this.prisma.cliente.findFirst({
      where: { id: clienteId, escritorioId: officeId, deletedAt: null },
      select: { id: true },
    });
    if (!cliente) throw new BadRequestException('Cliente não pertence a este escritório');
  }

  getLancamentos(query: any, officeId: string) {
    return this.findAll({
      escritorioId: officeId,
      tipo:   query?.tipo,
      status: query?.status,
      page:   Math.max(parseInt(query?.page, 10) || 1, 1),
      limit:  Math.min(Math.max(parseInt(query?.limit, 10) || 20, 1), 200),
    });
  }

  getLancamentosDatatable(query: any, officeId: string) {
    return this.getLancamentos(query, officeId);
  }

  async createLancamento(body: any, _userId: string, officeId: string) {
    const valor = Number(body?.valor);
    if (!body?.descricao || !Number.isFinite(valor) || valor <= 0) {
      throw new BadRequestException('Campos obrigatórios: descricao e valor (> 0)');
    }
    const tipo = String(body.tipo || 'receita').toLowerCase();
    if (!['receita', 'despesa'].includes(tipo)) {
      throw new BadRequestException('tipo deve ser "receita" ou "despesa"');
    }
    await this.assertClienteDoEscritorio(body.clienteId, officeId);

    return this.prisma.lancamentoFinanceiro.create({
      data: {
        escritorioId:   officeId,
        clienteId:      body.clienteId || null,
        descricao:      body.descricao,
        valor,
        tipo,
        status:         String(body.status || 'pendente').toLowerCase(),
        formaPagamento: body.formaPagamento ?? null,
        numParcelas:    body.numParcelas ? Number(body.numParcelas) : null,
        vencimento:     body.vencimento ? new Date(body.vencimento) : null,
        data:           body.data ? new Date(body.data) : new Date(),
      },
      include: { cliente: { select: { id: true, nome: true } } },
    });
  }

  getLancamento(id: string, officeId: string) {
    return this.assertLancamento(id, officeId);
  }

  async updateLancamento(id: string, body: any, officeId: string) {
    await this.assertLancamento(id, officeId);
    if (body?.clienteId) await this.assertClienteDoEscritorio(body.clienteId, officeId);

    return this.prisma.lancamentoFinanceiro.update({
      where: { id },
      data: {
        descricao:      body?.descricao,
        valor:          body?.valor !== undefined ? Number(body.valor) : undefined,
        tipo:           body?.tipo ? String(body.tipo).toLowerCase() : undefined,
        status:         body?.status ? String(body.status).toLowerCase() : undefined,
        formaPagamento: body?.formaPagamento,
        vencimento:     body?.vencimento ? new Date(body.vencimento) : undefined,
        clienteId:      body?.clienteId,
      },
      include: { cliente: { select: { id: true, nome: true } } },
    });
  }

  async removeLancamento(id: string, officeId: string) {
    await this.assertLancamento(id, officeId);
    await this.prisma.lancamentoFinanceiro.update({ where: { id }, data: { deletedAt: new Date() } });
    return { success: true, id };
  }

  async pagarLancamento(id: string, body: any, officeId: string) {
    const lanc = await this.assertLancamento(id, officeId);
    if (lanc.status === 'pago') throw new BadRequestException('Lançamento já está pago');

    return this.prisma.lancamentoFinanceiro.update({
      where: { id },
      data: {
        status: 'pago',
        paidAt: body?.dataPagamento ? new Date(body.dataPagamento) : new Date(),
        formaPagamento: body?.formaPagamento ?? lanc.formaPagamento,
      },
      include: { cliente: { select: { id: true, nome: true } } },
    });
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

    const lancamentos = await this.prisma.lancamentoFinanceiro.findMany({
      where,
    });

    const receitas = lancamentos
      .filter(l => l.tipo === 'receita' && l.status === 'pago')
      .reduce((sum, l) => sum + Number(l.valor), 0);

    const despesas = lancamentos
      .filter(l => l.tipo === 'despesa' && l.status === 'pago')
      .reduce((sum, l) => sum + Number(l.valor), 0);

    const inadimplencia = lancamentos
      .filter(l => l.tipo === 'receita' && l.status === 'pendente')
      .reduce((sum, l) => sum + Number(l.valor), 0);

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

      const lancamentos = await this.prisma.lancamentoFinanceiro.findMany({
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
        .reduce((sum, l) => sum + Number(l.valor), 0);

      const despesas = lancamentos
        .filter(l => l.tipo === 'despesa')
        .reduce((sum, l) => sum + Number(l.valor), 0);

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

    const receitas = await this.prisma.lancamentoFinanceiro.findMany({
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

    return receitas.reduce((sum, l) => sum + Number(l.valor), 0);
  }

  async findPendentes(escritorioId: string): Promise<any[]> {
    return this.prisma.lancamentoFinanceiro.findMany({
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

    return this.prisma.lancamentoFinanceiro.findMany({
      where: {
        escritorioId,
        status: 'pendente',
        vencimento: { lt: hoje },
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

  async getOverview(query: any, officeId: string) {
    const periodo = query?.periodo || 'mes';
    const [resumo, atrasados, mrr] = await Promise.all([
      this.getSummary(officeId, periodo),
      this.findAtrasados(officeId),
      this.getMRR(officeId),
    ]);
    return {
      ...resumo,
      periodo,
      mrr,
      atrasados: { qtd: atrasados.length, total: atrasados.reduce((s, l) => s + Number(l.valor), 0) },
    };
  }

  async getChartData(query: any, officeId: string) {
    const meses = Math.min(Math.max(parseInt(query?.meses, 10) || 6, 1), 24);
    return { data: await this.getFluxo(officeId, meses) };
  }

  async getDRE(query: any, officeId: string) {
    const ano = parseInt(query?.ano, 10) || new Date().getFullYear();
    const lancs = await this.prisma.lancamentoFinanceiro.findMany({
      where: {
        escritorioId: officeId,
        status: 'pago',
        deletedAt: null,
        paidAt: { gte: new Date(ano, 0, 1), lt: new Date(ano + 1, 0, 1) },
      },
      select: { tipo: true, valor: true, paidAt: true },
    });
    const meses = Array.from({ length: 12 }, (_, m) => {
      const doMes = lancs.filter(l => l.paidAt && l.paidAt.getMonth() === m);
      const receitas = doMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + Number(l.valor), 0);
      const despesas = doMes.filter(l => l.tipo === 'despesa').reduce((s, l) => s + Number(l.valor), 0);
      return { mes: m + 1, receitas, despesas, resultado: receitas - despesas };
    });
    const receitas = meses.reduce((s, m) => s + m.receitas, 0);
    const despesas = meses.reduce((s, m) => s + m.despesas, 0);
    return { ano, meses, total: { receitas, despesas, resultado: receitas - despesas } };
  }

  getFluxoCaixa(query: any, officeId: string) {
    return this.getFluxo(officeId);
  }
}
