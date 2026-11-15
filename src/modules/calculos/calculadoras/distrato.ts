/**
 * Distrato de imóvel na planta (decisões 128–135)
 *   Cenário 1 — contrato e Lei 13.786/2018 (art. 67-A da Lei 4.591/64; art. 32-A da Lei 6.766/79)
 *   Cenário 2 — jurisprudência (retenção de 10% a 25% dos valores pagos)
 *   Cenário 3 — culpa da construtora: devolução integral e imediata (Súmula 543 do STJ)
 */
import * as z from 'zod/v4';
import {
  COLUNAS_CORRECAO, Contexto, INDICES_CORRECAO, Linha, RefLinha, Resultado, bloco, dataBr, diasEntre, fatorCorrecao,
  finalizar, hojeIso, jurosPeriodo, linhaCorrigida, moeda, nomeIndice, pct, r2, somarDiasIso, somarMesesIso,
} from '../nucleo';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');
const Opcional = <T extends z.ZodType>(t: T) => t.nullable().optional();

export const DistratoParams = z.object({
  lado: z.enum(['COMPRADOR', 'CONSTRUTORA']).describe('Lado que o escritório atende'),
  regime: z.enum(['INCORPORACAO', 'LOTEAMENTO']).default('INCORPORACAO'),
  patrimonioAfetacao: z.boolean().default(false),
  obrasConcluidas: Opcional(z.boolean()).describe('Loteamento: obras concluídas?'),
  valorContrato: z.number().positive(),
  dataContrato: Data,
  dataDistrato: Data.describe('Data do desfazimento / pedido de distrato'),
  dataCalculo: Opcional(Data),
  habiteseEm: Opcional(Data),
  indice: z.enum(INDICES_CORRECAO).default('INCC').describe('Índice previsto no contrato (decisão 130)'),
  pagamentos: z.array(z.object({
    data: Data, valor: z.number().positive(), descricao: Opcional(z.string()),
    tipo: z.enum(['PARCELA', 'SINAL', 'CORRETAGEM', 'OUTRO']).default('PARCELA'),
  })).min(1),
  retencaoLeiPct: Opcional(z.number().min(0).max(100)),
  retencaoJurisprudenciaPct: Opcional(z.number().min(0).max(100)),
  descontos: z.object({
    corretagem: z.object({ ativo: z.boolean().default(false), valor: Opcional(z.number().min(0)), data: Opcional(Data) }).default({ ativo: false }),
    fruicao: z.object({ ativo: z.boolean().default(false), inicioPosse: Opcional(Data), fimPosse: Opcional(Data), pctMensal: Opcional(z.number().min(0).max(5)) }).default({ ativo: false }),
    iptuCondominio: z.object({ ativo: z.boolean().default(false), valor: z.number().min(0).default(0) }).default({ ativo: false, valor: 0 }),
    outrosEncargos: z.object({ ativo: z.boolean().default(false), itens: z.array(z.object({ descricao: z.string(), valor: z.number().min(0) })).default([]) }).default({ ativo: false, itens: [] }),
    campoLivre: z.object({ ativo: z.boolean().default(false), descricao: z.string().default('Campo livre'), valor: z.number().default(0) }).default({ ativo: false, descricao: 'Campo livre', valor: 0 }),
  }).default({} as any),
  citacaoEm: Opcional(Data),
  transitoEm: Opcional(Data),
});
export type DistratoParams = z.infer<typeof DistratoParams>;

const LEI_13786 = '2018-12-28';

