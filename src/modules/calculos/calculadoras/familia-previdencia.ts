/**
 * Pensão alimentícia em atraso e atrasados do INSS (decisão 142)
 */
import * as z from 'zod/v4';
import {
  Contexto, INDICES_CORRECAO, Linha, RefLinha, Resultado, bloco, compBr, compsEntre, competencia, dataBr, fatorCorrecao,
  finalizar, hojeIso, jurosPeriodo, mesesDoPeriodo, moeda, nomeIndice, pct, r2, r6, somaSerie, somarAnosIso,
  somarMesesComp, diasEntre,
} from '../nucleo';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Comp = z.string().regex(/^\d{4}-\d{2}$/);
const Opc = <T extends z.ZodType>(t: T) => t.nullable().optional();

// ═══════════════════════ PENSÃO ALIMENTÍCIA ══════════════════════════════

export const PensaoParams = z.object({
  periodos: z.array(z.object({ de: Comp, ate: Comp, valor: z.number().positive() })).min(1).describe('Valor mensal devido em cada período'),
  diaVencimento: z.number().int().min(1).max(28).default(10),
  pagamentos: z.array(z.object({ competencia: Comp, valor: z.number().positive() })).default([]),
  ajuizamentoEm: Opc(Data),
  dataCalculo: Opc(Data),
  indice: z.enum(INDICES_CORRECAO).default('INPC'),
  credorSobPoderFamiliar: z.boolean().default(true).describe('Filho menor sob poder familiar: a prescrição não corre (art. 197, II, do CC)'),
});
export type PensaoParams = z.infer<typeof PensaoParams>;

export function calcularPensao(ctx: Contexto, p: PensaoParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const ajuiz = p.ajuizamentoEm ?? base;
  const avisos: string[] = [];
  const pagos: Record<string, number> = {};
  for (const pg of p.pagamentos) pagos[pg.competencia] = (pagos[pg.competencia] ?? 0) + pg.valor;
  const linhas: any[] = [];
  for (const per of p.periodos) for (const c of compsEntre(per.de, per.ate)) {
    const venc = `${c}-${String(p.diaVencimento).padStart(2, '0')}`;
    if (venc > base) continue;
    const saldo = r2(per.valor - (pagos[c] ?? 0));
    if (saldo <= 0) continue;
    const f = fatorCorrecao(ctx, p.indice, venc, base);
    const corr = r2(saldo * f.fator);
    const j = jurosPeriodo(ctx, venc, base);
    const vj = r2(corr * j.percentual / 100);
    linhas.push({
      competencia: c, data: venc, devido: per.valor, pago: pagos[c] ?? 0, valor: saldo, fator: r6(f.fator), corrigido: corr, juros: r6(j.percentual), valorJuros: vj, total: r2(corr + vj), rito: '',
      _ref: { fator: { tipo: 'fator', indice: p.indice, de: f.de, ate: f.ate }, juros: { tipo: 'soma', serie: 'JUROS_LEGAL', de: j.de, ate: j.ate } } as RefLinha,
    });
  }
  linhas.sort((a, b) => a.data.localeCompare(b.data));
  // Súmula 309 do STJ: as três prestações anteriores ao ajuizamento e as que vencerem no curso do processo
  const anteriores = linhas.filter((l) => l.data < ajuiz);
  const tresUltimas = new Set(anteriores.slice(-3).map((l) => l.competencia));
  for (const l of linhas) l.rito = l.data >= ajuiz || tresUltimas.has(l.competencia) ? 'PRISÃO' : 'PENHORA';
  if (!p.credorSobPoderFamiliar) {
    const limite = somarAnosIso(base, -2);
    const presc = linhas.filter((l) => l.data < limite);
    if (presc.length) avisos.push(`PRESCRIÇÃO: ${presc.length} prestação(ões) vencida(s) há mais de 2 anos (art. 206, §2º, do CC) — conferir.`);
  } else avisos.push('Credor sob poder familiar: a prescrição das prestações não corre (art. 197, II, do CC).');
  const soma = (rito: string) => r2(linhas.filter((l) => l.rito === rito).reduce((s, l) => s + l.total, 0));
  const bp = bloco('prisao', 'Rito da prisão (art. 528, §§3º e 7º, do CPC)', [{ rotulo: `3 prestações anteriores ao ajuizamento e as vencidas no curso do processo (${linhas.filter((l) => l.rito === 'PRISÃO').length})`, valor: soma('PRISÃO'), fundamento: 'Súmula 309 do STJ; art. 528, §7º, do CPC' }], { recomendado: true });
  const bh = bloco('penhora', 'Rito da penhora (art. 528, §8º, e art. 523 do CPC)', [{ rotulo: `Demais prestações (${linhas.filter((l) => l.rito === 'PENHORA').length})`, valor: soma('PENHORA'), fundamento: 'art. 528, §8º, do CPC' }]);
  return finalizar(ctx, {
    tipo: 'PENSAO', titulo: 'Pensão alimentícia em atraso', dataBase: base,
    resumo: [{ rotulo: 'Prestações em aberto', valor: linhas.length }, { rotulo: 'Rito da prisão', valor: bp.total.valor }, { rotulo: 'Rito da penhora', valor: bh.total.valor }, { rotulo: 'Total', valor: r2(bp.total.valor + bh.total.valor) }],
    blocos: [bp, bh],
    tabelas: [{
      id: 'prestacoes', titulo: 'Prestações em atraso', linhas, colunas: [
        { chave: 'competencia', titulo: 'Competência', tipo: 'competencia' }, { chave: 'data', titulo: 'Vencimento', tipo: 'data' },
        { chave: 'devido', titulo: 'Devido', tipo: 'moeda' }, { chave: 'pago', titulo: 'Pago', tipo: 'moeda' },
        { chave: 'valor', titulo: 'Saldo', tipo: 'moeda', formula: '{devido}-{pago}', total: true }, { chave: 'fator', titulo: 'Fator', tipo: 'fator' },
        { chave: 'corrigido', titulo: 'Corrigido', tipo: 'moeda', formula: '{valor}*{fator}', total: true }, { chave: 'juros', titulo: 'Juros %', tipo: 'pct' },
        { chave: 'valorJuros', titulo: 'Juros', tipo: 'moeda', formula: '{corrigido}*{juros}/100', total: true },
        { chave: 'total', titulo: 'Total', tipo: 'moeda', formula: '{corrigido}+{valorJuros}', total: true }, { chave: 'rito', titulo: 'Rito', tipo: 'texto' },
      ],
    }],
    avisos, fundamentos: ['CPC, art. 528', 'Súmula 309 do STJ', 'CC, arts. 197, II, 206, §2º, e 406'],
    destaques: ['A execução pela prisão e pela penhora pode ser pedida em autos separados (art. 531 do CPC).'],
    premissas: [`Correção pelo ${nomeIndice(p.indice)} e juros legais desde cada vencimento (dia ${p.diaVencimento}).`],
    totalPrincipal: r2(bp.total.valor + bh.total.valor),
  });
}

