/**
 * JURYSONE — Cota-parte, ficha financeira do processo e repasses
 *
 * Regra do escritório (levantamento de 07/11/2026):
 *   base       = valor pago − taxa do meio de pagamento − imposto (alíquota fixa sobre o valor pago)
 *   percentual = definido por papel no processo × tipo de honorário
 *                (INDICACAO 25% e PARTICIPACAO 50% por padrão; quem tem os dois papéis fica com o MAIOR)
 *   repasse    = mensal, com fechamento manual feito pelo administrador
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ehParceiro } from '../../common/perfis';

export const PAPEIS = ['INDICACAO', 'PARTICIPACAO'] as const;
export const TIPOS_HONORARIO = [
  'TODOS', 'FIXO', 'EXITO', 'SUCUMBENCIA', 'MENSALIDADE', 'POR_ATO', 'DATIVA',
] as const;

/** Percentuais padrão quando o escritório ainda não cadastrou regras */
export const PERCENTUAL_PADRAO: Record<string, number> = { INDICACAO: 25, PARTICIPACAO: 50 };

const STATUS_RECEBIDO = ['pago', 'confirmado'];
const CHAVE_ALIQUOTA = 'cota_parte.aliquota_imposto';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));

export interface RegraLite {
  usuarioId: string | null;
  parceiroId: string | null;
  papel: string;
  tipoHonorario: string;
  percentual: any;
}

export interface ParticipacaoLite {
  usuarioId: string | null;
  parceiroId: string | null;
  papel: string;
  percentualCustom: any;
}

export function chaveBeneficiario(p: { usuarioId?: string | null; parceiroId?: string | null }) {
  return p.usuarioId ? `u:${p.usuarioId}` : `p:${p.parceiroId}`;
}

/** Percentual de UMA participação, do mais específico para o mais genérico */
export function resolverPercentual(regras: RegraLite[], part: ParticipacaoLite, tipoHonorario: string | null): number {
  if (part.percentualCustom !== null && part.percentualCustom !== undefined) return num(part.percentualCustom);
  const tipo = (tipoHonorario || 'TODOS').toUpperCase();
  const doBenef = (r: RegraLite) =>
    (part.usuarioId && r.usuarioId === part.usuarioId) || (part.parceiroId && r.parceiroId === part.parceiroId);
  const padrao = (r: RegraLite) => !r.usuarioId && !r.parceiroId;
  const candidatos: ((r: RegraLite) => boolean)[] = [
    (r) => !!doBenef(r) && r.papel === part.papel && r.tipoHonorario === tipo,
    (r) => !!doBenef(r) && r.papel === part.papel && r.tipoHonorario === 'TODOS',
    (r) => padrao(r) && r.papel === part.papel && r.tipoHonorario === tipo,
    (r) => padrao(r) && r.papel === part.papel && r.tipoHonorario === 'TODOS',
  ];
  for (const filtro of candidatos) {
    const achou = regras.find(filtro);
    if (achou) return num(achou.percentual);
  }
  return PERCENTUAL_PADRAO[part.papel] ?? 0;
}

/** Calcula a cota de cada beneficiário sobre um recebimento */
export function calcularCotas(
  lanc: { valor: any; taxaGateway: any; tipoHonorario: string | null },
  participacoes: ParticipacaoLite[],
  regras: RegraLite[],
  aliquota: number,
) {
  const valorBruto = r2(num(lanc.valor));
  const taxa = r2(num(lanc.taxaGateway));
  const imposto = r2(valorBruto * aliquota / 100);
  const base = r2(Math.max(0, valorBruto - taxa - imposto));

  // Agrupa por beneficiário e fica com o MAIOR percentual entre os papéis dele
  const porBenef = new Map<string, { usuarioId: string | null; parceiroId: string | null; papel: string; percentual: number }>();
  for (const p of participacoes) {
    const key = chaveBeneficiario(p);
    const percentual = resolverPercentual(regras, p, lanc.tipoHonorario);
    const atual = porBenef.get(key);
    if (!atual || percentual > atual.percentual) {
      porBenef.set(key, { usuarioId: p.usuarioId, parceiroId: p.parceiroId, papel: p.papel, percentual });
    }
  }

  return [...porBenef.entries()].map(([beneficiarioKey, b]) => ({
    beneficiarioKey,
    usuarioId: b.usuarioId,
    parceiroId: b.parceiroId,
    papel: b.papel,
    percentual: b.percentual,
    valorBruto, taxaGateway: taxa, imposto, base,
    valor: r2(base * b.percentual / 100),
  }));
}

