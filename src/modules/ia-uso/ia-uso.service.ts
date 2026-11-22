/**
 * JURYSONE — Etapa A: uso, custo e limite mensal da IA (Claude)
 *
 * Toda chamada ao Claude passa por executar():
 *   1. confere o limite do mês — tarefas PESADA ficam pausadas quando o limite foi atingido
 *      (a CONVERSA com o cliente no WhatsApp nunca para; decisão de 20/11/2026);
 *   2. busca a chave "anthropic" do escritório;
 *   3. registra cada resposta (tokens, custo em US$ e em R$ pela cotação do BCB);
 *   4. avisa os gestores no sino ao passar do ponto de aviso e ao atingir o limite.
 *
 * O limite e o ponto de aviso são escolhidos pelo advogado na tela; sem limite definido,
 * a IA funciona sem teto e a tela mostra um lembrete para configurar.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ChavesService } from '../chaves/chaves.service';
import { AoUsar, IaIndisponivel, IaPausadaPeloLimite } from '../../common/ia-claude';
import { PERFIS_GESTAO } from '../../common/perfis';
import { custoUsd, precoDe, tokensDe } from './precos';

export type CategoriaIa = 'CONVERSA' | 'PESADA';

export interface ContextoIa {
  escritorioId: string;
  /** nome curto da tarefa, ex.: conversa_whatsapp, rascunho_peca_dativa */
  tarefa: string;
  categoria: CategoriaIa;
  processoId?: string | null;
  atendimentoId?: string | null;
  conversaId?: string | null;
  usuarioId?: string | null;
}

export interface ConfigIa {
  /** limite mensal em reais; null = sem limite */
  limiteMensalBrl: number | null;
  /** percentual do limite em que o aviso é enviado; null = sem aviso antecipado */
  avisoPercentual: number | null;
  /** mês (AAAA-MM) em que o advogado liberou as tarefas pesadas acima do limite */
  liberadoMes: string | null;
  liberadoPorId: string | null;
  /** avisos já enviados por mês, para não repetir: { '2026-11': ['AVISO', 'LIMITE'] } */
  avisosEnviados: Record<string, string[]>;
}

const CHAVE_CONFIG = 'ia_limite';
const CONFIG_PADRAO: ConfigIa = { limiteMensalBrl: null, avisoPercentual: null, liberadoMes: null, liberadoPorId: null, avisosEnviados: {} };
/** Cotação de reserva, só quando o BCB não responde e não há cotação anterior gravada */
const COTACAO_RESERVA = 5.5;

const TAREFAS: Record<string, string> = {
  conversa_whatsapp: 'Conversa com cliente no WhatsApp',
  lembrete_whatsapp: 'Lembrete ao cliente no WhatsApp',
  aprendizado_catalogo: 'Aprendizado: sugestões para o catálogo',
  resumo_cliente: 'Resumo de andamento para o cliente',
  rascunho_peca_dativa: 'Rascunho de peça (dativa)',
  calculo_pagamentos: 'Leitura de pagamentos (cálculos)',
  calculo_ajuste: 'Ajuste de cálculo por chat',
  teste: 'Teste',
};

/** Data de hoje no fuso de Brasília */
function partesBrasilia(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [ano, mes, dia] = f.format(d).split('-').map(Number);
  return { ano, mes, dia };
}

