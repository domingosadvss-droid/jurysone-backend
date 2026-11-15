/**
 * Revisão de financiamentos e contratos bancários (decisões 137–139)
 *
 * Teses ligáveis: juros acima da média do BCB (REsp 1.061.530), capitalização (Súmulas 539 e 541),
 * Price × SAC, tarifas (Temas 618 e 958), seguro prestamista (Tema 972; Súmula 473 no SFH),
 * encargos da mora (Súmulas 472 e 379; multa de 2% do art. 52, §1º, do CDC) e campo livre.
 * Repetição do indébito: credor público, sempre simples; credor privado, em dobro (art. 42 do CDC),
 * com os valores anteriores e posteriores a 30/03/2021 (EAREsp 676.608) separados.
 */
import * as z from 'zod/v4';
import {
  Contexto, INDICES_CORRECAO, Linha, Resultado, bloco, competencia, dataBr, fatorCorrecao, finalizar, hojeIso,
  jurosPeriodo, mediaBcb, MEDIAS_BCB, moeda, nomeIndice, pct, r2, r6, somarMesesIso,
} from '../nucleo';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Opc = <T extends z.ZodType>(t: T) => t.nullable().optional();

export const TIPOS_FINANCIAMENTO = [
  'IMOBILIARIO', 'VEICULO', 'PESSOAL', 'CONSIGNADO_PRIVADO', 'CONSIGNADO_PUBLICO', 'CONSIGNADO_INSS',
  'CARTAO_ROTATIVO', 'CARTAO_PARCELADO', 'CHEQUE_ESPECIAL', 'CAPITAL_GIRO', 'CHEQUE_ESPECIAL_PJ',
] as const;

export const FinanciamentoParams = z.object({
  tipo: z.enum(TIPOS_FINANCIAMENTO),
  imobiliarioTaxa: z.enum(['MERCADO', 'REGULADO']).default('MERCADO'),
  credor: z.object({ nome: z.string().default('Instituição financeira'), natureza: z.enum(['PUBLICO', 'PRIVADO']).default('PRIVADO') }).default({ nome: 'Instituição financeira', natureza: 'PRIVADO' }),
  dataContratacao: Data,
  dataCalculo: Opc(Data),
  // Contratos parcelados
  valorLiberado: z.number().positive().describe('Valor efetivamente liberado ao cliente, sem as tarifas financiadas'),
  prazoMeses: z.number().int().min(1).max(480).default(1),
  primeiroVencimento: Opc(Data),
  taxaMensal: z.number().min(0).max(30).describe('Taxa de juros remuneratórios do contrato, % a.m.'),
  taxaAnual: Opc(z.number().min(0)),
  sistema: z.enum(['PRICE', 'SAC']).default('PRICE'),
  prestacaoContratada: Opc(z.number().positive()),
  parcelasPagas: z.number().int().min(0).default(0),
  pagamentos: z.array(z.object({ data: Data, valor: z.number().positive() })).default([]),
  // Rotativo (cartão e cheque especial)
  rotativo: z.object({ saldoUtilizado: z.number().min(0).default(0), meses: z.number().min(0).default(0), encargosCobrados: Opc(z.number().min(0)), inicio: Opc(Data) }).default({ saldoUtilizado: 0, meses: 0 }),
  capitalizacaoPactuada: z.boolean().default(false).describe('Cláusula expressa de capitalização mensal'),
  tarifas: z.array(z.object({
    tipo: z.enum(['TAC', 'TEC', 'CADASTRO', 'REGISTRO', 'AVALIACAO', 'SEGURO_PRESTAMISTA', 'SEGURO_HABITACIONAL', 'IOF', 'OUTRA']),
    valor: z.number().min(0), financiada: z.boolean().default(true), descricao: Opc(z.string()),
    servicoComprovado: Opc(z.boolean()), escolhaSeguradora: Opc(z.boolean()), indevida: Opc(z.boolean()),
  })).default([]),
  encargosMora: z.object({
    ativo: z.boolean().default(false), data: Opc(Data),
    comissaoPermanencia: z.number().min(0).default(0), jurosMoraCobrados: z.number().min(0).default(0),
    multaCobrada: z.number().min(0).default(0), baseMulta: z.number().min(0).default(0),
    jurosMoraPctMensal: Opc(z.number().min(0)), baseJurosMora: z.number().min(0).default(0), mesesMora: z.number().min(0).default(0),
  }).default({ ativo: false, comissaoPermanencia: 0, jurosMoraCobrados: 0, multaCobrada: 0, baseMulta: 0, baseJurosMora: 0, mesesMora: 0 }),
  teses: z.object({
    mediaBcb: z.boolean().default(true), capitalizacao: z.boolean().default(true), tarifas: z.boolean().default(true),
    seguro: z.boolean().default(true), mora: z.boolean().default(true),
  }).default({ mediaBcb: true, capitalizacao: true, tarifas: true, seguro: true, mora: true }),
  limiteDiscrepanciaPct: z.number().min(0).max(500).default(50).describe('Taxa considerada abusiva quando supera a média do BCB em mais de X%'),
  taxaMediaManual: Opc(z.number().min(0)),
  tetoConsignadoInss: Opc(z.number().min(0)),
  campoLivre: z.object({ ativo: z.boolean().default(false), descricao: z.string().default('Campo livre'), valor: z.number().default(0) }).default({ ativo: false, descricao: 'Campo livre', valor: 0 }),
  indiceCorrecao: z.enum(INDICES_CORRECAO).default('LEGAL'),
  citacaoEm: Opc(Data),
});
export type FinanciamentoParams = z.infer<typeof FinanciamentoParams>;

