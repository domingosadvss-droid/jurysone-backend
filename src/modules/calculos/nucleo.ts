/**
 * JURYSONE — Núcleo das calculadoras (etapa 5)
 *
 * Funções puras: datas, arredondamento, índices e juros. Nada aqui acessa banco ou rede;
 * os índices chegam prontos num mapa (série → competência AAAA-MM → % do mês).
 *
 * Convenções (repetidas na memória de cálculo):
 *   • Correção monetária: fator = Π (1 + índice/100) dos meses de mês(início) até o mês
 *     anterior ao mês final. Mês sem índice divulgado entra como 0% e gera aviso "conferir".
 *   • Juros de mora: simples (soma das taxas mensais) nos mesmos meses. Taxa legal:
 *     1% a.m. até agosto/2024; a partir de setembro/2024, Selic do mês − IPCA do mês,
 *     com mínimo 0 (art. 406 do CC, redação da Lei 14.905/2024).
 *   • Valores em reais arredondados a 2 casas em cada linha; fatores sem arredondamento.
 */

// ═══════════════════════ SÉRIES DO BANCO CENTRAL (SGS) ═══════════════════

export interface SerieBcb { codigo: string; nome: string; confirmada: boolean; tipo: 'INDICE' | 'TAXA' | 'MEDIA' }

/** Índices de correção e taxas (códigos do SGS). "confirmada": conferido no portal de dados abertos do BCB. */
export const SERIES: Record<string, SerieBcb> = {
  IPCA: { codigo: '433', nome: 'IPCA (IBGE)', confirmada: true, tipo: 'INDICE' },
  INPC: { codigo: '188', nome: 'INPC (IBGE)', confirmada: true, tipo: 'INDICE' },
  IGPM: { codigo: '189', nome: 'IGP-M (FGV)', confirmada: true, tipo: 'INDICE' },
  IGPDI: { codigo: '190', nome: 'IGP-DI (FGV)', confirmada: true, tipo: 'INDICE' },
  INCC: { codigo: '192', nome: 'INCC-DI (FGV)', confirmada: true, tipo: 'INDICE' },
  INCC_M: { codigo: '7456', nome: 'INCC-M (FGV)', confirmada: false, tipo: 'INDICE' },
  IPCAE: { codigo: '10764', nome: 'IPCA-E (IBGE)', confirmada: false, tipo: 'INDICE' },
  SELIC: { codigo: '4390', nome: 'Selic acumulada no mês', confirmada: true, tipo: 'TAXA' },
  TR: { codigo: '226', nome: 'TR (taxa referencial, período iniciado no dia 1º)', confirmada: false, tipo: 'TAXA' },
};

/** Taxas médias mensais de juros do BCB (% a.m.) por modalidade — REsp 1.061.530 */
export const MEDIAS_BCB: Record<string, SerieBcb> = {
  VEICULO: { codigo: '25471', nome: 'PF — aquisição de veículos', confirmada: true, tipo: 'MEDIA' },
  PESSOAL: { codigo: '25464', nome: 'PF — crédito pessoal não consignado', confirmada: true, tipo: 'MEDIA' },
  PESSOAL_TOTAL: { codigo: '25470', nome: 'PF — crédito pessoal total', confirmada: true, tipo: 'MEDIA' },
  CONSIGNADO_PRIVADO: { codigo: '25466', nome: 'PF — consignado para trabalhadores do setor privado', confirmada: true, tipo: 'MEDIA' },
  CONSIGNADO_PUBLICO: { codigo: '25467', nome: 'PF — consignado para trabalhadores do setor público', confirmada: true, tipo: 'MEDIA' },
  CONSIGNADO_INSS: { codigo: '25468', nome: 'PF — consignado para aposentados e pensionistas do INSS', confirmada: true, tipo: 'MEDIA' },
  CHEQUE_ESPECIAL: { codigo: '25463', nome: 'PF — cheque especial', confirmada: true, tipo: 'MEDIA' },
  CARTAO_ROTATIVO: { codigo: '25477', nome: 'PF — cartão de crédito rotativo', confirmada: true, tipo: 'MEDIA' },
  CARTAO_PARCELADO: { codigo: '25478', nome: 'PF — cartão de crédito parcelado', confirmada: true, tipo: 'MEDIA' },
  CARTAO_TOTAL: { codigo: '25479', nome: 'PF — cartão de crédito total', confirmada: true, tipo: 'MEDIA' },
  IMOBILIARIO_MERCADO: { codigo: '25497', nome: 'PF — financiamento imobiliário com taxas de mercado', confirmada: true, tipo: 'MEDIA' },
  IMOBILIARIO_REGULADO: { codigo: '25498', nome: 'PF — financiamento imobiliário com taxas reguladas', confirmada: true, tipo: 'MEDIA' },
  IMOBILIARIO_TOTAL: { codigo: '25499', nome: 'PF — financiamento imobiliário total', confirmada: true, tipo: 'MEDIA' },
  CAPITAL_GIRO: { codigo: '25444', nome: 'PJ — capital de giro total', confirmada: true, tipo: 'MEDIA' },
  CHEQUE_ESPECIAL_PJ: { codigo: '25446', nome: 'PJ — cheque especial', confirmada: true, tipo: 'MEDIA' },
  PJ_TOTAL: { codigo: '25437', nome: 'PJ — total recursos livres', confirmada: true, tipo: 'MEDIA' },
};

