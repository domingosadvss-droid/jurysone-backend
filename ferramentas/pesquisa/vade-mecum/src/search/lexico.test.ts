import { describe, expect, test } from "bun:test";

import {
  buscarComEquivalencias,
  EQUIVALENCIAS,
  equivalenciasDaConsulta,
  montarResposta,
  notaEquivalencia,
} from "./lexico.js";
import { buscarSumulasAmpliado, buscarSumulas } from "./sumulas.js";
import { buscarTemasRG, buscarTemasRGAmpliado, formatTemaRG } from "./temas_rg_stf.js";

describe("léxico de equivalências declaradas", () => {
  test("cada entrada registra conceito, termos e razão", () => {
    expect(EQUIVALENCIAS.length).toBeGreaterThan(0);
    for (const item of EQUIVALENCIAS) {
      expect(item.conceito.trim()).not.toBe("");
      expect(item.termos.length).toBeGreaterThan(0);
      // Sem razão registrada, ninguém consegue auditar por que a busca foi
      // ampliada — é o que separa curadoria de palpite.
      expect(item.razao.trim().length).toBeGreaterThan(20);
    }
  });

  test("nenhuma entrada existe sem caso julgado que a sustente", async () => {
    // A regra que o próprio arquivo declarava desde 2026-07-23 não era
    // cumprida: cinco das oito entradas não tinham caso nenhum, herdadas da
    // expansão silenciosa dos temas do STJ. Este teste torna a regra
    // executável — quem escreve o dicionário passa a ter de exibir a prova.
    const corpus = (await Bun.file(
      new URL("../../avaliacao/consultas.json", import.meta.url).pathname,
    ).json()) as { casos: Array<{ id: string }> };
    const conhecidos = new Set(corpus.casos.map((caso) => caso.id));

    for (const item of EQUIVALENCIAS) {
      expect(item.casos.length).toBeGreaterThan(0);
      for (const id of item.casos) expect(conhecidos).toContain(id);
    }
  });

  test("a expansão exige ao menos dois termos por registro", () => {
    // Entrada de termo único voltaria a permitir que uma palavra genérica
    // sozinha qualificasse o registro, que é o defeito corrigido em
    // 2026-08-01. Enquanto a regra do motor for `Math.min(2, termos.length)`,
    // toda entrada precisa de dois termos para ser protegida por ela.
    for (const item of EQUIVALENCIAS) {
      expect(item.termos.length).toBeGreaterThanOrEqual(2);
    }
  });

  test("aciona pelo conceito, ignorando caixa, e não aciona fora dele", () => {
    expect(equivalenciasDaConsulta("Nepotismo em cargo público")).toHaveLength(1);
    expect(equivalenciasDaConsulta("WHATSAPP do réu")).toHaveLength(1);
    expect(equivalenciasDaConsulta("prescrição intercorrente")).toEqual([]);
    // O gatilho é o conceito, nunca os termos da expansão: quem digita
    // "aplicativo de mensagens" já está fazendo a busca direta.
    expect(equivalenciasDaConsulta("aplicativo de mensagens")).toEqual([]);
  });

  test("normaliza o acento da consulta contra o conceito", () => {
    // Até 2026-08-01 este caso era coberto por "citacao" casando "citação".
    // A revisão removeu aquela entrada (citação e intimação são institutos
    // distintos, não equivalentes) e nenhum conceito sobrevivente tem acento,
    // então quem exercita a normalização agora é o lado da consulta: o acento
    // indevido cai no mesmo tokenizador e casa o conceito sem acento.
    expect(equivalenciasDaConsulta("nepotísmo")).toHaveLength(1);
    expect(equivalenciasDaConsulta("NEPOTISMO")).toHaveLength(1);
  });

  test("consulta sem gatilho devolve exatamente a busca direta", () => {
    const query = "ICMS na base de cálculo do PIS e da COFINS";
    const ampliada = buscarTemasRGAmpliado(query, 5);
    expect(ampliada.equivalencias).toEqual([]);
    expect(ampliada.porEquivalencia).toEqual([]);
    expect(ampliada.diretos.map((t) => t.numero)).toEqual(
      buscarTemasRG(query, 5).map((t) => t.numero),
    );
  });
});