const ROTATIVOS = ['CARTAO_ROTATIVO', 'CHEQUE_ESPECIAL', 'CHEQUE_ESPECIAL_PJ'];
const PJ = ['CAPITAL_GIRO', 'CHEQUE_ESPECIAL_PJ'];
const EARESP_676608 = '2021-03-30';

function modalidade(p: FinanciamentoParams): string {
  if (p.tipo === 'IMOBILIARIO') return p.imobiliarioTaxa === 'REGULADO' ? 'IMOBILIARIO_REGULADO' : 'IMOBILIARIO_MERCADO';
  if (p.tipo === 'CARTAO_PARCELADO') return 'CARTAO_PARCELADO';
  return p.tipo;
}

/** Destaques por tipo de contrato (decisão 138) */
const DESTAQUES: Record<string, string[]> = {
  IMOBILIARIO: ['SFH/SFI: seguro habitacional (MIP/DFI) com seguradora indicada pelo banco é venda casada (Súmula 473 do STJ).', 'Capitalização mensal no SFH só com pactuação expressa (Lei 11.977/2009).', 'Conferir a TR e o sistema de amortização (SAC, Price ou SACRE).'],
  VEICULO: ['Tarifas de registro do contrato e de avaliação do bem: válidas só se o serviço foi prestado (Tema 958).', 'Seguro prestamista sem liberdade de escolha da seguradora: venda casada (Tema 972).', 'TAC e TEC só valem em contratos até 30/04/2008 (Tema 618); tarifa de cadastro é válida no início do relacionamento.'],
  PESSOAL: ['Comparar a taxa com a média do crédito pessoal não consignado no mês da contratação.', 'Seguro prestamista embutido: verificar a liberdade de escolha (Tema 972).'],
  CONSIGNADO_PRIVADO: ['Conferir a margem consignável e a autorização expressa do desconto.'],
  CONSIGNADO_PUBLICO: ['Conferir a margem consignável do regime do servidor e o limite de juros do órgão.'],
  CONSIGNADO_INSS: ['A taxa não pode superar o teto fixado pelo CNPS no mês da contratação (informar o teto vigente).', 'Conferir a margem de 35% (+ cartão consignado) e o cartão RMC/RCC.'],
  CARTAO_ROTATIVO: ['Desde 03/01/2024, juros e encargos do rotativo não podem superar 100% do principal (Lei 14.690/2023).', 'O rotativo só pode durar até o vencimento da fatura seguinte; depois deve ser parcelado (Res. CMN 4.549/2017).'],
  CARTAO_PARCELADO: ['Comparar com a média do cartão parcelado; conferir a capitalização.'],
  CHEQUE_ESPECIAL: ['Desde 06/01/2020, o cheque especial de pessoa física tem teto de 8% a.m. (Res. CMN 4.765/2019).'],
  CAPITAL_GIRO: ['Pessoa jurídica: o CDC só se aplica se demonstrada a vulnerabilidade (teoria finalista mitigada); sem isso, repetição simples e multa contratual.'],
  CHEQUE_ESPECIAL_PJ: ['Pessoa jurídica: o CDC só se aplica se demonstrada a vulnerabilidade; o teto de 8% a.m. vale só para pessoa física.'],
};

