/**
 * JURYSONE — Preços da API do Claude (US$ por milhão de tokens), tabela oficial da Anthropic
 * conferida em 20/11/2026. Escrita no cache = 1,25 × entrada (cache de 5 minutos).
 * Se a Anthropic mudar os preços, atualize aqui; o custo de cada chamada fica gravado com o preço do dia.
 */
export interface PrecoModelo { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }

const TABELA: Array<[string, PrecoModelo]> = [
  ['claude-opus-5-5',   { entrada: 4,    saida: 20,   cacheLeitura: 0.20, cacheEscrita: 5 }],
  ['claude-sonnet-5-5', { entrada: 2,    saida: 10,   cacheLeitura: 0.10, cacheEscrita: 2.5 }],
  ['claude-haiku-5-5',  { entrada: 0.10, saida: 0.50, cacheLeitura: 0.01, cacheEscrita: 0.125 }],
  // modelos de reserva (fallback do servidor quando o principal recusa)
  ['claude-opus-5',     { entrada: 5,    saida: 25,   cacheLeitura: 0.50, cacheEscrita: 6.25 }],
  ['claude-sonnet-5',   { entrada: 2,    saida: 10,   cacheLeitura: 0.20, cacheEscrita: 2.5 }],
  ['claude-opus-4-8',   { entrada: 5,    saida: 25,   cacheLeitura: 0.50, cacheEscrita: 6.25 }],
];

/** Haiku 5.5 acima de 100 mil tokens de entrada custa 5× */
const HAIKU_LONGO: PrecoModelo = { entrada: 0.50, saida: 2.50, cacheLeitura: 0.05, cacheEscrita: 0.625 };

/** Modelo desconhecido: usa o preço mais alto da tabela, para nunca subestimar o gasto */
const RESERVA: PrecoModelo = { entrada: 5, saida: 25, cacheLeitura: 0.50, cacheEscrita: 6.25 };

export interface Tokens { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }

export function tokensDe(usage: any): Tokens {
  const n = (v: any) => (Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : 0);
  return {
    entrada: n(usage?.input_tokens),
    saida: n(usage?.output_tokens),
    cacheLeitura: n(usage?.cache_read_input_tokens),
    cacheEscrita: n(usage?.cache_creation_input_tokens),
  };
}

export function precoDe(modelo: string, t: Tokens): { preco: PrecoModelo; conhecido: boolean } {
  const m = String(modelo ?? '');
  // a correspondência mais longa vence (claude-opus-5-5 antes de claude-opus-5)
  const achado = TABELA.filter(([id]) => m === id || m.startsWith(id + '-') || m.startsWith(id + '@'))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!achado) return { preco: RESERVA, conhecido: false };
  if (achado[0] === 'claude-haiku-5-5' && t.entrada + t.cacheLeitura + t.cacheEscrita > 100_000) return { preco: HAIKU_LONGO, conhecido: true };
  return { preco: achado[1], conhecido: true };
}

/** Custo em dólares de uma resposta */
export function custoUsd(modelo: string, t: Tokens): number {
  const { preco } = precoDe(modelo, t);
  const v = (t.entrada * preco.entrada + t.saida * preco.saida + t.cacheLeitura * preco.cacheLeitura + t.cacheEscrita * preco.cacheEscrita) / 1_000_000;
  return Math.round(v * 1_000_000) / 1_000_000;
}
