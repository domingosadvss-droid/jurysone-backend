/**
 * Atualização de débito (cobrança e cumprimento de sentença) e locação (decisão 142)
 */
import * as z from 'zod/v4';
import {
  Contexto, INDICES_CORRECAO, Linha, Resultado, bloco, dataBr, diasEntre, fatorCorrecao, finalizar, hojeIso, jurosPeriodo,
  moeda, nomeIndice, pct, r2, r6, somarAnosIso, somarDiasIso, somarMesesIso,
} from '../nucleo';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Opc = <T extends z.ZodType>(t: T) => t.nullable().optional();

// ═══════════════════════ ATUALIZAÇÃO DE DÉBITO ═══════════════════════════

/** Prazo prescricional por tipo de título (anos) */
export const PRESCRICAO: Record<string, { anos: number; meses?: number; fundamento: string }> = {
  CONTRATO: { anos: 5, fundamento: 'art. 206, §5º, I, do CC (dívida líquida em instrumento)' },
  NOTA_PROMISSORIA: { anos: 3, fundamento: 'art. 70 da Lei Uniforme (Dec. 57.663/66)' },
  DUPLICATA: { anos: 3, fundamento: 'art. 18, I, da Lei 5.474/68' },
  CHEQUE: { anos: 0, meses: 7, fundamento: 'art. 59 da Lei 7.357/85 (6 meses após o prazo de apresentação); monitória em 5 anos (Súmula 503 do STJ)' },
  ALUGUEL: { anos: 3, fundamento: 'art. 206, §3º, I, do CC' },
  CONDOMINIO: { anos: 5, fundamento: 'art. 206, §5º, I, do CC (Tema 949 do STJ)' },
  SENTENCA: { anos: 5, fundamento: 'Súmula 150 do STF (mesmo prazo da ação); conferir o prazo da pretensão original' },
  ENRIQUECIMENTO: { anos: 3, fundamento: 'art. 206, §3º, IV, do CC' },
  OUTRO: { anos: 10, fundamento: 'art. 205 do CC (prazo geral)' },
};

export const DebitoParams = z.object({
  parcelas: z.array(z.object({ descricao: z.string().default('Parcela'), vencimento: Data, valor: z.number().positive() })).min(1),
  dataCalculo: Opc(Data),
  indice: z.enum(INDICES_CORRECAO).default('LEGAL'),
  juros: z.enum(['LEGAL', 'CONTRATUAL', 'NENHUM']).default('LEGAL'),
  jurosContratuaisPct: Opc(z.number().min(0).max(10)),
  termoJuros: z.enum(['VENCIMENTO', 'CITACAO']).default('VENCIMENTO'),
  citacaoEm: Opc(Data),
  multaContratualPct: z.number().min(0).max(100).default(0),
  honorariosContratuaisPct: z.number().min(0).max(100).default(0),
  cumprimentoSentenca: z.object({ ativo: z.boolean().default(false), intimadoEm: Opc(Data), pagamentoParcial: z.number().min(0).default(0) }).default({ ativo: false, pagamentoParcial: 0 }),
  tipoTitulo: z.enum(Object.keys(PRESCRICAO) as [string, ...string[]]).default('CONTRATO'),
});
export type DebitoParams = z.infer<typeof DebitoParams>;

function somarDiasUteis(dia: string, n: number) {
  let d = dia; let c = 0;
  while (c < n) { d = somarDiasIso(d, 1); const w = new Date(d + 'T12:00:00Z').getUTCDay(); if (w !== 0 && w !== 6) c++; }
  return d;
}