function prestacaoPrice(pv: number, i: number, n: number) {
  return i === 0 ? pv / n : pv * i / (1 - Math.pow(1 + i, -n));
}
/** Juros simples (método linear de Gauss), usado quando a capitalização não foi pactuada */
function prestacaoGauss(pv: number, i: number, n: number) {
  return i === 0 ? pv / n : pv * (1 + i * n) / (n * (1 + i * (n - 1) / 2));
}
function cronograma(sistema: 'PRICE' | 'SAC' | 'GAUSS', pv: number, i: number, n: number): number[] {
  if (sistema === 'SAC') {
    const amort = pv / n; const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(amort + (pv - amort * k) * i);
    return out;
  }
  const pmt = sistema === 'GAUSS' ? prestacaoGauss(pv, i, n) : prestacaoPrice(pv, i, n);
  return Array(n).fill(pmt);
}

export function calcularFinanciamento(ctx: Contexto, p: FinanciamentoParams): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const avisos: string[] = [];
  const fundamentos = new Set<string>(['CDC, art. 42, parágrafo único', 'REsp 1.061.530/RS (repetitivo)']);
  const ehPj = PJ.includes(p.tipo);
  const ehRotativo = ROTATIVOS.includes(p.tipo);
  const mod = modalidade(p);
  const comp = competencia(p.dataContratacao);

  // ── Taxa média do BCB ────────────────────────────────────────────────────
  const media = p.taxaMediaManual != null ? { taxa: p.taxaMediaManual, competencia: comp } : mediaBcb(ctx, mod, comp);
  if (media.taxa == null) avisos.push(`Taxa média do BCB (${MEDIAS_BCB[mod]?.nome}) não encontrada para ${dataBr(p.dataContratacao)}: informe manualmente.`);
  let taxaRev = p.taxaMensal;
  const teses: string[] = [];
  const limiteMedia = media.taxa != null ? media.taxa * (1 + p.limiteDiscrepanciaPct / 100) : null;
  if (p.teses.mediaBcb && media.taxa != null && limiteMedia != null && p.taxaMensal > limiteMedia) {
    taxaRev = media.taxa;
    teses.push(`Juros de ${pct(p.taxaMensal)} a.m. acima da média de ${pct(media.taxa)} a.m. (+${pct(p.limiteDiscrepanciaPct, 0)} de tolerância): limitados à média.`);
  } else if (media.taxa != null) teses.push(`Juros de ${pct(p.taxaMensal)} a.m. dentro do limite (média ${pct(media.taxa)} a.m. + ${pct(p.limiteDiscrepanciaPct, 0)}).`);
  if (p.tipo === 'CHEQUE_ESPECIAL' && p.dataContratacao >= '2020-01-06' && taxaRev > 8) {
    taxaRev = 8; teses.push('Cheque especial de pessoa física acima do teto de 8% a.m. (Res. CMN 4.765/2019).'); fundamentos.add('Res. CMN 4.765/2019');
  }
  if (p.tipo === 'CONSIGNADO_INSS') {
    if (p.tetoConsignadoInss != null && taxaRev > p.tetoConsignadoInss) { taxaRev = p.tetoConsignadoInss; teses.push(`Consignado INSS acima do teto do CNPS (${pct(p.tetoConsignadoInss)} a.m.).`); }
    if (p.tetoConsignadoInss == null) avisos.push('Consignado INSS: informe o teto de juros do CNPS vigente no mês da contratação.');
  }

  // ── Capitalização ────────────────────────────────────────────────────────
  const anualIndicaCap = p.taxaAnual != null && p.taxaAnual > p.taxaMensal * 12 + 0.01;
  const capPactuada = p.capitalizacaoPactuada || anualIndicaCap;
  const tirarCap = p.teses.capitalizacao && !capPactuada && p.sistema === 'PRICE';
  if (p.teses.capitalizacao) {
    fundamentos.add('Súmulas 539 e 541 do STJ');
    if (capPactuada) teses.push(anualIndicaCap ? 'Capitalização considerada pactuada: taxa anual superior ao duodécuplo da mensal (Súmula 541).' : 'Capitalização mensal pactuada expressamente (Súmula 539).');
    else if (p.sistema === 'PRICE') teses.push('Capitalização não pactuada: prestações recalculadas com juros simples (método linear).');
  }

  // ── Tarifas e seguro ─────────────────────────────────────────────────────
  const tarifasIndevidas: Array<{ t: any; motivo: string }> = [];
  for (const t of p.tarifas) {
    let motivo = '';
    if (p.teses.tarifas) {
      if ((t.tipo === 'TAC' || t.tipo === 'TEC') && p.dataContratacao > '2008-04-30') { motivo = 'TAC/TEC cobrada após 30/04/2008 (Tema 618)'; fundamentos.add('Tema 618 do STJ'); }
      if ((t.tipo === 'REGISTRO' || t.tipo === 'AVALIACAO') && t.servicoComprovado === false) { motivo = `${t.tipo === 'REGISTRO' ? 'Registro do contrato' : 'Avaliação do bem'} sem prova do serviço (Tema 958)`; fundamentos.add('Tema 958 do STJ'); }
      if (t.tipo === 'OUTRA' && t.indevida) motivo = `${t.descricao ?? 'Tarifa'} apontada como indevida`;
    }
    if (p.teses.seguro && (t.tipo === 'SEGURO_PRESTAMISTA' || t.tipo === 'SEGURO_HABITACIONAL') && t.escolhaSeguradora === false) {
      motivo = t.tipo === 'SEGURO_HABITACIONAL' ? 'Seguro habitacional com seguradora imposta (Súmula 473)' : 'Seguro prestamista sem escolha da seguradora (Tema 972)';
      fundamentos.add(t.tipo === 'SEGURO_HABITACIONAL' ? 'Súmula 473 do STJ' : 'Tema 972 do STJ');
    }
    if (motivo) tarifasIndevidas.push({ t, motivo });
  }
  const financiadas = p.tarifas.filter((t) => t.financiada).reduce((s, t) => s + t.valor, 0);
  const indevidasFinanciadas = tarifasIndevidas.filter((x) => x.t.financiada).reduce((s, x) => s + x.t.valor, 0);
  const pvContrato = p.valorLiberado + financiadas;
  const pvRevisado = pvContrato - indevidasFinanciadas;

  const linhasIndebito: any[] = [];
  const addIndebito = (data: string, descricao: string, valor: number) => {
    if (valor <= 0.004) return;
    const f = fatorCorrecao(ctx, p.indiceCorrecao, data, base);
    linhasIndebito.push({ data, descricao, valor: r2(valor), fator: r6(f.fator), corrigido: r2(valor * f.fator), _ref: { fator: { tipo: 'fator', indice: p.indiceCorrecao, de: f.de, ate: f.ate } } });
  };
  const tabelas: Resultado['tabelas'] = [];
  const resumo: Resultado['resumo'] = [
    { rotulo: 'Credor', valor: `${p.credor.nome} (${p.credor.natureza === 'PUBLICO' ? 'órgão/ente público' : 'instituição privada'})` },
    { rotulo: 'Taxa do contrato (% a.m.)', valor: p.taxaMensal },
    { rotulo: 'Média do BCB (% a.m.)', valor: media.taxa ?? 'não encontrada' },
    { rotulo: 'Taxa revisada (% a.m.)', valor: r6(taxaRev) },
  ];

  if (!ehRotativo) {
    // ── Contratos parcelados ───────────────────────────────────────────────
    const n = p.prazoMeses; const i = p.taxaMensal / 100; const iR = taxaRev / 100;
    const original = cronograma(p.sistema, pvContrato, i, n);
    if (p.prestacaoContratada && p.sistema === 'PRICE') for (let k = 0; k < n; k++) original[k] = p.prestacaoContratada;
    const revisado = cronograma(tirarCap ? 'GAUSS' : p.sistema, pvRevisado, iR, n);
    const pv1 = p.primeiroVencimento ?? somarMesesIso(p.dataContratacao, 1);
    const pagas = Math.min(n, Math.max(p.parcelasPagas, p.pagamentos.length));
    const linhasParc: any[] = [];
    for (let k = 0; k < pagas; k++) {
      const data = p.pagamentos[k]?.data ?? somarMesesIso(pv1, k);
      const pago = r2(p.pagamentos[k]?.valor ?? original[k]);
      const devido = r2(revisado[k]);
      const dif = r2(Math.max(0, pago - devido));
      const f = fatorCorrecao(ctx, p.indiceCorrecao, data, base);
      linhasParc.push({ numero: k + 1, data, pago, devido, diferenca: dif, fator: r6(f.fator), corrigido: r2(dif * f.fator), _ref: { fator: { tipo: 'fator', indice: p.indiceCorrecao, de: f.de, ate: f.ate } } });
    }
    for (const l of linhasParc) if (l.diferenca > 0) linhasIndebito.push({ data: l.data, descricao: `Parcela ${l.numero}: pago a mais`, valor: l.diferenca, fator: l.fator, corrigido: l.corrigido, _ref: l._ref });
    for (const x of tarifasIndevidas.filter((y) => !y.t.financiada)) addIndebito(p.dataContratacao, `${x.motivo} (paga à vista)`, x.t.valor);
    tabelas.push({
      id: 'parcelas', titulo: 'Parcelas pagas: contratado × revisado', linhas: linhasParc, colunas: [
        { chave: 'numero', titulo: 'Nº', tipo: 'numero' }, { chave: 'data', titulo: 'Vencimento', tipo: 'data' },
        { chave: 'pago', titulo: 'Valor pago', tipo: 'moeda', total: true }, { chave: 'devido', titulo: 'Devido após revisão', tipo: 'moeda', total: true },
        { chave: 'diferenca', titulo: 'Pago a mais', tipo: 'moeda', formula: 'MAX(0,{pago}-{devido})', total: true },
        { chave: 'fator', titulo: 'Fator de correção', tipo: 'fator' }, { chave: 'corrigido', titulo: 'Corrigido', tipo: 'moeda', formula: '{diferenca}*{fator}', total: true },
      ],
    });
    // Price × SAC à taxa revisada
    const comp2 = (['PRICE', 'SAC'] as const).map((s) => {
      const c = cronograma(s, pvRevisado, iR, n); const tot = c.reduce((a, b) => a + b, 0);
      return { sistema: s === 'PRICE' ? 'Price (prestação fixa)' : 'SAC (amortização constante)', primeira: r2(c[0]), ultima: r2(c[n - 1]), total: r2(tot), juros: r2(tot - pvRevisado) };
    });
    tabelas.push({ id: 'price_sac', titulo: `Price × SAC à taxa revisada (${pct(taxaRev)} a.m.)`, linhas: comp2, colunas: [
      { chave: 'sistema', titulo: 'Sistema', tipo: 'texto' }, { chave: 'primeira', titulo: '1ª prestação', tipo: 'moeda' }, { chave: 'ultima', titulo: 'Última prestação', tipo: 'moeda' },
      { chave: 'total', titulo: 'Total a pagar', tipo: 'moeda' }, { chave: 'juros', titulo: 'Total de juros', tipo: 'moeda' },
    ] });
    resumo.push(
      { rotulo: 'Valor financiado (com tarifas)', valor: r2(pvContrato) },
      { rotulo: 'Prestação contratada', valor: r2(original[0]) },
      { rotulo: 'Prestação revisada', valor: r2(revisado[0]) },
      { rotulo: 'Parcelas pagas', valor: pagas },
    );
    if (pagas < n) resumo.push({ rotulo: 'Prestações restantes revisadas', valor: `${n - pagas} × ${moeda(revisado[pagas])}` });
  } else {
    // ── Rotativo (cartão e cheque especial) ────────────────────────────────
    const r = p.rotativo; const m = r.meses; const sU = r.saldoUtilizado;
    const encCobrados = r.encargosCobrados ?? (capPactuada ? sU * (Math.pow(1 + p.taxaMensal / 100, m) - 1) : sU * p.taxaMensal / 100 * m);
    let encDevidos = capPactuada || !p.teses.capitalizacao ? sU * (Math.pow(1 + taxaRev / 100, m) - 1) : sU * taxaRev / 100 * m;
    if (p.tipo === 'CARTAO_ROTATIVO' && (r.inicio ?? p.dataContratacao) >= '2024-01-03' && encDevidos > sU) {
      encDevidos = sU; teses.push('Encargos do rotativo limitados a 100% do principal (Lei 14.690/2023).'); fundamentos.add('Lei 14.690/2023, art. 28');
    }
    resumo.push({ rotulo: 'Saldo utilizado', valor: sU }, { rotulo: 'Encargos cobrados', valor: r2(encCobrados) }, { rotulo: 'Encargos devidos', valor: r2(encDevidos) });
    addIndebito(r.inicio ?? p.dataContratacao, 'Encargos do rotativo cobrados a mais', encCobrados - encDevidos);
  }
  for (const x of tarifasIndevidas.filter((y) => y.t.financiada)) teses.push(`${x.motivo}: ${moeda(x.t.valor)} retirados do valor financiado.`);

  // ── Encargos da mora ─────────────────────────────────────────────────────
  const em = p.encargosMora;
  if (p.teses.mora && em.ativo) {
    const data = em.data ?? base;
    if (em.comissaoPermanencia > 0 && (em.jurosMoraCobrados > 0 || em.multaCobrada > 0)) {
      addIndebito(data, 'Juros de mora e multa cumulados com comissão de permanência (Súmula 472)', em.jurosMoraCobrados + em.multaCobrada);
      fundamentos.add('Súmula 472 do STJ');
    } else {
      if (!ehPj && em.baseMulta > 0 && em.multaCobrada > em.baseMulta * 0.02) { addIndebito(data, 'Multa moratória acima de 2% (art. 52, §1º, do CDC)', em.multaCobrada - em.baseMulta * 0.02); fundamentos.add('CDC, art. 52, §1º'); }
      if (em.jurosMoraPctMensal != null && em.jurosMoraPctMensal > 1 && em.baseJurosMora > 0) { addIndebito(data, 'Juros de mora acima de 1% a.m. (Súmula 379)', em.baseJurosMora * (em.jurosMoraPctMensal - 1) / 100 * em.mesesMora); fundamentos.add('Súmula 379 do STJ'); }
    }
  }
  if (p.campoLivre.ativo && p.campoLivre.valor) addIndebito(p.dataContratacao, p.campoLivre.descricao, p.campoLivre.valor);

  // ── Repetição do indébito ────────────────────────────────────────────────
  linhasIndebito.sort((a, b) => a.data.localeCompare(b.data));
  const totalCorr = r2(linhasIndebito.reduce((s, l) => s + l.corrigido, 0));
  const antes = r2(linhasIndebito.filter((l) => l.data < EARESP_676608).reduce((s, l) => s + l.corrigido, 0));
  const depois = r2(totalCorr - antes);
  const publico = p.credor.natureza === 'PUBLICO';
  const linhasB: Linha[] = [{ rotulo: 'Valores pagos a mais, corrigidos', valor: totalCorr, formula: `correção: ${nomeIndice(p.indiceCorrecao)}` }];
  if (!publico) {
    linhasB.push({ rotulo: 'Dobra do art. 42 do CDC — cobranças até 30/03/2021', valor: antes, fundamento: 'art. 42, parágrafo único, do CDC; EAREsp 676.608 (modulação: para contratos fora de serviço público, a dobra independe de má-fé só para cobranças posteriores a 30/03/2021)' });
    linhasB.push({ rotulo: 'Dobra do art. 42 do CDC — cobranças após 30/03/2021', valor: depois, fundamento: 'art. 42, parágrafo único, do CDC; EAREsp 676.608' });
    if (antes > 0) avisos.push(`Dobra sobre cobranças anteriores a 30/03/2021 (${moeda(antes)}): risco maior, a modulação do EAREsp 676.608 exige má-fé para esse período.`);
    if (ehPj) avisos.push('Devedor pessoa jurídica: demonstrar a vulnerabilidade para aplicar o CDC e a dobra; sem isso, a devolução é simples.');
  } else avisos.push('Credor público: repetição do indébito sempre simples (decisão 139).');
  const sub = r2(linhasB.reduce((s, l) => s + l.valor, 0));
  if (p.citacaoEm) {
    const j = jurosPeriodo(ctx, p.citacaoEm, base);
    linhasB.push({ rotulo: 'Juros de mora desde a citação', valor: r2(sub * j.percentual / 100), formula: `${moeda(sub)} × ${pct(j.percentual, 4)}`, fundamento: 'art. 405 do CC; art. 406 do CC' });
  } else linhasB.push({ rotulo: 'Juros de mora desde a citação', valor: 0, formula: 'citação ainda não informada' });

  tabelas.unshift({
    id: 'indebito', titulo: 'Valores pagos a mais (indébito)', linhas: linhasIndebito, colunas: [
      { chave: 'data', titulo: 'Data', tipo: 'data' }, { chave: 'descricao', titulo: 'Origem', tipo: 'texto' },
      { chave: 'valor', titulo: 'Valor', tipo: 'moeda', total: true }, { chave: 'fator', titulo: 'Fator de correção', tipo: 'fator' },
      { chave: 'corrigido', titulo: 'Corrigido', tipo: 'moeda', formula: '{valor}*{fator}', total: true },
    ],
  });

  const blocoTeses = bloco('teses', 'Teses aplicadas', [], { observacoes: teses.length ? teses : ['Nenhuma tese ligada alterou o contrato.'] });
  const blocoIndebito = bloco('indebito', publico ? 'Repetição do indébito (simples — credor público)' : 'Repetição do indébito (em dobro — art. 42 do CDC)', linhasB, { recomendado: true });

  return finalizar(ctx, {
    tipo: 'FINANCIAMENTO', titulo: `Revisão de contrato — ${p.tipo.replace(/_/g, ' ').toLowerCase()}`, dataBase: base,
    resumo: [...resumo, { rotulo: 'Indébito total', valor: blocoIndebito.total.valor }],
    blocos: [blocoIndebito, blocoTeses], tabelas, avisos,
    fundamentos: [...fundamentos],
    destaques: DESTAQUES[p.tipo] ?? [],
    premissas: [
      `Taxa média do BCB do mês da contratação (${MEDIAS_BCB[mod]?.nome ?? mod}, série ${MEDIAS_BCB[mod]?.codigo ?? '—'}).`,
      `Valores pagos a mais corrigidos pelo ${nomeIndice(p.indiceCorrecao)} desde cada pagamento até ${dataBr(base)}.`,
      'Recálculo pelo mesmo sistema do contrato; sem capitalização pactuada, Price recalculada pelo método linear (juros simples).',
    ],
    totalPrincipal: blocoIndebito.total.valor,
  });
}
