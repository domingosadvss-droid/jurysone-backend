/**
 * Dimensão temporal da legislação (BASE-043).
 *
 * O texto compilado que a base publica já traz, entre parênteses, a marca de
 * cada mudança que o dispositivo sofreu. Este módulo lê o índice derivado que
 * `ferramentas/manutencao/gerar_indice_vigencia.py` extrai dessas anotações e o
 * apresenta a quem consulta.
 *
 * Duas regras atravessam o formato, e as duas existem para não afirmar mais do
 * que a fonte afirma:
 *
 * - **a alteração vem com o trecho que atingiu.** Só 20% das anotações estão no
 *   caput; as outras fecham inciso, parágrafo ou alínea. Dizer "art. 6º do CDC
 *   alterado pela Lei 14.181/2021" seria falso — ela incluiu os incisos XI e
 *   XII, e o caput continua com a redação de 1990. Por isso a resposta diz
 *   sempre "nos incisos XI e XII", nunca só o diploma;
 * - **silêncio não é certificado.** Artigo sem anotação não recebe rótulo
 *   nenhum, e em nenhuma hipótese o motor escreve "vigente": o índice informa o
 *   que o Planalto anotou até a data do snapshot, e quem responde por vigência
 *   hoje é a fonte oficial na data da consulta. O `Efeito jurídico: A CONFIRMAR`
 *   da resposta permanece exatamente por isso.
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);

export interface DiplomaAlterador {
  readonly especie: string;
  readonly numero: string;
  readonly ano: number | null;
}

export interface EventoVigencia {
  readonly tipo: string;
  readonly unidade: string;
  readonly diploma: DiplomaAlterador | null;
  readonly trecho: string;
  readonly literal: string;
}

export type SituacaoArtigo = "revogado" | "vetado" | "vigencia_encerrada";

export interface RegistroVigencia {
  readonly situacao: SituacaoArtigo | null;
  readonly eventos: readonly EventoVigencia[];
}

interface IndiceVigenciaJSON {
  readonly _meta: {
    readonly codigo: string | null;
    readonly gerado_em: string;
    readonly fonte: { readonly sha256: string };
  };
  readonly vigencia: Record<string, RegistroVigencia>;
}

const SITUACOES: Record<SituacaoArtigo, string> = {
  revogado:
    "REVOGADO — não tratar como dispositivo vigente; confira o histórico na fonte oficial",
  vetado:
    "VETADO — o dispositivo não chegou a integrar a norma; confira a mensagem de veto na fonte oficial",
  vigencia_encerrada:
    "VIGÊNCIA ENCERRADA — não tratar como dispositivo vigente; confira o histórico na fonte oficial",
};

// Quantas unidades e quantos diplomas cabem antes de resumir. O corte é
// declarado ("e outros N"), nunca silencioso: o texto integral vem logo abaixo
// na mesma resposta, com todas as anotações no lugar de origem.
const MAX_UNIDADES = 4;
const MAX_DIPLOMAS = 6;

interface FamiliaDeUnidade {
  readonly casa: RegExp;
  readonly artigo: "no" | "na";
  readonly singular: string;
  readonly plural: string;
}

const FAMILIAS: readonly FamiliaDeUnidade[] = [
  { casa: /^caput$/, artigo: "no", singular: "caput", plural: "caput" },
  {
    casa: /^parágrafo único$/,
    artigo: "no",
    singular: "parágrafo único",
    plural: "parágrafo único",
  },
  { casa: /^inciso (.+)$/, artigo: "no", singular: "inciso", plural: "incisos" },
  { casa: /^§ (.+)$/, artigo: "no", singular: "§", plural: "§§" },
  { casa: /^alínea (.+)$/, artigo: "na", singular: "alínea", plural: "alíneas" },
];

/** "I, II e III" — vírgula entre os primeiros, "e" antes do último. */
function enumerar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

function listar(itens: readonly string[]): string {
  const visiveis = itens.slice(0, MAX_UNIDADES);
  const restantes = itens.length - visiveis.length;
  const enumerado = enumerar(visiveis);
  return restantes > 0 ? `${enumerado} e outros ${restantes}` : enumerado;
}

/**
 * "nos incisos XI e XII", "no § 1º", "no caput e na alínea a".
 *
 * Sem preposição quando o rótulo da linha já a dispensa: "inciso IX".
 */
export function descreverUnidades(
  unidades: readonly string[],
  comPreposicao = true,
): string {
  const trechos: string[] = [];
  for (const familia of FAMILIAS) {
    const valores: string[] = [];
    let presente = false;
    for (const unidade of unidades) {
      const encontrado = familia.casa.exec(unidade);
      if (!encontrado) continue;
      presente = true;
      const valor = encontrado[1];
      if (valor && !valores.includes(valor)) valores.push(valor);
    }
    if (!presente) continue;
    const plural = valores.length > 1;
    const nome = plural ? familia.plural : familia.singular;
    const prefixo = comPreposicao ? `${familia.artigo}${plural ? "s" : ""} ` : "";
    trechos.push(
      valores.length === 0
        ? `${prefixo}${nome}`
        : `${prefixo}${nome} ${listar(valores)}`,
    );
  }
  return enumerar(trechos);
}

