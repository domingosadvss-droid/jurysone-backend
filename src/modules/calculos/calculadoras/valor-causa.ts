/**
 * Valor da causa (art. 292 do CPC) e custas pela tabela cadastrada pelo escritório (decisão 142)
 * Nenhum valor de custas é embutido no código: sem tabela cadastrada, o sistema avisa.
 */
import * as z from 'zod/v4';
import { Contexto, Linha, Resultado, bloco, dataBr, finalizar, hojeIso, moeda, pct, r2 } from '../nucleo';

const Data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Opc = <T extends z.ZodType>(t: T) => t.nullable().optional();

export const ValorCausaParams = z.object({
  modo: z.enum(['COBRANCA', 'INDENIZACAO', 'ALIMENTOS', 'DESPEJO', 'CONTRATO', 'VINCENDAS', 'REVISIONAL', 'DIVISAO', 'OUTRO']),
  dataCalculo: Opc(Data),
  principalAtualizado: z.number().min(0).default(0),
  juros: z.number().min(0).default(0),
  multa: z.number().min(0).default(0),
  outrasPenalidades: z.number().min(0).default(0),
  pedidos: z.array(z.object({ descricao: z.string(), valor: z.number().min(0) })).default([]),
  prestacaoMensal: z.number().min(0).default(0),
  valorContrato: z.number().min(0).default(0),
  parteControvertida: Opc(z.number().min(0)),
  vencidas: z.number().min(0).default(0),
  vincendasPorTempoIndeterminado: z.boolean().default(true),
  mesesVincendas: z.number().int().min(0).default(12),
  proveitoEconomico: z.number().min(0).default(0),
  valorAvaliacao: z.number().min(0).default(0),
  valorLivre: z.number().min(0).default(0),
  tribunal: z.string().default('TJSC'),
  ato: z.enum(['INICIAL', 'RECURSO', 'OUTRA']).default('INICIAL'),
  salarioMinimo: Opc(z.number().positive()),
  justicaGratuita: z.boolean().default(false),
});
export type ValorCausaParams = z.infer<typeof ValorCausaParams>;

export interface FaixaCustas { valorDe: number; valorAte: number | null; valorFixo: number | null; percentual: number | null; minimo: number | null; maximo: number | null; vigenciaDe: string; fonte: string | null }