export function calcularDebito(ctx: Contexto, p: DebitoParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const avisos: string[] = [];
  const presc = PRESCRICAO[p.tipoTitulo];
  const linhas: any[] = [];
  let corr = 0; let jur = 0; let nominal = 0;
  for (const pc of [...p.parcelas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))) {
    const f = fatorCorrecao(ctx, p.indice, pc.vencimento, base);
    const c = r2(pc.valor * f.fator);
    const iniJ = p.termoJuros === 'CITACAO' ? p.citacaoEm : pc.vencimento;
    const j = p.juros === 'NENHUM' ? { percentual: 0, de: null, ate: null, meses: 0 } : jurosPeriodo(ctx, iniJ, base, p.juros === 'CONTRATUAL' ? (p.jurosContratuaisPct ?? 1) : null);
    const vj = r2(c * j.percentual / 100);
    const prescreve = somarMesesIso(somarAnosIso(pc.vencimento, presc.anos), presc.meses ?? 0);
    const situacao = prescreve <= base ? 'PRESCRITA' : diasEntre(base, prescreve) <= 90 ? `prescreve em ${diasEntre(base, prescreve)} dias` : '';
    if (prescreve <= base) avisos.push(`ALERTA DE PRESCRIÇÃO: "${pc.descricao}" (venc. ${dataBr(pc.vencimento)}) prescreveu em ${dataBr(prescreve)} — ${presc.fundamento}.`);
    else if (situacao) avisos.push(`ALERTA DE PRESCRIÇÃO: "${pc.descricao}" prescreve em ${dataBr(prescreve)} (${situacao.replace('prescreve em ', '')}).`);
    linhas.push({
      data: pc.vencimento, descricao: pc.descricao, valor: pc.valor, fator: r6(f.fator), corrigido: c, juros: r6(j.percentual), valorJuros: vj,
      total: r2(c + vj), prescricao: prescreve, situacao,
      _ref: { fator: { tipo: 'fator', indice: p.indice, de: f.de, ate: f.ate }, juros: { tipo: 'soma', serie: p.juros === 'CONTRATUAL' ? 'FIXA' : 'JUROS_LEGAL', de: j.de, ate: j.ate, fixa: p.juros === 'CONTRATUAL' ? (p.jurosContratuaisPct ?? 1) : null } },
    });
    corr += c; jur += vj; nominal += pc.valor;
  }
  if (p.termoJuros === 'CITACAO' && !p.citacaoEm) avisos.push('Juros desde a citação, mas a data da citação não foi informada: juros não computados.');
  const l: Linha[] = [
    { rotulo: 'Principal corrigido', valor: corr, formula: nomeIndice(p.indice) },
    { rotulo: `Juros de mora (${p.juros === 'CONTRATUAL' ? pct(p.jurosContratuaisPct ?? 1) + ' a.m. contratuais' : p.juros === 'LEGAL' ? 'taxa legal' : 'sem juros'})`, valor: jur, fundamento: p.termoJuros === 'VENCIMENTO' ? 'art. 397 do CC (mora desde o vencimento)' : 'art. 405 do CC (desde a citação)' },
  ];
  if (p.multaContratualPct) l.push({ rotulo: `Multa contratual (${pct(p.multaContratualPct)})`, valor: r2(corr * p.multaContratualPct / 100), fundamento: 'cláusula penal do contrato (arts. 408 a 416 do CC)' });
  let sub = r2(l.reduce((s, x) => s + r2(x.valor), 0));
  if (p.honorariosContratuaisPct) { l.push({ rotulo: `Honorários (${pct(p.honorariosContratuaisPct)})`, valor: r2(sub * p.honorariosContratuaisPct / 100), fundamento: 'arts. 389 e 395 do CC; art. 85 do CPC' }); sub = r2(l.reduce((s, x) => s + r2(x.valor), 0)); }
  const cs = p.cumprimentoSentenca;
  let subtitulo: string | undefined;
  if (cs.ativo) {
    const prazo = cs.intimadoEm ? somarDiasUteis(cs.intimadoEm, 15) : null;
    subtitulo = prazo ? `Prazo para pagamento voluntário (15 dias úteis, sem feriados): ${dataBr(prazo)}` : 'Informe a data da intimação para o pagamento voluntário';
    if (cs.pagamentoParcial) l.push({ rotulo: '(−) Pagamento parcial', valor: -cs.pagamentoParcial });
    const saldo = r2(sub - cs.pagamentoParcial);
    if (!prazo || base > prazo) {
      l.push({ rotulo: 'Multa de 10% (art. 523, §1º, do CPC)', valor: r2(saldo * 0.1), fundamento: 'art. 523, §§1º e 2º, do CPC (sobre o saldo não pago)' });
      l.push({ rotulo: 'Honorários de 10% (art. 523, §1º, do CPC)', valor: r2(saldo * 0.1), fundamento: 'art. 523, §1º, do CPC' });
      if (!prazo) avisos.push('Multa e honorários do art. 523 incluídos sem a data da intimação: CONFERIR se o prazo já correu.');
    } else avisos.push(`Prazo de pagamento voluntário ainda corre até ${dataBr(prazo)}: multa e honorários do art. 523 não incluídos.`);
    avisos.push('Prazo do art. 523 contado só sem sábados e domingos: CONFERIR feriados e suspensões no calendário forense.');
  }
  const b = bloco('debito', cs.ativo ? 'Cumprimento de sentença — débito atualizado' : 'Débito atualizado', l, { subtitulo, recomendado: true });
  return finalizar(ctx, {
    tipo: 'DEBITO', titulo: cs.ativo ? 'Cumprimento de sentença' : 'Atualização de débito', dataBase: base,
    resumo: [{ rotulo: 'Principal nominal', valor: r2(nominal) }, { rotulo: 'Total atualizado', valor: b.total.valor }, { rotulo: 'Prescrição', valor: `${presc.anos ? presc.anos + ' anos' : ''}${presc.meses ? ` ${presc.meses} meses` : ''} — ${presc.fundamento}` }],
    blocos: [b],
    tabelas: [{
      id: 'parcelas', titulo: 'Parcelas atualizadas', linhas, colunas: [
        { chave: 'data', titulo: 'Vencimento', tipo: 'data' }, { chave: 'descricao', titulo: 'Descrição', tipo: 'texto' },
        { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: true }, { chave: 'fator', titulo: 'Fator', tipo: 'fator' },
        { chave: 'corrigido', titulo: 'Corrigido', tipo: 'moeda', formula: '{valor}*{fator}', total: true },
        { chave: 'juros', titulo: 'Juros %', tipo: 'pct' }, { chave: 'valorJuros', titulo: 'Juros', tipo: 'moeda', formula: '{corrigido}*{juros}/100', total: true },
        { chave: 'total', titulo: 'Total', tipo: 'moeda', formula: '{corrigido}+{valorJuros}', total: true },
        { chave: 'prescricao', titulo: 'Prescreve em', tipo: 'data' }, { chave: 'situacao', titulo: 'Situação', tipo: 'texto' },
      ],
    }],
    avisos, fundamentos: ['CC, arts. 389, 395, 397, 405 e 406 (Lei 14.905/2024)', 'CPC, art. 523', presc.fundamento],
    destaques: [], premissas: [`Correção pelo ${nomeIndice(p.indice)}; juros simples.`],
    totalPrincipal: b.total.valor,
  });
}