function rotuloDiploma(diploma: DiplomaAlterador): string {
  return diploma.ano
    ? `${diploma.especie} ${diploma.numero}/${diploma.ano}`
    : `${diploma.especie} ${diploma.numero}`;
}

/** Diplomas alteradores em ordem cronológica, cada um com o trecho atingido. */
function alteracoes(eventos: readonly EventoVigencia[]): string[] {
  const grupos = new Map<string, { ano: number; unidades: string[] }>();
  for (const evento of eventos) {
    if (!evento.diploma) continue;
    const rotulo = rotuloDiploma(evento.diploma);
    const grupo = grupos.get(rotulo) ?? {
      // Diploma sem ano legível na fonte (ano de dois dígitos) vai para o fim
      // da ordem cronológica em vez de fingir uma data que não temos.
      ano: evento.diploma.ano ?? Number.MAX_SAFE_INTEGER,
      unidades: [],
    };
    if (!grupo.unidades.includes(evento.unidade)) grupo.unidades.push(evento.unidade);
    grupos.set(rotulo, grupo);
  }

  const ordenados = [...grupos].sort(([, a], [, b]) => a.ano - b.ano);
  const visiveis = ordenados.slice(0, MAX_DIPLOMAS);
  const descritos = visiveis.map(
    ([rotulo, { unidades }]) => `${rotulo} ${descreverUnidades(unidades)}`,
  );
  const restantes = ordenados.length - visiveis.length;
  if (restantes > 0) descritos.push(`e outros ${restantes} diplomas`);
  return descritos;
}

/** Trechos com situação própria que a fonte não atribui a nenhum diploma. */
function trechosComSituacaoPropria(registro: RegistroVigencia): string {
  const unidades: string[] = [];
  for (const evento of registro.eventos) {
    const marca =
      evento.tipo === "revogacao" ||
      evento.tipo === "veto" ||
      evento.tipo === "supressao";
    if (!marca || evento.diploma || evento.unidade === "caput") continue;
    if (!unidades.includes(evento.unidade)) unidades.push(evento.unidade);
  }
  return unidades.length ? descreverUnidades(unidades, false) : "";
}

/**
 * O bloco temporal da resposta, ou string vazia quando a fonte nada anotou.
 *
 * Vazio é resposta legítima e a mais comum: 70% dos artigos do acervo não têm
 * anotação nenhuma. Isso significa que o Planalto não registrou mudança — não
 * que o dispositivo esteja vigente.
 */
export function formatarVigencia(registro: RegistroVigencia | null): string {
  if (!registro || registro.eventos.length === 0) return "";

  const linhas: string[] = [];
  if (registro.situacao) {
    linhas.push(`**Situação na fonte:** ${SITUACOES[registro.situacao]}`);
  }
  const diplomas = alteracoes(registro.eventos);
  if (diplomas.length > 0) {
    linhas.push(`**Alterações anotadas na fonte:** ${diplomas.join("; ")}`);
  }
  const trechos = trechosComSituacaoPropria(registro);
  if (trechos) {
    linhas.push(`**Trechos revogados ou vetados sem diploma nomeado:** ${trechos}`);
  }
  return linhas.length > 0 ? `${linhas.join("\n")}\n` : "";
}

const cache = new Map<string, IndiceVigenciaJSON | null>();

export function carregarIndiceVigencia(
  arquivoDoDiploma: string,
): IndiceVigenciaJSON | null {
  const memo = cache.get(arquivoDoDiploma);
  if (memo !== undefined) return memo;
  const arquivo = arquivoDoDiploma.replace(
    /^\.\.\/\.\.\/data\/(lei_.+)\.json$/,
    "../../data/indices/$1_vigencia.json",
  );
  let indice: IndiceVigenciaJSON | null = null;
  try {
    indice = require(arquivo) as IndiceVigenciaJSON;
  } catch {
    // Sem índice o artigo sai como saía antes do BASE-043: com o texto e as
    // anotações no corpo, apenas sem o resumo estruturado. Os testes acusam a
    // ausência; a resposta não mente por causa dela.
    indice = null;
  }
  cache.set(arquivoDoDiploma, indice);
  return indice;
}

export function vigenciaDoArtigo(
  arquivoDoDiploma: string,
  numero: string,
): RegistroVigencia | null {
  return carregarIndiceVigencia(arquivoDoDiploma)?.vigencia[numero] ?? null;
}