describe("recuperação por equivalência", () => {
  test("preserva a ordem dos resultados diretos e acrescenta depois", () => {
    const diretos = buscarTemasRG("nepotismo", 5).map((t) => t.numero);
    const ampliada = buscarTemasRGAmpliado("nepotismo", 5);

    expect(ampliada.diretos.map((t) => t.numero)).toEqual(diretos);
    for (const tema of ampliada.porEquivalencia) {
      expect(diretos).not.toContain(tema.numero);
    }
  });

  test("recupera o Tema 1000, que não contém a palavra nepotismo", () => {
    // O tema trata de nomeação de cônjuge, companheiro ou parente para cargo
    // político: a fonte descreve a conduta sem nomeá-la, e a busca léxica
    // sozinha nunca o alcançava.
    const ampliada = buscarTemasRGAmpliado("nepotismo", 5);
    expect(ampliada.porEquivalencia.map((t) => t.numero)).toContain(1000);
    expect(buscarTemasRG("nepotismo", 20).map((t) => t.numero)).not.toContain(1000);
  });

  test("recupera a Súmula Vinculante 13 pela conduta descrita", () => {
    expect(buscarSumulas("nepotismo", "vinculante", 5)).toHaveLength(0);
    const ampliada = buscarSumulasAmpliado("nepotismo", "vinculante", 5);
    expect(ampliada.porEquivalencia.map(({ sumula }) => sumula.numero)).toContain(13);
  });

  test("exige concorrência de termos para evitar o casamento genérico", () => {
    // "cargo em comissão" sozinho traz aposentadoria compulsória de
    // comissionado — assunto alheio ao conceito consultado.
    const ampliada = buscarTemasRGAmpliado("nepotismo", 8);
    expect(ampliada.porEquivalencia.map((t) => t.numero)).not.toContain(763);
  });

  test("a concorrência vale também para a entrada de dois termos", () => {
    // Este era o buraco: o limiar era `termos.length >= 3 ? 2 : 1`, então a
    // entrada de dois termos dispensava concorrência e bastava casar o mais
    // genérico dos dois. "pix" expandia para "transferência" e devolvia
    // transferência de crédito de ICMS, de presídio e de pessoa condenada —
    // 26 registros, nenhum sobre Pix. A salvaguarda protegia justamente as
    // entradas bem especificadas e abandonava as pobres.
    const doisTermos = EQUIVALENCIAS.filter((item) => item.termos.length === 2);
    expect(doisTermos.length).toBeGreaterThan(0);

    const generico = buscarComEquivalencias(
      "pix",
      5,
      (consulta, limite) => buscarSumulas(consulta, "todos", limite),
      ({ tribunal, sumula }) => `${tribunal}:${sumula.numero}`,
    );
    for (const { sumula } of generico.porEquivalencia) {
      // Nada entra por casar só "transferência".
      const enunciado = sumula.enunciado.toLowerCase();
      expect(
        enunciado.includes("pagamento instantâneo") || enunciado.includes("pix"),
      ).toBe(true);
    }
  });

  test("respeita o limite pedido e conta o que ficou de fora", () => {
    const ampliada = buscarTemasRGAmpliado("nepotismo", 3);
    expect(ampliada.diretos.length + ampliada.porEquivalencia.length).toBeLessThanOrEqual(3);
    expect(ampliada.omitidos).toBeGreaterThan(0);
  });

  test("a resposta declara os termos acrescentados", () => {
    const ampliada = buscarTemasRGAmpliado("nepotismo", 5);
    const resposta = montarResposta(ampliada, formatTemaRG);

    expect(resposta).toContain("Recuperado por equivalência declarada");
    expect(resposta).toContain("cônjuge");
    expect(resposta).toContain("Tema 1000 STF");
    // A declaração vem antes do resultado que ela trouxe, nunca depois.
    expect(resposta.indexOf("equivalência declarada")).toBeLessThan(
      resposta.indexOf("Tema 1000 STF"),
    );
  });

  test("sem expansão acionada, a resposta é só a lista direta", () => {
    const ampliada = buscarTemasRGAmpliado("tema 69", 1);
    expect(montarResposta(ampliada, formatTemaRG)).not.toContain(
      "equivalência declarada",
    );
  });

  test("a nota informa quantos resultados ficaram fora do limite", () => {
    const nota = notaEquivalencia(equivalenciasDaConsulta("nepotismo"), 4);
    expect(nota).toContain("Outros 4 resultado(s)");
    expect(notaEquivalencia(equivalenciasDaConsulta("nepotismo"))).not.toContain(
      "ficaram fora",
    );
  });

  test("função genérica não repete item já visto na busca direta", () => {
    const chamadas: string[] = [];
    const acervo: Record<string, string[]> = {
      nepotismo: ["a", "b"],
      cônjuge: ["b", "c"],
      companheiro: ["c", "d"],
      parente: ["c"],
    };
    const resultado = buscarComEquivalencias(
      "nepotismo",
      5,
      (consulta) => {
        chamadas.push(consulta);
        return acervo[consulta] ?? [];
      },
      (item) => item,
    );

    expect(chamadas[0]).toBe("nepotismo");
    expect(resultado.diretos).toEqual(["a", "b"]);
    // "c" aparece em três termos equivalentes; "d", em um só.
    expect(resultado.porEquivalencia).toEqual(["c"]);
  });
});