export const INDICES_CORRECAO = ['IPCA', 'INPC', 'IGPM', 'IGPDI', 'INCC', 'INCC_M', 'IPCAE', 'LEGAL', 'NENHUM'] as const;
export type IndiceCorrecao = (typeof INDICES_CORRECAO)[number];

/** Rótulo do índice de correção escolhido */
export function nomeIndice(i: string): string {
  if (i === 'LEGAL') return 'INPC até ago/2024 e IPCA desde set/2024 (Lei 14.905/2024)';
  if (i === 'NENHUM') return 'sem correção monetária';
  return SERIES[i]?.nome ?? i;
}

/** Mapa série (chave de SERIES/MEDIAS_BCB) → competência → valor (%) */
export type MapaIndices = Record<string, Record<string, number>>;

// ═══════════════════════ DATAS ═══════════════════════════════════════════

export const LEI_14905_COMPETENCIA = '2024-09';
export const LEI_14905_DATA = '2024-08-30';

export function hojeIso(): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export function validaData(s: any): string | null {
  const t = String(s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t + 'T00:00:00Z')) ? t : null;
}

export function competencia(dia: string): string {
  return dia.slice(0, 7);
}

export function somarMesesComp(comp: string, n: number): string {
  const [a, m] = comp.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export function diffMesesComp(de: string, ate: string): number {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return (a2 * 12 + m2) - (a1 * 12 + m1);
}

/** Competências de mês(início) até o mês anterior ao mês(fim) */
export function mesesDoPeriodo(inicio: string, fim: string): string[] {
  const de = competencia(inicio);
  const ate = somarMesesComp(competencia(fim), -1);
  const out: string[] = [];
  for (let c = de; diffMesesComp(c, ate) >= 0; c = somarMesesComp(c, 1)) out.push(c);
  return out;
}

export function compsEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let c = de; diffMesesComp(c, ate) >= 0; c = somarMesesComp(c, 1)) out.push(c);
  return out;
}

