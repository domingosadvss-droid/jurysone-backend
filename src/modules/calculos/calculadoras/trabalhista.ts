/**
 * Estimativa trabalhista — lado do empregado (decisões 140 e 141; rodada 3)
 *
 * Pedidos combinados, cada um com chance ALTA, MEDIA ou BAIXA; totais otimista, realista e pessimista
 * com pesos configuráveis e os 30% de honorários de êxito descontados para o cliente.
 * Correção (ADC 58 do STF e E-ED-RR 713-03.2010.5.04.0029 do TST):
 *   antes da ação → IPCA-E + juros equivalentes à TRD (art. 39, caput, da Lei 8.177/91);
 *   do ajuizamento até ago/2024 → Selic (juros e correção juntos);
 *   desde set/2024 → IPCA + taxa legal (Selic − IPCA, mínimo zero; art. 406 do CC).
 */
import * as z from 'zod/v4';
import {
  Contexto, Linha, RefLinha, Resultado, bloco, competencia, dataBr, diasEntre, fatorCorrecao, finalizar, hojeIso,
  jurosPeriodo, maxData, minData, moeda, pct, r2, r6, somaSerie, somarAnosIso, somarDiasIso, somarMesesIso,
} from '../nucleo';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Opc = <T extends z.ZodType>(t: T) => t.nullable().optional();

export const TIPOS_PEDIDO = [
  'SALDO_SALARIO', 'AVISO_PREVIO', 'DECIMO_TERCEIRO', 'FERIAS_PROPORCIONAIS', 'FERIAS_VENCIDAS', 'FGTS', 'MULTA_FGTS_40',
  'MULTA_477', 'MULTA_467', 'HORAS_EXTRAS', 'ADICIONAL_INSALUBRIDADE', 'ADICIONAL_PERICULOSIDADE', 'ADICIONAL_NOTURNO',
  'DANO_MORAL', 'OUTRO',
] as const;

export const TrabalhistaParams = z.object({
  salario: z.number().positive(),
  dataAdmissao: Data,
  dataDemissao: Data,
  motivo: z.enum(['SEM_JUSTA_CAUSA', 'RESCISAO_INDIRETA', 'PEDIDO_DEMISSAO', 'JUSTA_CAUSA', 'ACORDO_484A']).default('SEM_JUSTA_CAUSA'),
  ajuizamentoEm: Opc(Data).describe('Data do ajuizamento (vazio = data do cálculo)'),
  dataCalculo: Opc(Data),
  salarioMinimo: Opc(z.number().positive()),
  divisorHoras: z.number().positive().default(220),
  exitoPct: z.number().min(0).max(100).default(30),
  pesos: z.object({
    ALTA: z.tuple([z.number(), z.number(), z.number()]).default([1, 0.9, 0.7]),
    MEDIA: z.tuple([z.number(), z.number(), z.number()]).default([1, 0.5, 0.2]),
    BAIXA: z.tuple([z.number(), z.number(), z.number()]).default([1, 0.1, 0]),
  }).default({ ALTA: [1, 0.9, 0.7], MEDIA: [1, 0.5, 0.2], BAIXA: [1, 0.1, 0] }),
  pedidos: z.array(z.object({
    tipo: z.enum(TIPOS_PEDIDO),
    chance: z.enum(['ALTA', 'MEDIA', 'BAIXA']).default('MEDIA'),
    descricao: Opc(z.string()),
    valor: Opc(z.number().min(0)).describe('Valor fixo (dano moral, outro) ou valor já apurado'),
    horasMes: Opc(z.number().min(0)),
    adicionalPct: Opc(z.number().min(0)),
    grauPct: Opc(z.number().min(0)).describe('Insalubridade: 10, 20 ou 40'),
    inicio: Opc(Data), fim: Opc(Data),
    quantidade: Opc(z.number().min(0)).describe('Férias vencidas: número de períodos; FGTS: meses sem depósito'),
    emDobro: Opc(z.boolean()),
    saldoFgts: Opc(z.number().min(0)),
    fatorReflexos: Opc(z.number().min(0)).describe('Horas extras: reflexos em DSR, 13º, férias e FGTS (padrão 0,5)'),
  })).min(1),
});
export type TrabalhistaParams = z.infer<typeof TrabalhistaParams>;