export function mesAtual(d = new Date()): string {
  const { ano, mes } = partesBrasilia(d);
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

/** Início e fim (exclusivo) do mês AAAA-MM no horário de Brasília (UTC-3, sem horário de verão) */
export function intervaloDoMes(mes: string): { inicio: Date; fim: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) throw new BadRequestException('Mês no formato AAAA-MM.');
  const ano = Number(m[1]), mm = Number(m[2]);
  if (mm < 1 || mm > 12) throw new BadRequestException('Mês inválido.');
  return { inicio: new Date(Date.UTC(ano, mm - 1, 1, 3)), fim: new Date(Date.UTC(ano, mm, 1, 3)) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

@Injectable()
export class IaUsoService {
  private readonly logger = new Logger(IaUsoService.name);
  private cotacao: { valor: number; fonte: string; obtidaEm: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chaves: ChavesService,
  ) {}

  // ─────────────────────────── configuração ───────────────────────────

  async config(escritorioId: string): Promise<ConfigIa> {
    const row = await this.prisma.configuracao.findFirst({ where: { escritorioId, chave: CHAVE_CONFIG } });
    return { ...CONFIG_PADRAO, ...((row?.valor as any) ?? {}) };
  }

  private async gravarConfig(escritorioId: string, cfg: ConfigIa) {
    await this.prisma.configuracao.upsert({
      where: { escritorioId_chave: { escritorioId, chave: CHAVE_CONFIG } },
      create: { id: `${escritorioId}_${CHAVE_CONFIG}`, escritorioId, chave: CHAVE_CONFIG, valor: cfg as any, tipo: 'ia' },
      update: { valor: cfg as any },
    });
  }

  async salvarConfig(escritorioId: string, dto: any) {
    const cfg = await this.config(escritorioId);
    const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(String(v).replace(',', '.')));
    if ('limiteMensalBrl' in (dto ?? {})) {
      const v = num(dto.limiteMensalBrl);
      if (v !== null && (!Number.isFinite(v) || v <= 0 || v > 1_000_000)) throw new BadRequestException('Limite mensal deve ser um valor em reais maior que zero (ou vazio para sem limite).');
      cfg.limiteMensalBrl = v === null ? null : r2(v);
    }
    if ('avisoPercentual' in (dto ?? {})) {
      const v = num(dto.avisoPercentual);
      if (v !== null && (!Number.isFinite(v) || v < 1 || v > 99)) throw new BadRequestException('O aviso deve ser um percentual entre 1 e 99 (ou vazio para não avisar antes).');
      cfg.avisoPercentual = v === null ? null : Math.round(v);
    }
    // mudar o limite reabre os avisos do mês
    cfg.avisosEnviados = { ...cfg.avisosEnviados, [mesAtual()]: [] };
    await this.gravarConfig(escritorioId, cfg);
    return this.situacao(escritorioId);
  }

  /** Libera as tarefas pesadas até o fim do mês, mesmo acima do limite */
  async liberar(escritorioId: string, usuarioId: string) {
    const cfg = await this.config(escritorioId);
    cfg.liberadoMes = mesAtual();
    cfg.liberadoPorId = usuarioId;
    await this.gravarConfig(escritorioId, cfg);
    return this.situacao(escritorioId);
  }

  async cancelarLiberacao(escritorioId: string) {
    const cfg = await this.config(escritorioId);
    cfg.liberadoMes = null;
    cfg.liberadoPorId = null;
    await this.gravarConfig(escritorioId, cfg);
    return this.situacao(escritorioId);
  }

  // ─────────────────────────── situação e relatórios ───────────────────────────

  private async gastoDoMes(escritorioId: string, mes: string) {
    const { inicio, fim } = intervaloDoMes(mes);
    const agg = await this.prisma.iaUso.aggregate({
      where: { escritorioId, createdAt: { gte: inicio, lt: fim } },
      _sum: { custoBrl: true, custoUsd: true },
      _count: { _all: true },
    });
    return { brl: Number(agg._sum.custoBrl ?? 0), usd: Number(agg._sum.custoUsd ?? 0), chamadas: agg._count._all };
  }

  async situacao(escritorioId: string) {
    const mes = mesAtual();
    const cfg = await this.config(escritorioId);
    const gasto = await this.gastoDoMes(escritorioId, mes);
    const limite = cfg.limiteMensalBrl;
    const percentual = limite ? Math.round((gasto.brl / limite) * 1000) / 10 : null;
    const atingido = !!limite && gasto.brl >= limite;
    const liberado = cfg.liberadoMes === mes;
    const chave = await this.chaves.getChave(escritorioId, 'anthropic');
    return {
      mes,
      gastoBrl: r2(gasto.brl),
      gastoUsd: Math.round(gasto.usd * 10000) / 10000,
      chamadas: gasto.chamadas,
      limiteMensalBrl: limite,
      avisoPercentual: cfg.avisoPercentual,
      percentual,
      limiteAtingido: atingido,
      liberadoAteFimDoMes: liberado,
      pesadasPausadas: atingido && !liberado,
      semLimite: !limite,
      chaveConfigurada: !!chave,
      lembrete: !limite ? 'Nenhum limite mensal de gasto com a IA foi definido. Defina um em Configurações → IA.' : null,
    };
  }

  /** Relatório do mês: totais por tarefa, por modelo e os processos que mais gastaram */
  async relatorio(escritorioId: string, mes?: string) {
    const m = mes || mesAtual();
    const { inicio, fim } = intervaloDoMes(m);
    const where = { escritorioId, createdAt: { gte: inicio, lt: fim } };
    const soma = { custoBrl: true, custoUsd: true, tokensEntrada: true, tokensSaida: true, tokensCacheLeitura: true, tokensCacheEscrita: true } as const;
    const [porTarefa, porModelo, porProcesso, porStatus, total] = await Promise.all([
      this.prisma.iaUso.groupBy({ by: ['tarefa'], where, _sum: soma, _count: { _all: true } }),
      this.prisma.iaUso.groupBy({ by: ['modelo'], where, _sum: soma, _count: { _all: true } }),
      this.prisma.iaUso.groupBy({ by: ['processoId'], where: { ...where, processoId: { not: null } }, _sum: { custoBrl: true }, _count: { _all: true }, orderBy: { _sum: { custoBrl: 'desc' } }, take: 10 }),
      this.prisma.iaUso.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.gastoDoMes(escritorioId, m),
    ]);
    const procs = await this.prisma.processo.findMany({
      where: { id: { in: porProcesso.map((p) => p.processoId!).filter(Boolean) }, escritorioId },
      select: { id: true, numero: true, cliente: { select: { nome: true } } },
    });
    const linha = (x: any) => ({
      chamadas: x._count._all,
      custoBrl: r2(Number(x._sum.custoBrl ?? 0)),
      custoUsd: Math.round(Number(x._sum.custoUsd ?? 0) * 10000) / 10000,
      tokensEntrada: x._sum.tokensEntrada ?? 0,
      tokensSaida: x._sum.tokensSaida ?? 0,
      tokensCache: (x._sum.tokensCacheLeitura ?? 0) + (x._sum.tokensCacheEscrita ?? 0),
    });
    return {
      mes: m,
      totalBrl: r2(total.brl),
      totalUsd: Math.round(total.usd * 10000) / 10000,
      chamadas: total.chamadas,
      porTarefa: porTarefa.map((t) => ({ tarefa: t.tarefa, nome: TAREFAS[t.tarefa] ?? t.tarefa, ...linha(t) })).sort((a, b) => b.custoBrl - a.custoBrl),
      porModelo: porModelo.map((t) => ({ modelo: t.modelo, ...linha(t) })).sort((a, b) => b.custoBrl - a.custoBrl),
      porProcesso: porProcesso.map((p) => {
        const pr = procs.find((x) => x.id === p.processoId);
        return { processoId: p.processoId, numero: pr?.numero ?? null, cliente: pr?.cliente?.nome ?? null, chamadas: p._count._all, custoBrl: r2(Number(p._sum.custoBrl ?? 0)) };
      }),
      porStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])),
    };
  }

  /** Custo de IA acumulado de um processo (para mostrar no caso) */
  async custoDoProcesso(escritorioId: string, processoId: string) {
    const agg = await this.prisma.iaUso.aggregate({ where: { escritorioId, processoId }, _sum: { custoBrl: true, custoUsd: true }, _count: { _all: true } });
    return { processoId, chamadas: agg._count._all, custoBrl: r2(Number(agg._sum.custoBrl ?? 0)), custoUsd: Math.round(Number(agg._sum.custoUsd ?? 0) * 10000) / 10000 };
  }

  // ─────────────────────────── execução ───────────────────────────

  /**
   * Executa uma chamada ao Claude com controle de limite e registro de custo.
   * `fn` recebe a chave do escritório e o callback `aoUsar`, que deve ser repassado à função do Claude.
   */
  async executar<T>(ctx: ContextoIa, fn: (apiKey: string, aoUsar: AoUsar) => Promise<T>): Promise<T> {
    if (ctx.categoria === 'PESADA') {
      const s = await this.situacao(ctx.escritorioId);
      if (s.pesadasPausadas) {
        await this.registrarLinha(ctx, { modelo: '-', tokens: null, status: 'BLOQUEADO', erro: 'Limite mensal de gasto com a IA atingido' });
        throw new IaPausadaPeloLimite(
          `O limite mensal de gasto com a IA (R$ ${s.limiteMensalBrl?.toFixed(2).replace('.', ',')}) foi atingido. ` +
          'Tarefas pesadas ficam pausadas até um advogado liberar em Configurações → IA.',
        );
      }
    }
    const chave = await this.chaves.getChave(ctx.escritorioId, 'anthropic');
    if (!chave) throw new IaIndisponivel('Chave do Claude (Anthropic) não configurada. Salve a chave em Configurações → Integrações.');

    const respostas: Array<{ model: string; usage: any }> = [];
    const aoUsar: AoUsar = (msg) => { if (msg) respostas.push({ model: msg.model, usage: msg.usage }); };
    let resultado: T;
    try {
      resultado = await fn(chave, aoUsar);
    } catch (e: any) {
      if (respostas.length) {
        for (const r of respostas) await this.registrarLinha(ctx, { modelo: r.model, tokens: r.usage, status: 'ERRO', erro: String(e?.message ?? e) });
      } else {
        await this.registrarLinha(ctx, { modelo: '-', tokens: null, status: 'ERRO', erro: String(e?.message ?? e) });
      }
      await this.conferirAvisos(ctx.escritorioId);
      throw e;
    }
    for (const r of respostas) await this.registrarLinha(ctx, { modelo: r.model, tokens: r.usage, status: 'OK' });
    await this.conferirAvisos(ctx.escritorioId);
    return resultado;
  }

  private async registrarLinha(ctx: ContextoIa, d: { modelo: string; tokens: any; status: string; erro?: string }) {
    try {
      const t = tokensDe(d.tokens);
      const usd = d.tokens ? custoUsd(d.modelo, t) : 0;
      if (d.tokens && !precoDe(d.modelo, t).conhecido) this.logger.warn(`Modelo "${d.modelo}" sem preço na tabela: custo calculado pelo preço mais alto.`);
      const cot = usd > 0 ? await this.cotacaoDolar() : null;
      await this.prisma.iaUso.create({
        data: {
          escritorioId: ctx.escritorioId, tarefa: ctx.tarefa, categoria: ctx.categoria, modelo: d.modelo || '-',
          tokensEntrada: t.entrada, tokensSaida: t.saida, tokensCacheLeitura: t.cacheLeitura, tokensCacheEscrita: t.cacheEscrita,
          custoUsd: usd, cotacaoUsd: cot?.valor ?? null, custoBrl: cot ? Math.round(usd * cot.valor * 10000) / 10000 : 0,
          status: d.status, erro: d.erro ? d.erro.slice(0, 500) : null,
          processoId: ctx.processoId ?? null, atendimentoId: ctx.atendimentoId ?? null, conversaId: ctx.conversaId ?? null, usuarioId: ctx.usuarioId ?? null,
        },
      });
    } catch (e: any) {
      // registrar o custo nunca pode derrubar a tarefa do cliente
      this.logger.error(`Falha ao registrar uso da IA: ${e?.message ?? e}`);
    }
  }

  /** Dólar (venda) do Banco Central, série SGS 1; guarda por 6 horas */
  async cotacaoDolar(): Promise<{ valor: number; fonte: string }> {
    if (this.cotacao && Date.now() - this.cotacao.obtidaEm < 6 * 3600_000) return this.cotacao;
    const base = (process.env.BCB_API_URL || 'https://api.bcb.gov.br').replace(/\/+$/, '');
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(`${base}/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json`, { signal: ctrl.signal });
      clearTimeout(t);
      if (resp.ok) {
        const j: any = await resp.json();
        const v = Number(String(j?.[0]?.valor ?? '').replace(',', '.'));
        if (Number.isFinite(v) && v > 1 && v < 50) {
          this.cotacao = { valor: v, fonte: `BCB ${j[0].data}`, obtidaEm: Date.now() };
          return this.cotacao;
        }
      }
    } catch { /* usa a reserva abaixo */ }
    const ultima = await this.prisma.iaUso.findFirst({ where: { cotacaoUsd: { not: null } }, orderBy: { createdAt: 'desc' }, select: { cotacaoUsd: true } });
    const valor = ultima?.cotacaoUsd ? Number(ultima.cotacaoUsd) : COTACAO_RESERVA;
    this.logger.warn(`Cotação do dólar indisponível no BCB; usando ${valor} (${ultima ? 'última gravada' : 'reserva'}).`);
    // tenta de novo em 30 minutos
    this.cotacao = { valor, fonte: ultima ? 'última gravada' : 'reserva', obtidaEm: Date.now() - 6 * 3600_000 + 30 * 60_000 };
    return this.cotacao;
  }

  /** Avisa os gestores no sino ao passar do ponto de aviso e ao atingir o limite (uma vez por mês cada) */
  private async conferirAvisos(escritorioId: string) {
    try {
      const cfg = await this.config(escritorioId);
      if (!cfg.limiteMensalBrl) return;
      const mes = mesAtual();
      const enviados = new Set(cfg.avisosEnviados?.[mes] ?? []);
      const gasto = await this.gastoDoMes(escritorioId, mes);
      const pct = (gasto.brl / cfg.limiteMensalBrl) * 100;
      const novos: Array<{ tipo: string; titulo: string; mensagem: string; prioridade: string }> = [];
      const valor = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
      if (pct >= 100 && !enviados.has('LIMITE')) {
        novos.push({
          tipo: 'LIMITE', prioridade: 'alta', titulo: 'Limite de gasto com a IA atingido',
          mensagem: `O gasto do mês chegou a ${valor(gasto.brl)} (limite ${valor(cfg.limiteMensalBrl)}). ` +
            'A conversa com clientes no WhatsApp continua; peças, simulações e demais tarefas pesadas estão pausadas até você liberar em Configurações → IA.',
        });
      } else if (cfg.avisoPercentual && pct >= cfg.avisoPercentual && !enviados.has('AVISO') && !enviados.has('LIMITE')) {
        novos.push({
          tipo: 'AVISO', prioridade: 'normal', titulo: `Gasto com a IA passou de ${cfg.avisoPercentual}% do limite`,
          mensagem: `O gasto do mês está em ${valor(gasto.brl)} de ${valor(cfg.limiteMensalBrl)} (${Math.floor(pct)}%).`,
        });
      }
      if (!novos.length) return;
      const gestores = await this.prisma.usuario.findMany({ where: { escritorioId, ativo: true }, select: { id: true, roles: true } });
      const alvo = gestores.filter((u) => String(u.roles ?? '').split(',').map((r) => r.trim().toUpperCase()).some((r) => (PERFIS_GESTAO as string[]).includes(r)));
      for (const n of novos) {
        for (const u of alvo) {
          await this.prisma.notificacao.create({
            data: { tipo: 'IA_LIMITE', titulo: n.titulo, mensagem: n.mensagem, prioridade: n.prioridade, link: '/configuracoes/ia', usuarioId: u.id, escritorioId, dados: { mes, gastoBrl: r2(gasto.brl), limiteMensalBrl: cfg.limiteMensalBrl } },
          });
        }
        enviados.add(n.tipo);
      }
      cfg.avisosEnviados = { ...cfg.avisosEnviados, [mes]: Array.from(enviados) };
      await this.gravarConfig(escritorioId, cfg);
    } catch (e: any) {
      this.logger.error(`Falha ao conferir avisos de gasto da IA: ${e?.message ?? e}`);
    }
  }
}