export function calcularDistrato(ctx: Contexto, p: DistratoParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const avisos: string[] = [];
  const d = p.descontos as any;
  const ind = p.indice;

  // Valores pagos corrigidos pelo índice do contrato
  const linhas = [];
  let pagoCorr = 0; let pagoNominal = 0; let corretagemCorr = 0;
  for (const pg of [...p.pagamentos].sort((a, b) => a.data.localeCompare(b.data))) {
    const l = linhaCorrigida(ctx, ind, pg.data, pg.valor, base, { descricao: `${pg.tipo === 'CORRETAGEM' ? 'Corretagem' : pg.tipo === 'SINAL' ? 'Sinal' : 'Parcela'}${pg.descricao ? ' — ' + pg.descricao : ''}` });
    linhas.push(l.linha);
    pagoCorr += l.corrigido; pagoNominal += pg.valor;
    if (pg.tipo === 'CORRETAGEM') corretagemCorr += l.corrigido;
  }
  pagoCorr = r2(pagoCorr);
  const pagoSemCorretagem = r2(pagoCorr - corretagemCorr);

  const fContrato = fatorCorrecao(ctx, ind, p.dataContrato, base);
  const contratoAtual = r2(p.valorContrato * fContrato.fator);

  // ── Descontos ligáveis (132) ─────────────────────────────────────────────
  const descontos: Linha[] = [];
  if (d.corretagem?.ativo) {
    let v = corretagemCorr;
    if (d.corretagem.valor != null) v = r2(d.corretagem.valor * fatorCorrecao(ctx, ind, d.corretagem.data ?? p.dataContrato, base).fator);
    descontos.push({ rotulo: '(−) Comissão de corretagem', valor: -v, fundamento: 'Tema 938 do STJ; art. 67-A, I, da Lei 4.591/64; art. 32-A, V, da Lei 6.766/79', formula: 'corretagem destacada no contrato, corrigida' });
  }
  if (d.fruicao?.ativo) {
    const ini = d.fruicao.inicioPosse;
    if (!ini) avisos.push('Taxa de fruição ligada sem a data de início da posse: não calculada.');
    else {
      const fim = d.fruicao.fimPosse ?? p.dataDistrato;
      const dias = Math.max(0, diasEntre(ini, fim));
      const tx = d.fruicao.pctMensal ?? (p.regime === 'LOTEAMENTO' ? 0.75 : 0.5);
      const v = r2(contratoAtual * (tx / 100) * (dias / 30));
      descontos.push({
        rotulo: `(−) Taxa de fruição (${pct(tx)} a.m. × ${dias} dias)`, valor: -v,
        formula: `${moeda(contratoAtual)} × ${pct(tx)} × ${dias}/30`,
        fundamento: p.regime === 'LOTEAMENTO' ? 'art. 32-A, I, da Lei 6.766/79 (0,75% a.m. sobre o valor atualizado do contrato)' : 'art. 67-A, §2º, III, da Lei 4.591/64 (0,5% a.m. sobre o valor atualizado do contrato, pro rata die)',
      });
    }
  }
  if (d.iptuCondominio?.ativo && d.iptuCondominio.valor) descontos.push({ rotulo: '(−) IPTU e condomínio do período de posse', valor: -d.iptuCondominio.valor, fundamento: 'art. 67-A, §2º, I e II, da Lei 4.591/64; art. 32-A, IV, da Lei 6.766/79' });
  if (d.outrosEncargos?.ativo) for (const it of d.outrosEncargos.itens ?? []) descontos.push({ rotulo: `(−) ${it.descricao}`, valor: -it.valor, fundamento: 'encargo previsto no contrato' });
  if (d.campoLivre?.ativo && d.campoLivre.valor) descontos.push({ rotulo: d.campoLivre.descricao || 'Campo livre', valor: -d.campoLivre.valor, fundamento: 'campo livre (informado pelo advogado)' });

  // ── Juros (Tema 1002) ────────────────────────────────────────────────────
  const juros = (valor: number, desde: string | null | undefined, rotulo: string): Linha => {
    if (valor <= 0) return { rotulo, valor: 0, formula: 'sem saldo a devolver' };
    if (!desde) return { rotulo, valor: 0, formula: 'ainda não incidem (data não informada)' };
    const j = jurosPeriodo(ctx, desde, base);
    return { rotulo, valor: r2(valor * j.percentual / 100), formula: `${moeda(valor)} × ${pct(j.percentual, 4)} (${j.meses} meses, taxa legal)`, fundamento: 'Tema 1002 do STJ; art. 406 do CC (Lei 14.905/2024)' };
  };

  // Cenário 1 — contrato e lei
  let ret1Pct: number; let ret1Base: number; let ret1Fund: string;
  if (p.regime === 'LOTEAMENTO') {
    ret1Pct = p.retencaoLeiPct ?? 10; ret1Base = contratoAtual;
    ret1Fund = 'art. 32-A, II, da Lei 6.766/79 (cláusula penal e despesas administrativas limitadas a 10% do valor atualizado do contrato)';
  } else {
    ret1Pct = p.retencaoLeiPct ?? (p.patrimonioAfetacao ? 50 : 25); ret1Base = pagoSemCorretagem;
    ret1Fund = p.patrimonioAfetacao ? 'art. 67-A, II e §5º, da Lei 4.591/64 (até 50% com patrimônio de afetação)' : 'art. 67-A, II, da Lei 4.591/64 (até 25% da quantia paga)';
  }
  const limiteLei = p.regime === 'LOTEAMENTO' ? 10 : p.patrimonioAfetacao ? 50 : 25;
  if (ret1Pct > limiteLei) avisos.push(`Retenção do cenário 1 (${pct(ret1Pct)}) acima do limite legal de ${pct(limiteLei)}.`);
  const l1: Linha[] = [
    { rotulo: 'Valores pagos, corrigidos', valor: pagoCorr, formula: `índice do contrato: ${nomeIndice(ind)}` },
    { rotulo: `(−) Retenção / cláusula penal (${pct(ret1Pct)} de ${p.regime === 'LOTEAMENTO' ? 'valor atualizado do contrato' : 'quantia paga'})`, valor: -r2(ret1Base * ret1Pct / 100), formula: `${moeda(ret1Base)} × ${pct(ret1Pct)}`, fundamento: ret1Fund },
    ...descontos,
  ];
  const sub1 = r2(l1.reduce((s, l) => s + r2(l.valor), 0));
  l1.push(juros(sub1, p.transitoEm, 'Juros de mora desde o trânsito em julgado'));

  // Cenário 2 — jurisprudência
  const ret2Pct = p.retencaoJurisprudenciaPct ?? (p.lado === 'COMPRADOR' ? 10 : 25);
  const l2: Linha[] = [
    { rotulo: 'Valores pagos, corrigidos', valor: pagoCorr },
    { rotulo: `(−) Retenção (${pct(ret2Pct)} dos valores pagos)`, valor: -r2(pagoSemCorretagem * ret2Pct / 100), formula: `${moeda(pagoSemCorretagem)} × ${pct(ret2Pct)}`, fundamento: 'jurisprudência do STJ e do TJSC: retenção, em regra, entre 10% e 25% dos valores pagos' },
    ...descontos,
  ];
  const sub2 = r2(l2.reduce((s, l) => s + r2(l.valor), 0));
  l2.push(juros(sub2, p.transitoEm, 'Juros de mora desde o trânsito em julgado'));
  const faixa10 = r2(sub2 + pagoSemCorretagem * (ret2Pct - 10) / 100);
  const faixa25 = r2(sub2 + pagoSemCorretagem * (ret2Pct - 25) / 100);

  // Cenário 3 — culpa da construtora
  const l3: Linha[] = [{ rotulo: 'Valores pagos, corrigidos (devolução integral, inclusive corretagem)', valor: pagoCorr, fundamento: 'Súmula 543 do STJ' }];
  l3.push(juros(pagoCorr, p.citacaoEm, 'Juros de mora desde a citação'));

  // ── Data de devolução por cenário (134) ──────────────────────────────────
  const atraso = (data: string | null) => (data && base > data ? ` — vencida há ${diasEntre(data, base)} dias` : '');
  let dev1: string; let data1: string | null = null;
  if (p.regime === 'LOTEAMENTO') {
    data1 = p.obrasConcluidas === false ? somarMesesIso(p.dataDistrato, 12) : somarDiasIso(p.dataDistrato, 180);
    dev1 = `em até 12 parcelas mensais, a primeira após a carência do art. 32-A, §1º, da Lei 6.766/79 (estimada em ${dataBr(data1)}; CONFERIR a hipótese de obras concluídas ou em andamento)`;
    avisos.push('CONFERIR a carência e o parcelamento da devolução no loteamento (art. 32-A, §1º, da Lei 6.766/79) para o caso concreto.');
  } else if (p.patrimonioAfetacao) {
    if (p.habiteseEm) { data1 = somarDiasIso(p.habiteseEm, 30); dev1 = `30 dias após o habite-se: ${dataBr(data1)}`; } else dev1 = '30 dias após o habite-se (data do habite-se ainda não informada)';
  } else {
    data1 = somarDiasIso(p.dataDistrato, 180); dev1 = `180 dias do desfazimento: ${dataBr(data1)}`;
  }
  const fund67 = p.regime === 'LOTEAMENTO' ? '' : p.patrimonioAfetacao ? ' (art. 67-A, §5º)' : ' (art. 67-A, §6º)';

  const b1 = bloco('cenario1', 'Cenário 1 — contrato e Lei 13.786/2018', l1, {
    subtitulo: `Devolução: ${dev1}${fund67}${atraso(data1)}`, rotuloTotal: p.lado === 'COMPRADOR' ? 'A receber' : 'A devolver',
  });
  const b2 = bloco('cenario2', 'Cenário 2 — jurisprudência (retenção de 10% a 25%)', l2, {
    subtitulo: `Devolução imediata e em parcela única (Súmula 543 do STJ)${atraso(p.dataDistrato)}`, rotuloTotal: p.lado === 'COMPRADOR' ? 'A receber' : 'A devolver',
    observacoes: [`Faixa: com retenção de 10%, ${moeda(faixa10)}; com 25%, ${moeda(faixa25)} (sem juros).`],
  });
  const b3 = bloco('cenario3', 'Cenário 3 — culpa da construtora (devolução integral)', l3, {
    subtitulo: `Devolução imediata e em parcela única (Súmula 543 do STJ)${atraso(p.dataDistrato)}`, rotuloTotal: p.lado === 'COMPRADOR' ? 'A receber' : 'A devolver',
  });

  if (p.dataContrato >= LEI_13786) avisos.push('Contrato posterior à Lei 13.786/2018: o Tema 1002 do STJ trata de contratos anteriores à lei; CONFERIR o termo inicial dos juros (o prazo legal de devolução do cenário 1 pode marcar a mora).');
  if (sub1 < 0) avisos.push(`Cenário 1: as deduções superam os valores pagos; saldo devedor do comprador de ${moeda(-sub1)}.`);
  if (!p.transitoEm) avisos.push('Juros dos cenários 1 e 2 correm do trânsito em julgado (Tema 1002): ainda não computados.');
  if (!p.citacaoEm) avisos.push('Juros do cenário 3 correm da citação: informe a data da citação para computá-los.');

  return finalizar(ctx, {
    tipo: 'DISTRATO',
    titulo: `Distrato — ${p.regime === 'LOTEAMENTO' ? 'loteamento' : 'incorporação imobiliária'} (${p.lado === 'COMPRADOR' ? 'lado do comprador' : 'lado da construtora'})`,
    dataBase: base,
    resumo: [
      { rotulo: 'Valor do contrato', valor: p.valorContrato },
      { rotulo: 'Valor do contrato atualizado', valor: contratoAtual },
      { rotulo: 'Total pago (nominal)', valor: r2(pagoNominal) },
      { rotulo: 'Total pago corrigido', valor: pagoCorr },
      { rotulo: 'Cenário 1', valor: b1.total.valor },
      { rotulo: 'Cenário 2', valor: b2.total.valor },
      { rotulo: 'Cenário 3', valor: b3.total.valor },
    ],
    blocos: [b1, b2, b3],
    tabelas: [{ id: 'pagamentos', titulo: `Pagamentos corrigidos (${nomeIndice(ind)})`, colunas: COLUNAS_CORRECAO, linhas: linhas as Array<Record<string, any> & { _ref?: RefLinha }> }],
    avisos,
    fundamentos: [
      'Lei 4.591/64, art. 67-A (redação da Lei 13.786/2018)', 'Lei 6.766/79, art. 32-A', 'Súmula 543 do STJ', 'Tema 938 do STJ (corretagem)',
      'Tema 1002 do STJ (termo inicial dos juros)', 'CC, arts. 389 e 406 (Lei 14.905/2024)',
    ],
    destaques: [
      p.lado === 'COMPRADOR'
        ? `Para o comprador, o cenário 3 é o máximo (${moeda(b3.total.valor)}) e o cenário 2 com 10% é o pedido usual sem culpa da construtora (${moeda(b2.total.valor)}).`
        : `Para a construtora, o cenário 1 é a retenção máxima admitida pela lei (${moeda(b1.total.valor)} a devolver).`,
    ],
    premissas: [
      `Correção de cada pagamento pelo ${nomeIndice(ind)}, do mês do pagamento até o mês anterior à data-base (${dataBr(base)}).`,
      'Juros simples pela taxa legal: 1% a.m. até ago/2024; Selic menos IPCA (mínimo zero) desde set/2024.',
      'As três hipóteses aparecem sempre lado a lado; o advogado escolhe qual usar na peça (decisão 129).',
    ],
    totalPrincipal: b2.total.valor,
  });
}
