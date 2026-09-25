import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(officeId: string, query: any) {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0);

    const [
      totalProcessos,
      processosAtivos,
      totalClientes,
      clientesNovosMes,
      tarefasPendentes,
      tarefasAtrasadas,
      receitaMes,
      receitaMesAnterior,
    ] = await Promise.all([
      this.prisma.process.count({ where: { officeId } }),
      this.prisma.process.count({ where: { officeId, status: 'ATIVO' } }),
      this.prisma.client.count({ where: { officeId } }),
      this.prisma.client.count({ where: { officeId, createdAt: { gte: inicioMes } } }),
      this.prisma.tarefa.count({ where: { escritorioId: officeId, status: 'PENDENTE' } as any }),
      this.prisma.tarefa.count({ where: { escritorioId: officeId, status: 'PENDENTE', dataPrazo: { lt: agora } } as any }),
      this.prisma.lancamentoFinanceiro.aggregate({
        where: { escritorioId: officeId, status: 'PAGO', dataPagamento: { gte: inicioMes } },
        _sum: { valor: true },
      }),
      this.prisma.lancamentoFinanceiro.aggregate({
        where: { escritorioId: officeId, status: 'PAGO', dataPagamento: { gte: inicioMesAnterior, lte: fimMesAnterior } },
        _sum: { valor: true },
      }),
    ]);

    const receita = Number(receitaMes._sum.valor || 0);
    const receitaAnterior = Number(receitaMesAnterior._sum.valor || 0);
    const variacaoReceita = receitaAnterior > 0
      ? ((receita - receitaAnterior) / receitaAnterior) * 100
      : 0;

    return {
      processos: { total: totalProcessos, ativos: processosAtivos },
      clientes: { total: totalClientes, novos_mes: clientesNovosMes },
      tarefas: { pendentes: tarefasPendentes, atrasadas: tarefasAtrasadas },
      financeiro: {
        receita_mes: receita,
        receita_mes_anterior: receitaAnterior,
        variacao_pct: Math.round(variacaoReceita * 10) / 10,
      },
    };
  }

  async getReceitaEvolucao(officeId: string, query: any) {
    const meses = parseInt(query.meses || '6', 10);
    const resultado: Array<{ mes: string; receita: number; despesas: number }> = [];

    for (let i = meses - 1; i >= 0; i--) {
      const agora = new Date();
      const inicio = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 0);

      const [receita, despesas] = await Promise.all([
        this.prisma.lancamentoFinanceiro.aggregate({
          where: { escritorioId: officeId, tipo: 'HONORARIO', status: 'PAGO', dataPagamento: { gte: inicio, lte: fim } },
          _sum: { valor: true },
        }),
        this.prisma.lancamentoFinanceiro.aggregate({
          where: { escritorioId: officeId, tipo: 'DESPESA', dataPagamento: { gte: inicio, lte: fim } },
          _sum: { valor: true },
        }),
      ]);

      resultado.push({
        mes: inicio.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }),
        receita: Number(receita._sum.valor || 0),
        despesas: Number(despesas._sum.valor || 0),
      });
    }

    return { meses: resultado };
  }

  async getDistribuicaoProcessos(officeId: string) {
    const [porStatus, porArea] = await Promise.all([
      this.prisma.process.groupBy({
        by: ['status'],
        where: { officeId },
        _count: { _all: true },
      }),
      this.prisma.process.groupBy({
        by: ['area'],
        where: { officeId },
        _count: { _all: true },
        orderBy: { _count: { area: 'desc' } },
        take: 8,
      }),
    ]);

    return {
      por_status: porStatus.map((s) => ({ status: s.status, total: s._count._all })),
      por_area:   porArea.map((a) => ({ area: a.area || 'Não definida', total: a._count._all })),
    };
  }

  async getAnalisePrazos(officeId: string, query: any) {
    const agora = new Date();
    const proximos7 = new Date(agora.getTime() + 7 * 86400000);
    const proximos30 = new Date(agora.getTime() + 30 * 86400000);

    const [atrasados, semana, mes] = await Promise.all([
      this.prisma.tarefa.count({ where: { escritorioId: officeId, status: 'PENDENTE', dataPrazo: { lt: agora } } as any }),
      this.prisma.tarefa.count({ where: { escritorioId: officeId, status: 'PENDENTE', dataPrazo: { gte: agora, lte: proximos7 } } as any }),
      this.prisma.tarefa.count({ where: { escritorioId: officeId, status: 'PENDENTE', dataPrazo: { gte: agora, lte: proximos30 } } as any }),
    ]);

    return { atrasados, proximos_7_dias: semana, proximos_30_dias: mes };
  }

  async getProdutividadeEquipe(officeId: string, query: any) {
    const usuarios = await this.prisma.usuario.findMany({
      where: { escritorioId: officeId, ativo: true } as any,
      select: { id: true, nome: true },
    });

    const resultado = await Promise.all(
      usuarios.map(async (u) => {
        const [concluidas, pendentes, atrasadas] = await Promise.all([
          this.prisma.tarefa.count({ where: { escritorioId: officeId, responsavelId: u.id, status: 'CONCLUIDA' } as any }),
          this.prisma.tarefa.count({ where: { escritorioId: officeId, responsavelId: u.id, status: 'PENDENTE' } as any }),
          this.prisma.tarefa.count({ where: { escritorioId: officeId, responsavelId: u.id, status: 'PENDENTE', dataPrazo: { lt: new Date() } } as any }),
        ]);
        return { usuario: u.nome, concluidas, pendentes, atrasadas };
      }),
    );

    return { equipe: resultado };
  }

  async getIadimplencia(officeId: string) {
    const agora = new Date();
    const [totalPendente, totalVencido] = await Promise.all([
      this.prisma.lancamentoFinanceiro.aggregate({
        where: { escritorioId: officeId, status: 'PENDENTE' },
        _sum: { valor: true },
        _count: { _all: true },
      }),
      this.prisma.lancamentoFinanceiro.aggregate({
        where: { escritorioId: officeId, status: 'PENDENTE', dataVencimento: { lt: agora } },
        _sum: { valor: true },
        _count: { _all: true },
      }),
    ]);

    return {
      total_pendente: Number(totalPendente._sum.valor || 0),
      qtd_pendente: totalPendente._count._all,
      total_vencido: Number(totalVencido._sum.valor || 0),
      qtd_vencido: totalVencido._count._all,
    };
  }

  getInadimplencia(officeId: string) {
    return this.getIadimplencia(officeId);
  }

  getMrr(officeId: string, query: any) {
    return this.getReceitaEvolucao(officeId, { meses: 12, ...query });
  }

  getFluxoCaixaProjetado(officeId: string, query: any) {
    return { message: 'Fluxo de caixa projetado — em implementação', officeId };
  }

  getReceitaPorCliente(officeId: string, query: any) {
    return this.prisma.lancamentoFinanceiro.groupBy({
      by: ['clienteId'],
      where: { escritorioId: officeId, status: 'PAGO' },
      _sum: { valor: true },
      orderBy: { _sum: { valor: 'desc' } },
      take: 10,
    });
  }

  getTaxaSucesso(officeId: string, query: any) {
    return { message: 'Taxa de sucesso — em implementação', officeId };
  }

  getTempoResolucao(officeId: string) {
    return { message: 'Tempo de resolução — em implementação', officeId };
  }

  getFunilConversao(officeId: string, query: any) {
    return { message: 'Funil de conversão — em implementação', officeId };
  }

  getRetencao(officeId: string, query: any) {
    return { message: 'Retenção — em implementação', officeId };
  }

  getNps(officeId: string, query: any) {
    return { message: 'NPS — em implementação', officeId };
  }

  getAnaliseHoras(officeId: string, query: any) {
    return { message: 'Análise de horas — em implementação', officeId };
  }

  getIaInsights(officeId: string) {
    return { message: 'IA Insights — em implementação', officeId };
  }

  perguntarDados(officeId: string, pergunta: string) {
    return { message: 'Analytics conversacional — em implementação', officeId, pergunta };
  }

  detectarAnomalias(officeId: string) {
    return { message: 'Detecção de anomalias — em implementação', officeId };
  }

  getBenchmark(officeId: string) {
    return { message: 'Benchmark — em implementação', officeId };
  }

  getDashboards(userId: string) {
    return { message: 'Dashboards — em implementação', userId };
  }

  createDashboard(userId: string, dto: any) {
    return { message: 'Dashboard created', userId, dto };
  }

  updateDashboard(userId: string, id: string, dto: any) {
    return { message: 'Dashboard updated', userId, id, dto };
  }

  exportar(officeId: string, dto: any) {
    return { message: 'Exportação — em implementação', officeId, dto };
  }
}