// ═══════════════════════ ATRASADOS DO INSS ═══════════════════════════════

export const InssParams = z.object({
  dib: Data.describe('Data de início do benefício'),
  dip: Opc(Data).describe('Data de início do pagamento administrativo (vazio = data do cálculo)'),
  rmi: z.number().positive(),
  ajuizamentoEm: Opc(Data),
  citacaoEm: Opc(Data),
  sentencaEm: Opc(Data),
  dataCalculo: Opc(Data),
  abonoAnual: z.boolean().default(true),
  reajustes: z.array(z.object({ competencia: Comp, pct: z.number() })).default([]).describe('Reajustes anuais conferidos (vazio = INPC estimado)'),
  recebidos: z.array(z.object({ competencia: Comp, valor: z.number().min(0) })).default([]),
  honorariosPct: z.number().min(0).max(30).default(0),
});
export type InssParams = z.infer<typeof InssParams>;

const EC113 = '2021-12';

function jurosPoupanca(ctx: Contexto, de: string, ate: string) {
  // Lei 11.960/2009: juros da poupança — 0,5% a.m. quando a Selic supera 8,5% a.a.; senão 70% da Selic do mês
  let p = 0;
  for (const c of de < ate ? mesesDoPeriodo(de, ate) : []) {
    const s = ctx.indices.SELIC?.[c];
    ctx.usadas.add('SELIC');
    if (s === undefined) { (ctx.faltando.SELIC ??= new Set()).add(c); continue; }
    p += s >= 0.6825 ? 0.5 : 0.7 * s;
  }
  return p;
}