export function calcularValorCausa(ctx: Contexto, p: ValorCausaParams, faixas: FaixaCustas[] = []): Resultado {
  const base = p.dataCalculo ?? hojeIso();
  const avisos: string[] = [];
  const l: Linha[] = [];
  let fund = '';
  switch (p.modo) {
    case 'COBRANCA':
      fund = 'art. 292, I, do CPC (principal corrigido + juros + penalidades vencidas até a propositura)';
      l.push({ rotulo: 'Principal atualizado', valor: p.principalAtualizado }, { rotulo: 'Juros vencidos', valor: p.juros }, { rotulo: 'Multa', valor: p.multa }, { rotulo: 'Outras penalidades', valor: p.outrasPenalidades });
      break;
    case 'INDENIZACAO':
      fund = 'art. 292, V e VI, do CPC (soma de todos os pedidos, inclusive danos morais)';
      for (const x of p.pedidos) l.push({ rotulo: x.descricao, valor: x.valor });
      if (!p.pedidos.length) avisos.push('Informe os pedidos e os valores pretendidos (inclusive dano moral).');
      break;
    case 'ALIMENTOS':
      fund = 'art. 292, III, do CPC (12 prestações mensais)';
      l.push({ rotulo: `12 × ${moeda(p.prestacaoMensal)}`, valor: p.prestacaoMensal * 12 });
      break;
    case 'DESPEJO':
      fund = 'art. 58, III, da Lei 8.245/91 (12 aluguéis)';
      l.push({ rotulo: `12 aluguéis de ${moeda(p.prestacaoMensal)}`, valor: p.prestacaoMensal * 12 });
      break;
    case 'CONTRATO':
      fund = 'art. 292, II, do CPC (valor do ato ou da parte controvertida)';
      l.push({ rotulo: p.parteControvertida != null ? 'Parte controvertida do contrato' : 'Valor do contrato', valor: p.parteControvertida ?? p.valorContrato });
      break;
    case 'VINCENDAS': {
      fund = 'art. 292, §§1º e 2º, do CPC (vencidas + 1 ano de vincendas, ou o total se inferior a 1 ano)';
      const m = p.vincendasPorTempoIndeterminado ? 12 : Math.min(12, p.mesesVincendas);
      l.push({ rotulo: 'Prestações vencidas', valor: p.vencidas }, { rotulo: `${m} prestações vincendas de ${moeda(p.prestacaoMensal)}`, valor: p.prestacaoMensal * m });
      break;
    }
    case 'REVISIONAL':
      fund = 'art. 292, II, do CPC e jurisprudência do STJ (proveito econômico pretendido na revisão)';
      l.push({ rotulo: 'Proveito econômico pretendido', valor: p.proveitoEconomico });
      break;
    case 'DIVISAO':
      fund = 'art. 292, IV, do CPC (valor de avaliação da área ou do bem)';
      l.push({ rotulo: 'Valor de avaliação', valor: p.valorAvaliacao });
      break;
    default:
      fund = 'art. 291 do CPC';
      l.push({ rotulo: 'Valor atribuído', valor: p.valorLivre });
  }
  const bv = bloco('valor', 'Valor da causa', l, { subtitulo: fund, recomendado: true });
  const valor = bv.total.valor;

  const blocos = [bv];
  const vigentes = faixas.filter((f) => f.vigenciaDe <= base).sort((a, b) => b.vigenciaDe.localeCompare(a.vigenciaDe));
  const vig = vigentes.length ? vigentes.filter((f) => f.vigenciaDe === vigentes[0].vigenciaDe) : [];
  let custas: number | null = null;
  if (p.justicaGratuita) avisos.push('Justiça gratuita pedida: custas não recolhidas na distribuição (art. 98 do CPC).');
  if (!vig.length) avisos.push(`Tabela de custas do ${p.tribunal} (${p.ato.toLowerCase()}) não cadastrada: cadastre a tabela vigente para calcular as custas.`);
  else {
    const faixa = vig.find((f) => valor >= f.valorDe && (f.valorAte == null || valor <= f.valorAte));
    if (!faixa) avisos.push('Nenhuma faixa da tabela de custas cobre esse valor da causa: confira a tabela cadastrada.');
    else {
      let c = (faixa.valorFixo ?? 0) + valor * (faixa.percentual ?? 0) / 100;
      if (faixa.minimo != null) c = Math.max(c, faixa.minimo);
      if (faixa.maximo != null) c = Math.min(c, faixa.maximo);
      custas = r2(c);
      blocos.push(bloco('custas', `Custas — ${p.tribunal} (${p.ato.toLowerCase()})`, [{
        rotulo: `Faixa de ${moeda(faixa.valorDe)} a ${faixa.valorAte != null ? moeda(faixa.valorAte) : 'sem limite'}`, valor: custas,
        formula: `${faixa.valorFixo ? moeda(faixa.valorFixo) : ''}${faixa.valorFixo && faixa.percentual ? ' + ' : ''}${faixa.percentual ? pct(faixa.percentual, 4) + ' do valor da causa' : ''}`,
        fundamento: `tabela cadastrada pelo escritório, vigente desde ${dataBr(faixa.vigenciaDe)}${faixa.fonte ? ` (${faixa.fonte})` : ''}`,
      }]));
    }
  }
  const resumo: Resultado['resumo'] = [{ rotulo: 'Valor da causa', valor }, { rotulo: 'Custas', valor: custas ?? 'não calculadas' }];
  if (p.salarioMinimo) {
    const sm = valor / p.salarioMinimo;
    resumo.push({ rotulo: 'Em salários mínimos', valor: r2(sm) });
    resumo.push({ rotulo: 'Juizado Especial Cível (até 40 SM)', valor: sm <= 40 ? 'cabe' : 'não cabe' });
    resumo.push({ rotulo: 'Juizado Especial Federal / Fazenda Pública (até 60 SM)', valor: sm <= 60 ? 'cabe' : 'não cabe' });
    if (sm <= 20) resumo.push({ rotulo: 'JEC sem advogado (até 20 SM)', valor: 'possível' });
  }
  return finalizar(ctx, {
    tipo: 'VALOR_CAUSA', titulo: 'Valor da causa e custas', dataBase: base, resumo, blocos, tabelas: [], avisos,
    fundamentos: ['CPC, arts. 291 e 292', 'Lei 9.099/95, art. 3º', 'Lei 10.259/2001, art. 3º', 'Lei 12.153/2009, art. 2º'],
    destaques: [], premissas: ['Custas calculadas somente pela tabela cadastrada pelo escritório.'], totalPrincipal: valor,
  });
}
