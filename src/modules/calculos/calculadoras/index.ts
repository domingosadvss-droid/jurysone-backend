/**
 * Registro das calculadoras: esquema de parâmetros (zod), função de cálculo e séries que precisa.
 */
import * as z from 'zod/v4';
import { Contexto, MEDIAS_BCB, Resultado, SERIES, hojeIso } from '../nucleo';
import { DistratoParams, calcularDistrato } from './distrato';
import { AtrasoObraParams, calcularAtrasoObra } from './atraso-obra';
import { FinanciamentoParams, calcularFinanciamento } from './financiamento';
import { TrabalhistaParams, calcularTrabalhista } from './trabalhista';
import { DebitoParams, LocacaoParams, calcularDebito, calcularLocacao } from './debito-locacao';
import { InssParams, PensaoParams, calcularInss, calcularPensao } from './familia-previdencia';
import { FaixaCustas, ValorCausaParams, calcularValorCausa } from './valor-causa';

export interface Extras { custas?: FaixaCustas[] }

export interface Calculadora {
  tipo: string;
  nome: string;
  schema: z.ZodType<any>;
  calcular: (ctx: Contexto, p: any, extras: Extras) => Resultado;
  /** taxas médias do BCB que a calculadora usa */
  medias?: (p: any) => string[];
}

export const CALCULADORAS: Record<string, Calculadora> = {
  DISTRATO: { tipo: 'DISTRATO', nome: 'Distrato de imóvel na planta', schema: DistratoParams, calcular: (c, p) => calcularDistrato(c, p) },
  ATRASO_OBRA: { tipo: 'ATRASO_OBRA', nome: 'Atraso na entrega de imóvel', schema: AtrasoObraParams, calcular: (c, p) => calcularAtrasoObra(c, p) },
  FINANCIAMENTO: {
    tipo: 'FINANCIAMENTO', nome: 'Revisão de financiamento / contrato bancário', schema: FinanciamentoParams, calcular: (c, p) => calcularFinanciamento(c, p),
    medias: (p) => [p.tipo === 'IMOBILIARIO' ? (p.imobiliarioTaxa === 'REGULADO' ? 'IMOBILIARIO_REGULADO' : 'IMOBILIARIO_MERCADO') : p.tipo].filter((k) => MEDIAS_BCB[k]),
  },
  TRABALHISTA: { tipo: 'TRABALHISTA', nome: 'Estimativa trabalhista (empregado)', schema: TrabalhistaParams, calcular: (c, p) => calcularTrabalhista(c, p) },
  DEBITO: { tipo: 'DEBITO', nome: 'Atualização de débito / cumprimento de sentença', schema: DebitoParams, calcular: (c, p) => calcularDebito(c, p) },
  LOCACAO: { tipo: 'LOCACAO', nome: 'Locação — atrasados e reajuste', schema: LocacaoParams, calcular: (c, p) => calcularLocacao(c, p) },
  PENSAO: { tipo: 'PENSAO', nome: 'Pensão alimentícia em atraso', schema: PensaoParams, calcular: (c, p) => calcularPensao(c, p) },
  INSS: { tipo: 'INSS', nome: 'Atrasados do INSS', schema: InssParams, calcular: (c, p) => calcularInss(c, p) },
  VALOR_CAUSA: { tipo: 'VALOR_CAUSA', nome: 'Valor da causa e custas', schema: ValorCausaParams, calcular: (c, p, e) => calcularValorCausa(c, p, e.custas ?? []) },
};

/** Data mais antiga citada nos parâmetros (para saber de onde buscar os índices) */
export function dataMaisAntiga(p: any): string {
  let min = hojeIso();
  const visita = (v: any) => {
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4}-\d{2})(-\d{2})?$/);
      if (m) { const d = m[2] ? v : `${v}-01`; if (d < min) min = d; }
    } else if (Array.isArray(v)) v.forEach(visita);
    else if (v && typeof v === 'object') Object.values(v).forEach(visita);
  };
  visita(p);
  return min;
}

/** Séries (chaves) necessárias para a calculadora */
export function seriesNecessarias(calc: Calculadora, p: any): string[] {
  return [...Object.keys(SERIES), ...(calc.medias?.(p) ?? [])];
}

export function validarParametros(calc: Calculadora, p: any): { ok: true; dados: any } | { ok: false; erros: string[] } {
  const r = calc.schema.safeParse(p ?? {});
  if (r.success) return { ok: true, dados: r.data };
  return { ok: false, erros: r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`) };
}