const NOMES: Record<string, string> = {
  SALDO_SALARIO: 'Saldo de salário', AVISO_PREVIO: 'Aviso prévio indenizado', DECIMO_TERCEIRO: '13º salário proporcional',
  FERIAS_PROPORCIONAIS: 'Férias proporcionais + 1/3', FERIAS_VENCIDAS: 'Férias vencidas + 1/3', FGTS: 'FGTS não depositado',
  MULTA_FGTS_40: 'Multa de 40% do FGTS', MULTA_477: 'Multa do art. 477 da CLT', MULTA_467: 'Multa do art. 467 da CLT',
  HORAS_EXTRAS: 'Horas extras e reflexos', ADICIONAL_INSALUBRIDADE: 'Adicional de insalubridade', ADICIONAL_PERICULOSIDADE: 'Adicional de periculosidade',
  ADICIONAL_NOTURNO: 'Adicional noturno', DANO_MORAL: 'Danos morais', OUTRO: 'Outro pedido',
};
const RECORRENTES = ['HORAS_EXTRAS', 'ADICIONAL_INSALUBRIDADE', 'ADICIONAL_PERICULOSIDADE', 'ADICIONAL_NOTURNO'];

/** Atualização trabalhista de um valor vencido em `venc`, com a ação ajuizada em `ajuiz` */
export function atualizarTrabalhista(ctx: Contexto, valor: number, venc: string, ajuiz: string, base: string) {
  const fimPre = minData(ajuiz, base);
  const f1 = venc < fimPre ? fatorCorrecao(ctx, 'IPCAE', venc, fimPre) : { fator: 1, de: null, ate: null, meses: 0 };
  const trd = venc < fimPre ? somaSerie(ctx, 'TR', venc, fimPre) : { percentual: 0, de: null, ate: null, meses: 0 };
  const iniJud = maxData(venc, ajuiz);
  const corte = '2024-09-01';
  const fimSelic = minData(corte, base);
  const selic = iniJud < fimSelic ? somaSerie(ctx, 'SELIC', iniJud, fimSelic) : { percentual: 0, de: null, ate: null, meses: 0 };
  const ini3 = maxData(iniJud, corte);
  const f3 = ini3 < base ? fatorCorrecao(ctx, 'IPCA', ini3, base) : { fator: 1, de: null, ate: null, meses: 0 };
  const jl = ini3 < base ? jurosPeriodo(ctx, ini3, base) : { percentual: 0, de: null, ate: null, meses: 0 };
  const atualizado = valor * f1.fator * (1 + trd.percentual / 100) * (1 + selic.percentual / 100) * f3.fator * (1 + jl.percentual / 100);
  return {
    f1: r6(f1.fator), trd: r6(trd.percentual), selic: r6(selic.percentual), f3: r6(f3.fator), jl: r6(jl.percentual), atualizado: r2(atualizado),
    _ref: {
      f1: { tipo: 'fator', indice: 'IPCAE', de: f1.de, ate: f1.ate }, trd: { tipo: 'soma', serie: 'TR', de: trd.de, ate: trd.ate },
      selic: { tipo: 'soma', serie: 'SELIC', de: selic.de, ate: selic.ate }, f3: { tipo: 'fator', indice: 'IPCA', de: f3.de, ate: f3.ate },
      jl: { tipo: 'soma', serie: 'JUROS_LEGAL', de: jl.de, ate: jl.ate },
    } as RefLinha,
  };
}

function mesesFracao(ini: string, fim: string) {
  // meses com 15 dias ou mais contam como mês inteiro (Lei 4.090/62; art. 146, parágrafo único, da CLT)
  let m = 0; let c = ini;
  while (c <= fim) {
    const prox = somarMesesIso(c, 1);
    const dias = diasEntre(c, prox <= fim ? prox : somarDiasIso(fim, 1));
    if (dias >= 15) m++;
    c = prox;
  }
  return Math.min(12, m);
}

