/**
 * Atraso na entrega do imóvel na planta (decisão 136)
 *   Lucros cessantes de 0,5% a 1% a.m. após a tolerância de 180 dias (art. 43-A da Lei 4.591/64; Tema 996 do STJ)
 *   Cláusula penal invertida, que não cumula com lucros cessantes (Temas 970 e 971 do STJ) — indica a maior
 *   Troca do INCC pelo IPCA no período de atraso (Tema 996), danos morais estimados e campo livre
 */
import * as z from 'zod/v4';
import {
  Contexto, INDICES_CORRECAO, Linha, RefLinha, Resultado, bloco, dataBr, diasEntre, fatorCorrecao, finalizar, hojeIso,
  jurosPeriodo, moeda, nomeIndice, pct, r2, r6, somarDiasIso, somarMesesIso,
} from '../nucleo';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Opc = <T extends z.ZodType>(t: T) => t.nullable().optional();

export const AtrasoObraParams = z.object({
  lado: z.enum(['COMPRADOR', 'CONSTRUTORA']).default('COMPRADOR'),
  valorImovel: z.number().positive().describe('Valor do imóvel (contrato ou mercado) base dos lucros cessantes'),
  dataContrato: Data,
  prazoEntrega: Data,
  toleranciaDias: z.number().int().min(0).max(365).default(180),
  entregaEm: Opc(Data).describe('Data da entrega das chaves; vazio = ainda não entregue'),
  dataCalculo: Opc(Data),
  indice: z.enum(INDICES_CORRECAO).default('LEGAL').describe('Correção das parcelas mensais da indenização'),
  lucrosCessantesPct: z.number().min(0).max(3).default(0.5),
  clausulaPenal: z.object({
    ativo: z.boolean().default(false),
    modo: z.enum(['PCT_MENSAL_IMOVEL', 'PCT_MENSAL_PAGO', 'VALOR_MENSAL', 'VALOR_UNICO', 'PCT_UNICO_IMOVEL']).default('PCT_MENSAL_IMOVEL'),
    valor: z.number().min(0).default(0),
    valorPagoBase: Opc(z.number().min(0)),
  }).default({ ativo: false, modo: 'PCT_MENSAL_IMOVEL', valor: 0 }),
  trocaIncc: z.object({
    ativo: z.boolean().default(false),
    parcelas: z.array(z.object({ data: Data, valorPago: z.number().positive(), descricao: Opc(z.string()) })).default([]),
  }).default({ ativo: false, parcelas: [] }),
  danosMorais: z.object({ ativo: z.boolean().default(false), valor: z.number().min(0).default(0) }).default({ ativo: false, valor: 0 }),
  campoLivre: z.object({ ativo: z.boolean().default(false), descricao: z.string().default('Campo livre'), valor: z.number().default(0) }).default({ ativo: false, descricao: 'Campo livre', valor: 0 }),
  citacaoEm: Opc(Data),
});
export type AtrasoObraParams = z.infer<typeof AtrasoObraParams>;