export function calcularInss(ctx: Contexto, p: InssParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const dip = p.dip ?? base;
  const avisos: string[] = [];
  const limite = p.ajuizamentoEm ? somarAnosIso(p.ajuizamentoEm, -5) : null;
  const reaj: Record<string, number> = {};
  for (const r of p.reajustes) reaj[r.competencia] = r.pct;
  if (!p.reajustes.length) avisos.push('CONFERIR: reajustes anuais estimados pelo INPC acumulado do ano anterior (proporcional no primeiro ano); confira com as portarias do INSS.');
  const recebidos: Record<string, number> = {};
  for (const r of p.recebidos) recebidos[r.competencia] = (recebidos[r.competencia] ?? 0) + r.valor;
  const linhas: any[] = [];
  let mensal = p.rmi; const compDib = competencia(p.dib); const compFim = somarMesesComp(competencia(dip), -1);
  const add = (comp: string, desc: string, valor: number) => {
    const venc = `${somarMesesComp(comp, 1)}-01`;
    if (limite && venc < limite) return;
    const liq = r2(valor - (desc === 'Mensalidade' ? recebidos[comp] ?? 0 : 0));
    if (liq <= 0) return;
    const fimInpc = venc < `${EC113}-01` ? (base < `${EC113}-01` ? base : `${EC113}-01`) : venc;
    const f = fatorCorrecao(ctx, 'INPC', venc, fimInpc);
    const jp = p.citacaoEm ? jurosPoupanca(ctx, p.citacaoEm > venc ? p.citacaoEm : venc, fimInpc) : 0;
    const iniSelic = venc > `${EC113}-01` ? venc : `${EC113}-01`;
    const s = iniSelic < base ? somaSerie(ctx, 'SELIC', iniSelic, base) : { percentual: 0, de: null, ate: null, meses: 0 };
    const atual = r2(liq * f.fator * (1 + jp / 100) * (1 + s.percentual / 100));
    linhas.push({
      competencia: comp, descricao: desc, valor: liq, fator: r6(f.fator), juros: r6(jp), selic: r6(s.percentual), atualizado: atual,
      _ref: { fator: { tipo: 'fator', indice: 'INPC', de: f.de, ate: f.ate }, selic: { tipo: 'soma', serie: 'SELIC', de: s.de, ate: s.ate } } as RefLinha,
    });
  };
  for (const c of compsEntre(compDib, compFim)) {
    if (c.endsWith('-01') && c > compDib) {
      let pctR = reaj[c];
      if (pctR === undefined) {
        const ano = String(Number(c.slice(0, 4)) - 1);
        const de = compDib > `${ano}-01` ? compDib : `${ano}-01`;
        const f = fatorCorrecao(ctx, 'INPC', `${de}-01`, `${c}-01`);
        pctR = (f.fator - 1) * 100;
      }
      mensal = mensal * (1 + pctR / 100);
    }
    let valor = mensal;
    if (c === compDib) valor = mensal * (diasEntre(p.dib, `${somarMesesComp(c, 1)}-01`) / 30);
    add(c, 'Mensalidade', valor);
    if (p.abonoAnual && (c.endsWith('-12') || c === compFim)) {
      const iniAno = compDib > `${c.slice(0, 4)}-01` ? compDib : `${c.slice(0, 4)}-01`;
      const meses = compsEntre(iniAno, c).length;
      add(c, `Abono anual (${meses}/12)`, mensal * meses / 12);
    }
  }
  if (limite) avisos.push(`Prescrição quinquenal: excluídas as parcelas vencidas antes de ${dataBr(limite)} (Súmula 85 do STJ).`);
  if (!p.citacaoEm) avisos.push('Sem a data da citação: juros da poupança (até nov/2021) não computados.');
  const total = r2(linhas.reduce((s, l) => s + l.atualizado, 0));
  const l: Linha[] = [{ rotulo: 'Parcelas atrasadas atualizadas', valor: total, formula: 'INPC até nov/2021 + juros da poupança desde a citação; Selic desde dez/2021' }];
  if (p.honorariosPct) {
    const ate = p.sentencaEm ?? base;
    const baseHon = r2(linhas.filter((x) => `${x.competencia}-01` <= ate).reduce((s, x) => s + x.atualizado, 0));
    l.push({ rotulo: `Honorários sucumbenciais (${pct(p.honorariosPct)} das parcelas até a sentença)`, valor: r2(baseHon * p.honorariosPct / 100), fundamento: 'Súmula 111 do STJ; art. 85, §3º, do CPC' });
  }
  const b = bloco('atrasados', 'Atrasados do benefício', l, { recomendado: true });
  return finalizar(ctx, {
    tipo: 'INSS', titulo: 'Atrasados de benefício do INSS', dataBase: base,
    resumo: [{ rotulo: 'DIB', valor: dataBr(p.dib) }, { rotulo: 'DIP', valor: dataBr(dip) }, { rotulo: 'RMI', valor: p.rmi }, { rotulo: 'Renda mensal atual estimada', valor: r2(mensal) }, { rotulo: 'Total', valor: b.total.valor }],
    blocos: [b],
    tabelas: [{
      id: 'competencias', titulo: 'Competências atrasadas', linhas, colunas: [
        { chave: 'competencia', titulo: 'Competência', tipo: 'competencia' }, { chave: 'descricao', titulo: 'Parcela', tipo: 'texto' },
        { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: true }, { chave: 'fator', titulo: 'Fator INPC (até nov/2021)', tipo: 'fator' },
        { chave: 'juros', titulo: 'Juros poupança %', tipo: 'pct' }, { chave: 'selic', titulo: 'Selic % (EC 113)', tipo: 'pct' },
        { chave: 'atualizado', titulo: 'Atualizado', tipo: 'moeda', formula: '{valor}*{fator}*(1+{juros}/100)*(1+{selic}/100)', total: true },
      ],
    }],
    avisos,
    fundamentos: ['Tema 905 do STJ (INPC nos benefícios previdenciários)', 'Lei 11.960/2009 (juros da poupança)', 'EC 113/2021, art. 3º (Selic desde dez/2021)', 'Súmula 85 do STJ', 'Súmula 111 do STJ'],
    destaques: [`Renda mensal reajustada estimada: ${moeda(mensal)}.`],
    premissas: ['Cada competência vence no 1º dia do mês seguinte; abono anual em dezembro, proporcional aos meses do ano.', 'Juros da poupança: 0,5% a.m. com Selic acima de 8,5% a.a., ou 70% da Selic do mês.'],
    totalPrincipal: b.total.valor,
  });
}