export function somarDiasIso(dia: string, n: number): string {
  const d = new Date(dia + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function somarMesesIso(dia: string, n: number): string {
  const d = new Date(dia + 'T12:00:00Z');
  const alvoDia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(alvoDia, ultimo));
  return d.toISOString().slice(0, 10);
}

export function somarAnosIso(dia: string, n: number): string {
  return somarMesesIso(dia, 12 * n);
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}

export function dataBr(dia: string | null | undefined): string {
  if (!dia) return '—';
  return dia.slice(0, 10).split('-').reverse().join('/');
}

export function compBr(comp: string): string {
  const [a, m] = comp.split('-');
  return `${m}/${a}`;
}

export function maxData(...d: (string | null | undefined)[]): string {
  return d.filter(Boolean).sort().pop() as string;
}

export function minData(...d: (string | null | undefined)[]): string {
  return d.filter(Boolean).sort()[0] as string;
}

// ═══════════════════════ NÚMEROS ═════════════════════════════════════════

export function r2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

export function r6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export function moeda(v: number): string {
  return (v < 0 ? '-' : '') + 'R$ ' + Math.abs(r2(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function pct(v: number, casas = 2): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';
}

// ═══════════════════════ ÍNDICES E JUROS ═════════════════════════════════

export interface Contexto {
  indices: MapaIndices;
  /** competências que faltaram, por série (preenchido durante o cálculo) */
  faltando: Record<string, Set<string>>;
  /** séries usadas */
  usadas: Set<string>;
}

export function novoContexto(indices: MapaIndices): Contexto {
  return { indices, faltando: {}, usadas: new Set() };
}

function taxaDo(ctx: Contexto, serie: string, comp: string): number {
  ctx.usadas.add(serie);
  const v = ctx.indices[serie]?.[comp];
  if (v === undefined || v === null || Number.isNaN(v)) {
    (ctx.faltando[serie] ??= new Set()).add(comp);
    return 0;
  }
  return v;
}

/** Série efetiva de um índice de correção numa competência (LEGAL = INPC até 08/2024, IPCA depois) */
export function serieDoIndice(indice: string, comp: string): string | null {
  if (indice === 'NENHUM') return null;
  if (indice === 'LEGAL') return comp < LEI_14905_COMPETENCIA ? 'INPC' : 'IPCA';
  return indice;
}

export interface Fator { fator: number; de: string | null; ate: string | null; meses: number }

/** Fator de correção entre duas datas pelo índice escolhido */
export function fatorCorrecao(ctx: Contexto, indice: string, inicio: string, fim: string): Fator {
  const meses = inicio < fim ? mesesDoPeriodo(inicio, fim) : [];
  let f = 1;
  for (const c of meses) {
    const s = serieDoIndice(indice, c);
    if (s) f *= 1 + taxaDo(ctx, s, c) / 100;
  }
  return { fator: f, de: meses[0] ?? null, ate: meses[meses.length - 1] ?? null, meses: meses.length };
}

/** Taxa legal de juros do mês (% a.m.) */
export function jurosLegalMes(ctx: Contexto, comp: string): number {
  if (comp < LEI_14905_COMPETENCIA) return 1;
  return Math.max(0, taxaDo(ctx, 'SELIC', comp) - taxaDo(ctx, 'IPCA', comp));
}

export interface Juros { percentual: number; de: string | null; ate: string | null; meses: number }

/** Juros simples pela taxa legal (ou taxa fixa mensal, se informada) entre duas datas */
export function jurosPeriodo(ctx: Contexto, inicio: string | null | undefined, fim: string, taxaFixaMensal?: number | null): Juros {
  if (!inicio || inicio >= fim) return { percentual: 0, de: null, ate: null, meses: 0 };
  const meses = mesesDoPeriodo(inicio, fim);
  let p = 0;
  for (const c of meses) p += taxaFixaMensal != null ? taxaFixaMensal : jurosLegalMes(ctx, c);
  return { percentual: p, de: meses[0] ?? null, ate: meses[meses.length - 1] ?? null, meses: meses.length };
}

/** Soma simples de uma série (ex.: Selic) entre duas datas — usada na Justiça do Trabalho e na EC 113 */
export function somaSerie(ctx: Contexto, serie: string, inicio: string, fim: string): Juros {
  if (inicio >= fim) return { percentual: 0, de: null, ate: null, meses: 0 };
  const meses = mesesDoPeriodo(inicio, fim);
  let p = 0;
  for (const c of meses) p += taxaDo(ctx, serie, c);
  return { percentual: p, de: meses[0] ?? null, ate: meses[meses.length - 1] ?? null, meses: meses.length };
}

/** Taxa média do BCB para a modalidade no mês (ou o mês anterior mais próximo nos 6 meses anteriores) */
export function mediaBcb(ctx: Contexto, modalidade: string, comp: string): { taxa: number | null; competencia: string | null } {
  ctx.usadas.add(modalidade);
  for (let i = 0; i <= 6; i++) {
    const c = somarMesesComp(comp, -i);
    const v = ctx.indices[modalidade]?.[c];
    if (v !== undefined && v !== null) return { taxa: v, competencia: c };
  }
  (ctx.faltando[modalidade] ??= new Set()).add(comp);
  return { taxa: null, competencia: null };
}

// ═══════════════════════ RESULTADO PADRONIZADO ═══════════════════════════

export interface Linha { rotulo: string; valor: number; formula?: string; fundamento?: string; destaque?: boolean }
export interface Bloco { id: string; titulo: string; subtitulo?: string; linhas: Linha[]; total: Linha; observacoes?: string[]; recomendado?: boolean }
export type TipoColuna = 'data' | 'competencia' | 'moeda' | 'pct' | 'fator' | 'texto' | 'numero';
export interface Coluna { chave: string; titulo: string; tipo: TipoColuna; formula?: string; total?: boolean }
/**
 * Referência de uma célula calculada a partir da aba "Índices" do Excel:
 *   fator → produto (1 + índice/100) dos meses de..ate (índice: IPCA, INPC, LEGAL...)
 *   soma  → soma simples das taxas mensais (serie: JUROS_LEGAL, SELIC, TR, POUPANCA, ou taxa fixa)
 */
export type RefCelula =
  | { tipo: 'fator'; indice: string; de: string | null; ate: string | null }
  | { tipo: 'soma'; serie: string; de: string | null; ate: string | null; fixa?: number | null };
export type RefLinha = Record<string, RefCelula>;
export interface Tabela { id: string; titulo: string; colunas: Coluna[]; linhas: Array<Record<string, any> & { _ref?: RefLinha }> }

export interface Resultado {
  tipo: string;
  titulo: string;
  dataBase: string;
  resumo: Array<{ rotulo: string; valor: number | string }>;
  blocos: Bloco[];
  tabelas: Tabela[];
  avisos: string[];
  fundamentos: string[];
  destaques: string[];
  premissas: string[];
  totalPrincipal: number;
  indicesUsados?: Array<{ chave: string; codigo: string; nome: string; faltando: string[]; confirmada: boolean }>;
  indicesAte?: string | null;
}

export function bloco(id: string, titulo: string, linhas: Linha[], extra: Partial<Bloco> & { rotuloTotal?: string } = {}): Bloco {
  const ls = linhas.map((l) => ({ ...l, valor: r2(l.valor) }));
  const total = r2(ls.reduce((s, l) => s + l.valor, 0));
  const { rotuloTotal, ...resto } = extra;
  return { id, titulo, linhas: ls, total: { rotulo: rotuloTotal ?? 'Total', valor: total, destaque: true }, ...resto };
}

/** Fecha o resultado: lista índices usados, faltantes (aviso "conferir") e a última competência disponível */
export function finalizar(ctx: Contexto, r: Omit<Resultado, 'indicesUsados' | 'indicesAte'>): Resultado {
  const usados: Resultado['indicesUsados'] = [];
  let ultima: string | null = null;
  for (const chave of [...ctx.usadas].sort()) {
    const s = SERIES[chave] ?? MEDIAS_BCB[chave];
    if (!s) continue;
    const falt = [...(ctx.faltando[chave] ?? [])].sort();
    usados.push({ chave, codigo: s.codigo, nome: s.nome, faltando: falt, confirmada: s.confirmada });
    if (falt.length) r.avisos.push(`CONFERIR: ${s.nome} sem valor divulgado em ${falt.map(compBr).join(', ')} — entrou como 0%.`);
    if (!s.confirmada) r.avisos.push(`CONFERIR: o código ${s.codigo} do SGS para ${s.nome} ainda não foi conferido no portal do BCB.`);
    const comps = Object.keys(ctx.indices[chave] ?? {}).sort();
    const u = comps[comps.length - 1];
    if (u && SERIES[chave] && (!ultima || u < ultima)) ultima = u;
  }
  return { ...r, indicesUsados: usados, indicesAte: ultima };
}

/** Linha de tabela de correção de uma parcela (valor × fator) com referência para o Excel */
export function linhaCorrigida(ctx: Contexto, indice: string, data: string, valor: number, dataBase: string, extra: Record<string, any> = {}) {
  const f = fatorCorrecao(ctx, indice, data, dataBase);
  return {
    linha: { data, valor: r2(valor), fator: r6(f.fator), corrigido: r2(valor * f.fator), ...extra, _ref: { fator: { tipo: 'fator', indice, de: f.de, ate: f.ate } } as RefLinha },
    fator: f.fator,
    corrigido: r2(valor * f.fator),
  };
}

export const COLUNAS_CORRECAO: Coluna[] = [
  { chave: 'data', titulo: 'Data', tipo: 'data' },
  { chave: 'descricao', titulo: 'Descrição', tipo: 'texto' },
  { chave: 'valor', titulo: 'Valor original', tipo: 'moeda', total: true },
  { chave: 'fator', titulo: 'Fator de correção', tipo: 'fator' },
  { chave: 'corrigido', titulo: 'Valor corrigido', tipo: 'moeda', formula: '{valor}*{fator}', total: true },
];