export function calcularAtrasoObra(ctx: Contexto, p: AtrasoObraParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const avisos: string[] = [];
  const limite = somarDiasIso(p.prazoEntrega, p.toleranciaDias);
  const fim = p.entregaEm ?? base;
  const diasAtraso = Math.max(0, diasEntre(limite, fim));
  if (diasAtraso === 0) avisos.push(`Sem atraso indenizável: a data-limite com tolerância é ${dataBr(limite)}.`);
  if (!p.entregaEm) avisos.push('Imóvel ainda não entregue: a indenização mensal continua correndo até a entrega das chaves.');

  // Mensalidades da indenização (lucros cessantes e, se mensal, cláusula penal)
  const periodos: Array<{ ini: string; fim: string; frac: number }> = [];
  for (let ini = limite; ini < fim;) {
    const prox = somarMesesIso(ini, 1);
    const f = prox < fim ? prox : fim;
    periodos.push({ ini, fim: f, frac: prox <= fim ? 1 : diasEntre(ini, f) / 30 });
    ini = prox;
  }
  const mensal = (valorMes: number, desc: string) => {
    const linhas: Array<Record<string, any> & { _ref?: RefLinha }> = [];
    let total = 0; let nominal = 0;
    for (const per of periodos) {
      const v = r2(valorMes * per.frac);
      const f = fatorCorrecao(ctx, p.indice, per.fim, base);
      const c = r2(v * f.fator);
      linhas.push({ data: per.fim, descricao: `${desc} ${dataBr(per.ini)} a ${dataBr(per.fim)}${per.frac < 1 ? ` (${Math.round(per.frac * 30)} dias)` : ''}`, valor: v, fator: r6(f.fator), corrigido: c, _ref: { fator: { tipo: 'fator', indice: p.indice, de: f.de, ate: f.ate } } });
      total += c; nominal += v;
    }
    return { linhas, total: r2(total), nominal: r2(nominal) };
  };
  const colunas = [
    { chave: 'data', titulo: 'Vencimento', tipo: 'data' as const },
    { chave: 'descricao', titulo: 'Período', tipo: 'texto' as const },
    { chave: 'valor', titulo: 'Valor do mês', tipo: 'moeda' as const, total: true },
    { chave: 'fator', titulo: 'Fator de correção', tipo: 'fator' as const },
    { chave: 'corrigido', titulo: 'Corrigido', tipo: 'moeda' as const, formula: '{valor}*{fator}', total: true },
  ];

  const lc = mensal(p.valorImovel * p.lucrosCessantesPct / 100, 'Lucros cessantes');
  const lc05 = r2(lc.total * 0.5 / (p.lucrosCessantesPct || 1));
  const lc10 = r2(lc.total * 1 / (p.lucrosCessantesPct || 1));

  // Cláusula penal invertida
  let penal: { total: number; linhas: any[]; descricao: string } | null = null;
  if (p.clausulaPenal.ativo) {
    const cp = p.clausulaPenal;
    if (cp.modo === 'VALOR_UNICO' || cp.modo === 'PCT_UNICO_IMOVEL') {
      const v = cp.modo === 'VALOR_UNICO' ? cp.valor : p.valorImovel * cp.valor / 100;
      const f = fatorCorrecao(ctx, p.indice, limite, base);
      penal = { total: r2(v * f.fator), descricao: `multa única de ${cp.modo === 'VALOR_UNICO' ? moeda(cp.valor) : pct(cp.valor) + ' do imóvel'}`, linhas: [{ data: limite, descricao: 'Multa contratual (única)', valor: r2(v), fator: r6(f.fator), corrigido: r2(v * f.fator), _ref: { fator: { tipo: 'fator', indice: p.indice, de: f.de, ate: f.ate } } }] };
    } else {
      const valorMes = cp.modo === 'VALOR_MENSAL' ? cp.valor : cp.modo === 'PCT_MENSAL_IMOVEL' ? p.valorImovel * cp.valor / 100 : (cp.valorPagoBase ?? 0) * cp.valor / 100;
      if (cp.modo === 'PCT_MENSAL_PAGO' && !cp.valorPagoBase) avisos.push('Cláusula penal sobre o valor pago sem a base informada: resultou em zero.');
      const m = mensal(valorMes, 'Multa contratual');
      penal = { total: m.total, linhas: m.linhas, descricao: `multa mensal de ${moeda(valorMes)}` };
    }
  }

  // Troca do INCC pelo IPCA no atraso (Tema 996)
  const trocaLinhas: any[] = []; let trocaTotal = 0;
  if (p.trocaIncc.ativo) {
    for (const pc of p.trocaIncc.parcelas) {
      if (pc.data <= limite) continue;
      const fI = fatorCorrecao(ctx, 'INCC', limite, pc.data);
      const fP = fatorCorrecao(ctx, 'IPCA', limite, pc.data);
      const semCorr = pc.valorPago / fI.fator;
      const dif = fI.fator > fP.fator ? r2(pc.valorPago - semCorr * fP.fator) : 0;
      const fC = fatorCorrecao(ctx, 'IPCA', pc.data, base);
      trocaLinhas.push({
        data: pc.data, descricao: pc.descricao ?? 'Parcela paga no atraso', valor: pc.valorPago, fincc: r6(fI.fator), fipca: r6(fP.fator),
        diferenca: dif, fator: r6(fC.fator), corrigido: r2(dif * fC.fator),
        _ref: { fincc: { tipo: 'fator', indice: 'INCC', de: fI.de, ate: fI.ate }, fipca: { tipo: 'fator', indice: 'IPCA', de: fP.de, ate: fP.ate }, fator: { tipo: 'fator', indice: 'IPCA', de: fC.de, ate: fC.ate } },
      });
      trocaTotal += r2(dif * fC.fator);
    }
    trocaTotal = r2(trocaTotal);
    if (!trocaLinhas.length) avisos.push('Troca do INCC pelo IPCA ligada, mas nenhuma parcela informada foi paga depois da data-limite.');
  }

  const extras: Linha[] = [];
  if (trocaTotal) extras.push({ rotulo: 'Diferença INCC × IPCA no atraso, corrigida', valor: trocaTotal, fundamento: 'Tema 996 do STJ (IPCA no lugar do INCC no atraso, salvo se o INCC for menor)' });
  if (p.campoLivre.ativo && p.campoLivre.valor) extras.push({ rotulo: p.campoLivre.descricao, valor: p.campoLivre.valor, fundamento: 'campo livre (informado pelo advogado)' });
  const moral: Linha[] = p.danosMorais.ativo && p.danosMorais.valor ? [{ rotulo: 'Danos morais (estimativa)', valor: p.danosMorais.valor, fundamento: 'arbitramento judicial; correção desde o arbitramento (Súmula 362 do STJ)' }] : [];

  const jurosLinha = (material: number): Linha => {
    if (!p.citacaoEm) return { rotulo: 'Juros de mora desde a citação', valor: 0, formula: 'citação ainda não informada' };
    const j = jurosPeriodo(ctx, p.citacaoEm, base);
    return { rotulo: 'Juros de mora desde a citação', valor: r2(material * j.percentual / 100), formula: `${moeda(material)} × ${pct(j.percentual, 4)}`, fundamento: 'art. 405 do CC; art. 406 do CC (Lei 14.905/2024)' };
  };

  const opA: Linha[] = [{ rotulo: `Lucros cessantes (${pct(p.lucrosCessantesPct)} a.m. × ${diasAtraso} dias)`, valor: lc.total, fundamento: 'art. 43-A da Lei 4.591/64; Tema 996 do STJ (prejuízo presumido)' }, ...extras];
  opA.push(jurosLinha(opA.reduce((s, l) => s + l.valor, 0)));
  opA.push(...moral);
  const blocos = [bloco('lucros', 'Opção A — lucros cessantes', opA, { observacoes: [`Faixa: a 0,5% a.m., ${moeda(lc05)}; a 1% a.m., ${moeda(lc10)}.`] })];
  if (penal) {
    const opB: Linha[] = [{ rotulo: `Cláusula penal invertida (${penal.descricao})`, valor: penal.total, fundamento: 'Tema 971 do STJ (inversão da cláusula penal em favor do comprador)' }, ...extras];
    opB.push(jurosLinha(opB.reduce((s, l) => s + l.valor, 0)));
    opB.push(...moral);
    blocos.push(bloco('penal', 'Opção B — cláusula penal invertida', opB));
    const iMaior = blocos[0].total.valor >= blocos[1].total.valor ? 0 : 1;
    blocos[iMaior].recomendado = true;
    avisos.push(`Lucros cessantes e cláusula penal moratória não se somam (Tema 970 do STJ): a maior é a ${iMaior === 0 ? 'opção A (lucros cessantes)' : 'opção B (cláusula penal)'}.`);
  } else blocos[0].recomendado = true;

  const tabelas = [{ id: 'lucros', titulo: 'Lucros cessantes mês a mês', colunas, linhas: lc.linhas }];
  if (penal) tabelas.push({ id: 'penal', titulo: 'Cláusula penal invertida', colunas, linhas: penal.linhas });
  if (trocaLinhas.length) tabelas.push({
    id: 'troca', titulo: 'Troca do INCC pelo IPCA (Tema 996)', linhas: trocaLinhas, colunas: [
      { chave: 'data', titulo: 'Pagamento', tipo: 'data' }, { chave: 'descricao', titulo: 'Parcela', tipo: 'texto' },
      { chave: 'valor', titulo: 'Valor pago', tipo: 'moeda', total: true }, { chave: 'fincc', titulo: 'Fator INCC no atraso', tipo: 'fator' },
      { chave: 'fipca', titulo: 'Fator IPCA no atraso', tipo: 'fator' },
      { chave: 'diferenca', titulo: 'Diferença', tipo: 'moeda', formula: 'IF({fincc}>{fipca},{valor}-{valor}/{fincc}*{fipca},0)', total: true },
      { chave: 'fator', titulo: 'Fator até a data-base', tipo: 'fator' }, { chave: 'corrigido', titulo: 'Diferença corrigida', tipo: 'moeda', formula: '{diferenca}*{fator}', total: true },
    ] as any,
  });

  return finalizar(ctx, {
    tipo: 'ATRASO_OBRA', titulo: 'Atraso na entrega de imóvel', dataBase: base,
    resumo: [
      { rotulo: 'Prazo de entrega', valor: dataBr(p.prazoEntrega) }, { rotulo: 'Data-limite com tolerância', valor: dataBr(limite) },
      { rotulo: 'Entrega das chaves', valor: p.entregaEm ? dataBr(p.entregaEm) : 'não entregue' }, { rotulo: 'Dias de atraso', valor: diasAtraso },
      ...blocos.map((b) => ({ rotulo: b.titulo, valor: b.total.valor })),
    ],
    blocos, tabelas, avisos,
    fundamentos: ['Lei 4.591/64, art. 43-A', 'Tema 996 do STJ', 'Temas 970 e 971 do STJ', 'Súmula 362 do STJ', 'CC, arts. 389, 405 e 406'],
    destaques: [`Indenização mensal desde ${dataBr(limite)} até ${p.entregaEm ? 'a entrega das chaves' : 'a data-base'}.`],
    premissas: [
      `Cada mês de indenização vence no fim do período e é corrigido pelo ${nomeIndice(p.indice)} até ${dataBr(base)}.`,
      'Lucros cessantes calculados sobre o valor do imóvel informado; mês incompleto pro rata (dias/30).',
    ],
    totalPrincipal: Math.max(...blocos.map((b) => b.total.valor)),
  });
}