export function calcularTrabalhista(ctx: Contexto, p: TrabalhistaParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const ajuiz = p.ajuizamentoEm ?? base;
  const avisos: string[] = [];
  const dem = p.dataDemissao;
  const vencResc = somarDiasIso(dem, 10);
  const anos = Math.floor(diasEntre(p.dataAdmissao, dem) / 365.25);
  const diasAviso = Math.min(90, 30 + 3 * anos);
  const temAviso = ['SEM_JUSTA_CAUSA', 'RESCISAO_INDIRETA', 'ACORDO_484A'].includes(p.motivo);
  const projecao = temAviso ? somarDiasIso(dem, diasAviso) : dem;
  const sDia = p.salario / 30;
  const limitePrescricao = somarAnosIso(ajuiz, -5);

  if (ajuiz > somarAnosIso(dem, 2)) avisos.push(`PRESCRIÇÃO BIENAL: ação ajuizada (ou projetada) mais de 2 anos após o fim do contrato (${dataBr(dem)}) — art. 7º, XXIX, da CF.`);
  if (p.motivo === 'JUSTA_CAUSA') avisos.push('Justa causa: aviso, 13º e férias proporcionais e multa de 40% só são devidos se a justa causa for revertida.');
  if (!p.ajuizamentoEm) avisos.push('Data de ajuizamento não informada: usada a data do cálculo (prescrição quinquenal e fases de correção projetadas).');

  const linhasTab: any[] = [];
  const porPedido: Array<{ rotulo: string; chance: 'ALTA' | 'MEDIA' | 'BAIXA'; total: number }> = [];
  let rescisoriasNominal = 0;

  const add = (pedidoIdx: number, rotulo: string, venc: string, valor: number) => {
    if (valor <= 0) return 0;
    const a = atualizarTrabalhista(ctx, valor, venc, ajuiz, base);
    linhasTab.push({ pedido: rotulo, data: venc, valor: r2(valor), ...a });
    return a.atualizado;
  };

  p.pedidos.forEach((pd, idx) => {
    const rot = pd.descricao ? `${NOMES[pd.tipo]} — ${pd.descricao}` : NOMES[pd.tipo];
    let total = 0;
    const valorHora = p.salario / p.divisorHoras;
    if (RECORRENTES.includes(pd.tipo)) {
      const ini = maxData(pd.inicio ?? p.dataAdmissao, limitePrescricao, p.dataAdmissao);
      const fim = minData(pd.fim ?? dem, dem);
      if ((pd.inicio ?? p.dataAdmissao) < limitePrescricao) avisos.push(`${rot}: período anterior a ${dataBr(limitePrescricao)} atingido pela prescrição quinquenal.`);
      let mensal = 0;
      if (pd.tipo === 'HORAS_EXTRAS') mensal = (pd.horasMes ?? 0) * valorHora * (1 + (pd.adicionalPct ?? 50) / 100) * (1 + (pd.fatorReflexos ?? 0.5));
      if (pd.tipo === 'ADICIONAL_NOTURNO') mensal = (pd.horasMes ?? 0) * valorHora * (pd.adicionalPct ?? 20) / 100;
      if (pd.tipo === 'ADICIONAL_PERICULOSIDADE') mensal = p.salario * 0.3;
      if (pd.tipo === 'ADICIONAL_INSALUBRIDADE') {
        if (!p.salarioMinimo) avisos.push('Insalubridade: informe o salário mínimo (base de cálculo).');
        mensal = (p.salarioMinimo ?? 0) * (pd.grauPct ?? 20) / 100;
      }
      if (pd.valor != null) mensal = pd.valor;
      for (let c = ini.slice(0, 8) + '01'; c <= fim; c = somarMesesIso(c, 1)) {
        const iniMes = maxData(c, ini); const fimMes = minData(somarDiasIso(somarMesesIso(c, 1), -1), fim);
        const frac = Math.min(1, (diasEntre(iniMes, fimMes) + 1) / 30);
        total += add(idx, `${rot} (${competencia(c).split('-').reverse().join('/')})`, somarDiasIso(somarMesesIso(c, 1), 4), mensal * frac);
      }
    } else {
      let v = 0; let venc = vencResc;
      switch (pd.tipo) {
        case 'SALDO_SALARIO': v = pd.valor ?? sDia * Number(dem.slice(8, 10)); break;
        case 'AVISO_PREVIO': v = pd.valor ?? (temAviso ? sDia * diasAviso * (p.motivo === 'ACORDO_484A' ? 0.5 : 1) : 0); break;
        case 'DECIMO_TERCEIRO': {
          const iniAno = maxData(`${projecao.slice(0, 4)}-01-01`, p.dataAdmissao);
          v = pd.valor ?? (p.salario / 12) * mesesFracao(iniAno, projecao); break;
        }
        case 'FERIAS_PROPORCIONAIS': {
          let iniAq = p.dataAdmissao; while (somarAnosIso(iniAq, 1) <= projecao) iniAq = somarAnosIso(iniAq, 1);
          v = pd.valor ?? (p.salario / 12) * mesesFracao(iniAq, projecao) * 4 / 3; break;
        }
        case 'FERIAS_VENCIDAS': v = pd.valor ?? p.salario * 4 / 3 * (pd.quantidade ?? 1) * (pd.emDobro ? 2 : 1); break;
        case 'FGTS': v = pd.valor ?? p.salario * 0.08 * (pd.quantidade ?? 0); break;
        case 'MULTA_FGTS_40': {
          const meses = Math.max(1, Math.round(diasEntre(p.dataAdmissao, dem) / 30.44));
          v = pd.valor ?? (pd.saldoFgts ?? p.salario * 0.08 * meses) * (p.motivo === 'ACORDO_484A' ? 0.2 : 0.4); break;
        }
        case 'MULTA_477': v = pd.valor ?? p.salario; break;
        case 'MULTA_467': v = pd.valor ?? rescisoriasNominal * 0.5; break;
        case 'DANO_MORAL': case 'OUTRO': v = pd.valor ?? 0; venc = ajuiz; break;
      }
      if (['SALDO_SALARIO', 'AVISO_PREVIO', 'DECIMO_TERCEIRO', 'FERIAS_PROPORCIONAIS', 'FERIAS_VENCIDAS'].includes(pd.tipo)) rescisoriasNominal += v;
      total += add(idx, rot, venc, v);
    }
    porPedido.push({ rotulo: rot, chance: pd.chance, total: r2(total) });
  });

  const cenarios = [['otimista', 'Cenário otimista', 0], ['realista', 'Cenário realista', 1], ['pessimista', 'Cenário pessimista', 2]] as const;
  const blocos = cenarios.map(([id, titulo, k]) => {
    const linhas: Linha[] = porPedido.map((x) => {
      const peso = p.pesos[x.chance][k];
      return { rotulo: `${x.rotulo} — chance ${x.chance.toLowerCase()} (${pct(peso * 100, 0)})`, valor: r2(x.total * peso), formula: `${moeda(x.total)} × ${pct(peso * 100, 0)}` };
    });
    const bruto = r2(linhas.reduce((s, l) => s + l.valor, 0));
    linhas.push({ rotulo: `(−) Honorários contratuais de êxito (${pct(p.exitoPct, 0)})`, valor: -r2(bruto * p.exitoPct / 100), fundamento: 'contrato de honorários: só êxito' });
    return bloco(id, titulo, linhas, { rotuloTotal: 'Líquido estimado para o cliente', subtitulo: `Bruto da condenação estimada: ${moeda(bruto)}`, recomendado: id === 'realista' });
  });

  return finalizar(ctx, {
    tipo: 'TRABALHISTA', titulo: 'Estimativa trabalhista (empregado)', dataBase: base,
    resumo: [
      { rotulo: 'Salário', valor: p.salario }, { rotulo: 'Admissão', valor: dataBr(p.dataAdmissao) }, { rotulo: 'Demissão', valor: dataBr(dem) },
      { rotulo: 'Aviso prévio (dias)', valor: temAviso ? diasAviso : 0 }, { rotulo: 'Ajuizamento', valor: dataBr(ajuiz) },
      ...blocos.map((b) => ({ rotulo: b.titulo + ' (líquido)', valor: b.total.valor })),
    ],
    blocos,
    tabelas: [{
      id: 'verbas', titulo: 'Verbas atualizadas (ADC 58 e TST)', linhas: linhasTab, colunas: [
        { chave: 'pedido', titulo: 'Pedido', tipo: 'texto' }, { chave: 'data', titulo: 'Vencimento', tipo: 'data' },
        { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: true }, { chave: 'f1', titulo: 'Fator IPCA-E (pré-judicial)', tipo: 'fator' },
        { chave: 'trd', titulo: 'TRD % (art. 39)', tipo: 'pct' }, { chave: 'selic', titulo: 'Selic % (até ago/2024)', tipo: 'pct' },
        { chave: 'f3', titulo: 'Fator IPCA (desde set/2024)', tipo: 'fator' }, { chave: 'jl', titulo: 'Taxa legal % (desde set/2024)', tipo: 'pct' },
        { chave: 'atualizado', titulo: 'Atualizado', tipo: 'moeda', formula: '{valor}*{f1}*(1+{trd}/100)*(1+{selic}/100)*{f3}*(1+{jl}/100)', total: true },
      ],
    }],
    avisos,
    fundamentos: ['CLT, arts. 457 a 487', 'Lei 12.506/2011 (aviso proporcional)', 'CF, art. 7º, XXIX (prescrição)', 'ADC 58 e 59 do STF', 'TST, E-ED-RR 713-03.2010.5.04.0029', 'Lei 8.177/91, art. 39', 'CC, art. 406 (Lei 14.905/2024)'],
    destaques: ['Valores brutos, sem descontos de INSS e IR; estimativa para orientar o cliente, não promessa de resultado.'],
    premissas: [
      `Pesos por chance (otimista/realista/pessimista): alta ${p.pesos.ALTA.join('/')}, média ${p.pesos.MEDIA.join('/')}, baixa ${p.pesos.BAIXA.join('/')}.`,
      'Verbas rescisórias vencem 10 dias após o fim do contrato (art. 477, §6º, da CLT); verbas mensais no 5º dia do mês seguinte.',
      `Horas extras com reflexos estimados em ${pct(50, 0)} sobre o principal, salvo fator informado.`,
    ],
    totalPrincipal: blocos[1].total.valor,
  });
}