// ═══════════════════════ LOCAÇÃO ═════════════════════════════════════════

export const LocacaoParams = z.object({
  modo: z.enum(['ATRASADOS', 'REAJUSTE', 'AMBOS']).default('ATRASADOS'),
  dataCalculo: Opc(Data),
  aluguelVigente: z.number().positive(),
  indice: z.enum(INDICES_CORRECAO).default('IGPM').describe('Índice do contrato'),
  alugueis: z.array(z.object({ vencimento: Data, valor: z.number().positive(), descricao: Opc(z.string()) })).default([]),
  encargos: z.array(z.object({ vencimento: Data, valor: z.number().positive(), descricao: z.string() })).default([]),
  multaPct: z.number().min(0).max(100).default(10),
  juros: z.enum(['CONTRATUAL', 'LEGAL']).default('CONTRATUAL'),
  jurosPctMensal: z.number().min(0).max(10).default(1),
  honorariosPct: z.number().min(0).max(100).default(10),
  custasEstimadas: z.number().min(0).default(0),
  aniversarioReajuste: Opc(Data).describe('Data do reajuste anual'),
});
export type LocacaoParams = z.infer<typeof LocacaoParams>;

export function calcularLocacao(ctx: Contexto, p: LocacaoParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const avisos: string[] = []; const blocos = []; const tabelas: Resultado['tabelas'] = []; const resumo: Resultado['resumo'] = [];
  if (p.modo !== 'REAJUSTE') {
    const itens = [...p.alugueis.map((a) => ({ ...a, descricao: a.descricao ?? `Aluguel venc. ${dataBr(a.vencimento)}`, aluguel: true })), ...p.encargos.map((e) => ({ ...e, aluguel: false }))]
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    if (!itens.length) avisos.push('Nenhum aluguel ou encargo em atraso informado.');
    const linhas: any[] = []; let corr = 0; let multa = 0; let jur = 0;
    for (const it of itens) {
      const f = fatorCorrecao(ctx, p.indice, it.vencimento, base);
      const c = r2(it.valor * f.fator);
      const m = r2(c * p.multaPct / 100);
      const j = jurosPeriodo(ctx, it.vencimento, base, p.juros === 'CONTRATUAL' ? p.jurosPctMensal : null);
      const vj = r2(c * j.percentual / 100);
      linhas.push({
        data: it.vencimento, descricao: it.descricao, valor: it.valor, fator: r6(f.fator), corrigido: c, multa: m, juros: r6(j.percentual), valorJuros: vj, total: r2(c + m + vj),
        _ref: { fator: { tipo: 'fator', indice: p.indice, de: f.de, ate: f.ate }, juros: { tipo: 'soma', serie: p.juros === 'CONTRATUAL' ? 'FIXA' : 'JUROS_LEGAL', de: j.de, ate: j.ate, fixa: p.juros === 'CONTRATUAL' ? p.jurosPctMensal : null } },
      });
      corr += c; multa += m; jur += vj;
    }
    const l: Linha[] = [
      { rotulo: 'Aluguéis e encargos corrigidos', valor: corr, formula: nomeIndice(p.indice) },
      { rotulo: `Multa moratória (${pct(p.multaPct)})`, valor: multa, fundamento: 'cláusula do contrato de locação' },
      { rotulo: 'Juros de mora', valor: jur, fundamento: p.juros === 'CONTRATUAL' ? `${pct(p.jurosPctMensal)} a.m. (contrato)` : 'art. 406 do CC' },
    ];
    const sub = r2(l.reduce((s, x) => s + r2(x.valor), 0));
    l.push({ rotulo: `Honorários (${pct(p.honorariosPct)})`, valor: r2(sub * p.honorariosPct / 100), fundamento: 'art. 62, II, "d", da Lei 8.245/91 (10% se o contrato não dispuser de outro modo)' });
    if (p.custasEstimadas) l.push({ rotulo: 'Custas', valor: p.custasEstimadas });
    blocos.push(bloco('purgacao', 'Débito para despejo / purgação da mora', l, { recomendado: true, subtitulo: 'Purgação da mora em 15 dias da citação (art. 62, II, da Lei 8.245/91)' }));
    tabelas.push({
      id: 'atrasados', titulo: 'Aluguéis e encargos em atraso', linhas, colunas: [
        { chave: 'data', titulo: 'Vencimento', tipo: 'data' }, { chave: 'descricao', titulo: 'Descrição', tipo: 'texto' },
        { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: true }, { chave: 'fator', titulo: 'Fator', tipo: 'fator' },
        { chave: 'corrigido', titulo: 'Corrigido', tipo: 'moeda', formula: '{valor}*{fator}', total: true },
        { chave: 'multa', titulo: 'Multa', tipo: 'moeda', formula: `{corrigido}*${p.multaPct}/100`, total: true },
        { chave: 'juros', titulo: 'Juros %', tipo: 'pct' }, { chave: 'valorJuros', titulo: 'Juros', tipo: 'moeda', formula: '{corrigido}*{juros}/100', total: true },
        { chave: 'total', titulo: 'Total', tipo: 'moeda', formula: '{corrigido}+{multa}+{valorJuros}', total: true },
      ],
    });
    resumo.push({ rotulo: 'Valor da causa do despejo (12 aluguéis)', valor: r2(p.aluguelVigente * 12) });
  }
  if (p.modo !== 'ATRASADOS') {
    if (!p.aniversarioReajuste) avisos.push('Reajuste: informe a data do aniversário do contrato.');
    else {
      const f = fatorCorrecao(ctx, p.indice, somarMesesIso(p.aniversarioReajuste, -12), p.aniversarioReajuste);
      const novo = r2(p.aluguelVigente * f.fator);
      blocos.push(bloco('reajuste', `Reajuste anual em ${dataBr(p.aniversarioReajuste)}`, [
        { rotulo: 'Aluguel vigente', valor: p.aluguelVigente },
        { rotulo: `Reajuste (${nomeIndice(p.indice)}, 12 meses: ${pct((f.fator - 1) * 100, 4)})`, valor: r2(novo - p.aluguelVigente), formula: `fator ${r6(f.fator)}`, fundamento: 'art. 18 da Lei 8.245/91 e cláusula de reajuste; Lei 10.192/2001 (periodicidade anual)' },
      ], { rotuloTotal: 'Novo aluguel' }));
      if (f.fator < 1) avisos.push('Índice acumulado negativo: conferir se o contrato admite redução do aluguel (deflação).');
      resumo.push({ rotulo: 'Novo aluguel', valor: novo });
    }
  }
  return finalizar(ctx, {
    tipo: 'LOCACAO', titulo: 'Locação — atrasados e reajuste', dataBase: base, resumo, blocos, tabelas, avisos,
    fundamentos: ['Lei 8.245/91, arts. 18, 58, III, e 62', 'CC, arts. 395 e 406'],
    destaques: ['Lado do proprietário (decisão da rodada 3).'],
    premissas: [`Correção pelo ${nomeIndice(p.indice)}; multa sobre o valor corrigido; juros simples desde cada vencimento.`],
    totalPrincipal: blocos[0]?.total.valor ?? 0,
  });
}