@Injectable()
export class CotaParteService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Configuração ─────────────────────────────────────────────────────────

  async getAliquota(escritorioId: string): Promise<{ percentual: number; configurada: boolean }> {
    const cfg = await this.prisma.configuracao.findUnique({
      where: { escritorioId_chave: { escritorioId, chave: CHAVE_ALIQUOTA } },
    });
    const percentual = num((cfg?.valor as any)?.percentual);
    return { percentual, configurada: !!cfg };
  }

  async setAliquota(escritorioId: string, percentual: any) {
    const p = Number(percentual);
    if (!Number.isFinite(p) || p < 0 || p > 100) throw new BadRequestException('Alíquota deve estar entre 0 e 100.');
    await this.prisma.configuracao.upsert({
      where: { escritorioId_chave: { escritorioId, chave: CHAVE_ALIQUOTA } },
      update: { valor: { percentual: p } },
      create: { escritorioId, chave: CHAVE_ALIQUOTA, valor: { percentual: p }, tipo: 'financeiro' },
    });
    return { percentual: p, configurada: true };
  }

  // ── Regras de percentual ─────────────────────────────────────────────────

  listarRegras(escritorioId: string) {
    return this.prisma.regraCotaParte.findMany({ where: { escritorioId }, orderBy: { createdAt: 'asc' } });
  }

  private validarRegra(dto: any) {
    const papel = String(dto.papel ?? '').toUpperCase();
    const tipo = String(dto.tipoHonorario ?? 'TODOS').toUpperCase();
    const percentual = Number(dto.percentual);
    if (!PAPEIS.includes(papel as any)) throw new BadRequestException(`Papel inválido. Use: ${PAPEIS.join(', ')}`);
    if (!TIPOS_HONORARIO.includes(tipo as any)) throw new BadRequestException(`Tipo de honorário inválido. Use: ${TIPOS_HONORARIO.join(', ')}`);
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) throw new BadRequestException('Percentual deve estar entre 0 e 100.');
    if (dto.usuarioId && dto.parceiroId) throw new BadRequestException('Informe usuário OU parceiro, não os dois.');
    return { papel, tipoHonorario: tipo, percentual };
  }

  private async validarBeneficiario(escritorioId: string, usuarioId?: string, parceiroId?: string) {
    if (usuarioId) {
      const u = await this.prisma.usuario.findFirst({ where: { id: usuarioId, escritorioId }, select: { id: true } });
      if (!u) throw new BadRequestException('Usuário não encontrado neste escritório.');
    }
    if (parceiroId) {
      const p = await this.prisma.parceiro.findFirst({ where: { id: parceiroId, escritorioId }, select: { id: true } });
      if (!p) throw new BadRequestException('Parceiro não encontrado neste escritório.');
    }
  }

  async criarRegra(escritorioId: string, dto: any) {
    const v = this.validarRegra(dto);
    await this.validarBeneficiario(escritorioId, dto.usuarioId, dto.parceiroId);
    return this.prisma.regraCotaParte.create({
      data: { escritorioId, usuarioId: dto.usuarioId ?? null, parceiroId: dto.parceiroId ?? null, ...v },
    });
  }

  async atualizarRegra(escritorioId: string, id: string, dto: any) {
    const regra = await this.prisma.regraCotaParte.findFirst({ where: { id, escritorioId } });
    if (!regra) throw new NotFoundException('Regra não encontrada');
    const v = this.validarRegra({ ...regra, percentual: num(regra.percentual), ...dto });
    return this.prisma.regraCotaParte.update({ where: { id }, data: v });
  }

  async removerRegra(escritorioId: string, id: string) {
    const regra = await this.prisma.regraCotaParte.findFirst({ where: { id, escritorioId } });
    if (!regra) throw new NotFoundException('Regra não encontrada');
    await this.prisma.regraCotaParte.delete({ where: { id } });
    return { message: 'Regra removida' };
  }

  // ── Participações no processo ────────────────────────────────────────────

  private async assertProcesso(escritorioId: string, processoId: string) {
    const p = await this.prisma.processo.findFirst({
      where: { id: processoId, escritorioId, deletedAt: null },
      include: { cliente: { select: { id: true, nome: true } } },
    });
    if (!p) throw new NotFoundException('Processo não encontrado');
    return p;
  }

  async listarParticipacoes(escritorioId: string, processoId: string) {
    await this.assertProcesso(escritorioId, processoId);
    return this.prisma.participacaoProcesso.findMany({ where: { escritorioId, processoId }, orderBy: { createdAt: 'asc' } });
  }

  async adicionarParticipacao(escritorioId: string, processoId: string, dto: any) {
    await this.assertProcesso(escritorioId, processoId);
    const papel = String(dto.papel ?? '').toUpperCase();
    if (!PAPEIS.includes(papel as any)) throw new BadRequestException(`Papel inválido. Use: ${PAPEIS.join(', ')}`);
    if (!dto.usuarioId === !dto.parceiroId) throw new BadRequestException('Informe usuário OU parceiro.');
    await this.validarBeneficiario(escritorioId, dto.usuarioId, dto.parceiroId);
    let percentualCustom: number | null = null;
    if (dto.percentualCustom !== undefined && dto.percentualCustom !== null && dto.percentualCustom !== '') {
      percentualCustom = Number(dto.percentualCustom);
      if (!Number.isFinite(percentualCustom) || percentualCustom < 0 || percentualCustom > 100) {
        throw new BadRequestException('Percentual deve estar entre 0 e 100.');
      }
    }
    const duplicada = await this.prisma.participacaoProcesso.findFirst({
      where: { escritorioId, processoId, papel, usuarioId: dto.usuarioId ?? null, parceiroId: dto.parceiroId ?? null },
    });
    if (duplicada) throw new BadRequestException('Esta pessoa já tem este papel neste processo.');
    return this.prisma.participacaoProcesso.create({
      data: {
        escritorioId, processoId, papel,
        usuarioId: dto.usuarioId ?? null,
        parceiroId: dto.parceiroId ?? null,
        percentualCustom,
        observacao: dto.observacao,
      },
    });
  }

  async removerParticipacao(escritorioId: string, id: string) {
    const p = await this.prisma.participacaoProcesso.findFirst({ where: { id, escritorioId } });
    if (!p) throw new NotFoundException('Participação não encontrada');
    await this.prisma.participacaoProcesso.delete({ where: { id } });
    return { message: 'Participação removida' };
  }

  // ── Cálculo dos itens em aberto ──────────────────────────────────────────

  /**
   * Recebimentos já pagos (até `ate`) ainda não incluídos em fechamento, com a cota de cada beneficiário.
   * `somente` filtra por beneficiário ("u:<id>" ou "p:<id>").
   */
  async calcularAbertos(escritorioId: string, ate?: Date, somente?: string) {
    const limite = ate ?? new Date();
    const lancamentos = await this.prisma.lancamentoFinanceiro.findMany({
      where: {
        escritorioId,
        deletedAt: null,
        tipo: 'receita',
        status: { in: STATUS_RECEBIDO },
        OR: [{ paidAt: { lte: limite } }, { paidAt: null, data: { lte: limite } }],
        AND: [{ OR: [{ processoId: { not: null } }, { atendimento: { processoId: { not: null } } }] },
          // Honorários da dativa são só do advogado nomeado: fora da cota-parte (decisão 106)
          { OR: [{ tipoHonorario: null }, { tipoHonorario: { not: 'DATIVA' } }] }],
      },
      include: {
        atendimento: { select: { processoId: true } },
        cliente: { select: { id: true, nome: true } },
        itensRepasse: { select: { beneficiarioKey: true } },
      },
      orderBy: { paidAt: 'asc' },
    });

    const processoIds = [...new Set(lancamentos.map((l) => l.processoId ?? l.atendimento?.processoId).filter(Boolean))] as string[];
    const [participacoes, regras, aliquota, processos] = await Promise.all([
      this.prisma.participacaoProcesso.findMany({ where: { escritorioId, processoId: { in: processoIds } } }),
      this.prisma.regraCotaParte.findMany({ where: { escritorioId } }),
      this.getAliquota(escritorioId),
      this.prisma.processo.findMany({ where: { id: { in: processoIds } }, select: { id: true, numero: true, titulo: true } }),
    ]);
    const procPorId = new Map(processos.map((p) => [p.id, p]));

    const itens: any[] = [];
    for (const l of lancamentos) {
      const processoId = (l.processoId ?? l.atendimento?.processoId) as string;
      const parts = participacoes.filter((p) => p.processoId === processoId);
      if (parts.length === 0) continue;
      const jaFechados = new Set(l.itensRepasse.map((i) => i.beneficiarioKey));
      for (const c of calcularCotas(l, parts, regras, aliquota.percentual)) {
        if (jaFechados.has(c.beneficiarioKey)) continue;
        if (somente && c.beneficiarioKey !== somente) continue;
        itens.push({
          ...c,
          lancamentoId: l.id,
          descricao: l.descricao,
          tipoHonorario: l.tipoHonorario,
          pagoEm: l.paidAt ?? l.data,
          cliente: l.cliente,
          processo: procPorId.get(processoId) ?? { id: processoId },
        });
      }
    }
    return { aliquota, itens };
  }

  private async nomesBeneficiarios(escritorioId: string, keys: string[]) {
    const uIds = keys.filter((k) => k.startsWith('u:')).map((k) => k.slice(2));
    const pIds = keys.filter((k) => k.startsWith('p:')).map((k) => k.slice(2));
    const [us, ps] = await Promise.all([
      this.prisma.usuario.findMany({ where: { escritorioId, id: { in: uIds } }, select: { id: true, nome: true } }),
      this.prisma.parceiro.findMany({ where: { escritorioId, id: { in: pIds } }, select: { id: true, nome: true } }),
    ]);
    const mapa = new Map<string, string>();
    us.forEach((u) => mapa.set(`u:${u.id}`, u.nome));
    ps.forEach((p) => mapa.set(`p:${p.id}`, `${p.nome} (parceiro)`));
    return mapa;
  }

  private agrupar(itens: any[], nomes: Map<string, string>) {
    const grupos = new Map<string, any>();
    for (const i of itens) {
      const g = grupos.get(i.beneficiarioKey) ?? {
        beneficiarioKey: i.beneficiarioKey,
        nome: nomes.get(i.beneficiarioKey) ?? i.beneficiarioKey,
        total: 0,
        itens: [] as any[],
      };
      g.total = r2(g.total + num(i.valor));
      g.itens.push(i);
      grupos.set(i.beneficiarioKey, g);
    }
    return [...grupos.values()].sort((a, b) => b.total - a.total);
  }

  /** Prévia do que entraria num fechamento agora (ou até a data informada) */
  async previa(escritorioId: string, ate?: string) {
    const { aliquota, itens } = await this.calcularAbertos(escritorioId, ate ? new Date(ate) : undefined);
    const nomes = await this.nomesBeneficiarios(escritorioId, [...new Set(itens.map((i) => i.beneficiarioKey))]);
    return { aliquota, beneficiarios: this.agrupar(itens, nomes), totalGeral: r2(itens.reduce((s, i) => s + i.valor, 0)) };
  }

  // ── Fechamento e repasse ─────────────────────────────────────────────────

  async fechar(escritorioId: string, ateStr: string | undefined, criadoPorId: string) {
    const ate = ateStr ? new Date(ateStr) : new Date();
    if (Number.isNaN(ate.getTime())) throw new BadRequestException('Data inválida.');
    const { aliquota, itens } = await this.calcularAbertos(escritorioId, ate);
    if (!aliquota.configurada) {
      throw new BadRequestException('Configure a alíquota de imposto antes de fechar o período.');
    }
    if (itens.length === 0) throw new BadRequestException('Não há valores em aberto para fechar até esta data.');

    return this.prisma.$transaction(async (tx) => {
      const fechamento = await tx.fechamentoRepasse.create({
        data: { escritorioId, ate, aliquotaImposto: aliquota.percentual, criadoPorId },
      });
      await tx.itemRepasse.createMany({
        data: itens.map((i) => ({
          escritorioId,
          fechamentoId: fechamento.id,
          lancamentoId: i.lancamentoId,
          beneficiarioKey: i.beneficiarioKey,
          usuarioId: i.usuarioId,
          parceiroId: i.parceiroId,
          papel: i.papel,
          percentual: i.percentual,
          valorBruto: i.valorBruto,
          taxaGateway: i.taxaGateway,
          imposto: i.imposto,
          base: i.base,
          valor: i.valor,
        })),
      });
      return { ...fechamento, quantidadeItens: itens.length, total: r2(itens.reduce((s, i) => s + i.valor, 0)) };
    });
  }

  listarFechamentos(escritorioId: string) {
    return this.prisma.fechamentoRepasse.findMany({
      where: { escritorioId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { itens: true } } },
    });
  }

  async detalheFechamento(escritorioId: string, id: string) {
    const f = await this.prisma.fechamentoRepasse.findFirst({
      where: { id, escritorioId },
      include: {
        itens: {
          include: {
            lancamento: {
              select: {
                descricao: true, paidAt: true, tipoHonorario: true, processoId: true,
                cliente: { select: { nome: true } },
                processo: { select: { numero: true } },
              },
            },
          },
        },
      },
    });
    if (!f) throw new NotFoundException('Fechamento não encontrado');
    const nomes = await this.nomesBeneficiarios(escritorioId, [...new Set(f.itens.map((i) => i.beneficiarioKey))]);
    const itens = f.itens.map((i) => ({ ...i, valor: num(i.valor), percentual: num(i.percentual) }));
    return { ...f, itens: undefined, beneficiarios: this.agrupar(itens, nomes) };
  }

  async marcarRepassado(escritorioId: string, fechamentoId: string, dto: any) {
    if (!dto?.beneficiarioKey) throw new BadRequestException('Informe o beneficiário (beneficiarioKey).');
    const r = await this.prisma.itemRepasse.updateMany({
      where: { escritorioId, fechamentoId, beneficiarioKey: dto.beneficiarioKey, repassadoEm: null },
      data: { repassadoEm: dto.repassadoEm ? new Date(dto.repassadoEm) : new Date(), comprovanteUrl: dto.comprovanteUrl ?? null },
    });
    if (r.count === 0) throw new NotFoundException('Nada pendente de repasse para este beneficiário neste fechamento.');
    return { message: 'Repasse registrado', itens: r.count };
  }

  // ── Visão do próprio beneficiário (associado ou parceiro) ───────────────

  async minhaCota(escritorioId: string, user: any) {
    const key = ehParceiro(user) ? `p:${user.parceiroId ?? '__sem_parceiro__'}` : `u:${user.id}`;
    const { aliquota, itens: abertos } = await this.calcularAbertos(escritorioId, undefined, key);
    const fechados = await this.prisma.itemRepasse.findMany({
      where: { escritorioId, beneficiarioKey: key },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        fechamento: { select: { id: true, ate: true } },
        lancamento: {
          select: {
            descricao: true, paidAt: true, tipoHonorario: true,
            cliente: { select: { nome: true } },
            processo: { select: { numero: true } },
          },
        },
      },
    });
    const aReceber = fechados.filter((i) => !i.repassadoEm);
    return {
      aliquota,
      emApuracao: { total: r2(abertos.reduce((s, i) => s + i.valor, 0)), itens: abertos },
      disponivelParaRepasse: { total: r2(aReceber.reduce((s, i) => s + num(i.valor), 0)), itens: aReceber },
      repassados: fechados.filter((i) => i.repassadoEm),
    };
  }

  // ── Ficha financeira do processo ─────────────────────────────────────────

  async fichaFinanceira(escritorioId: string, processoId: string) {
    const processo = await this.assertProcesso(escritorioId, processoId);
    const [lancamentos, atendimentos, participacoes, regras, aliquota] = await Promise.all([
      this.prisma.lancamentoFinanceiro.findMany({
        where: { escritorioId, deletedAt: null, OR: [{ processoId }, { atendimento: { processoId } }] },
        orderBy: { vencimento: 'asc' },
      }),
      this.prisma.atendimento.findMany({
        where: { escritorioId, processoId },
        select: { id: true, tipoHonorario: true, valorHonorario: true, percentualExito: true, formaPagamento: true, numParcelas: true },
      }),
      this.prisma.participacaoProcesso.findMany({ where: { escritorioId, processoId } }),
      this.prisma.regraCotaParte.findMany({ where: { escritorioId } }),
      this.getAliquota(escritorioId),
    ]);

    const agora = new Date();
    const receitas = lancamentos.filter((l) => l.tipo === 'receita' && l.status !== 'cancelado');
    const recebidas = receitas.filter((l) => STATUS_RECEBIDO.includes(l.status));
    const atrasadas = receitas.filter((l) => !STATUS_RECEBIDO.includes(l.status) && (l.status === 'vencido' || (l.vencimento && l.vencimento < agora)));
    const aReceber = receitas.filter((l) => !STATUS_RECEBIDO.includes(l.status));
    const despesas = lancamentos.filter((l) => l.tipo === 'despesa' && l.status !== 'cancelado');
    const soma = (ls: any[]) => r2(ls.reduce((s, l) => s + num(l.valor), 0));

    const nomes = await this.nomesBeneficiarios(escritorioId, [...new Set(participacoes.map(chaveBeneficiario))]);
    const cotasRecebidas = new Map<string, number>();
    for (const l of recebidas) {
      for (const c of calcularCotas(l, participacoes, regras, aliquota.percentual)) {
        cotasRecebidas.set(c.beneficiarioKey, r2((cotasRecebidas.get(c.beneficiarioKey) ?? 0) + c.valor));
      }
    }

    return {
      processo: { id: processo.id, numero: processo.numero, titulo: processo.titulo, cliente: processo.cliente },
      contratado: atendimentos,
      resumo: {
        recebido: soma(recebidas),
        aReceber: soma(aReceber),
        emAtraso: soma(atrasadas),
        despesas: soma(despesas),
        resultado: r2(soma(recebidas) - soma(despesas)),
      },
      participacoes: participacoes.map((p) => ({
        ...p,
        nome: nomes.get(chaveBeneficiario(p)) ?? null,
        cotaSobreRecebido: cotasRecebidas.get(chaveBeneficiario(p)) ?? 0,
      })),
      aliquota,
      lancamentos,
    };
  }
}
