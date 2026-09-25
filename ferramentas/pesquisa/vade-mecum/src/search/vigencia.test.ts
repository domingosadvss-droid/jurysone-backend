import { describe, expect, test } from "bun:test";

import { buscarArtigo, formatArtigo } from "./legislacao.js";
import {
  descreverUnidades,
  formatarVigencia,
  type RegistroVigencia,
} from "./vigencia.js";

function evento(
  unidade: string,
  diploma: { especie: string; numero: string; ano: number | null } | null,
  tipo = "redacao",
) {
  return { tipo, unidade, diploma, trecho: "…", literal: "(anotação)" };
}

describe("descreverUnidades", () => {
  test("concorda artigo e substantivo com o número de unidades", () => {
    expect(descreverUnidades(["inciso XI"])).toBe("no inciso XI");
    expect(descreverUnidades(["inciso XI", "inciso XII"])).toBe(
      "nos incisos XI e XII",
    );
    expect(descreverUnidades(["alínea a"])).toBe("na alínea a");
    expect(descreverUnidades(["alínea a", "alínea b"])).toBe("nas alíneas a e b");
    expect(descreverUnidades(["§ 1º", "§ 2º"])).toBe("nos §§ 1º e 2º");
    expect(descreverUnidades(["caput"])).toBe("no caput");
    expect(descreverUnidades(["parágrafo único"])).toBe("no parágrafo único");
  });

  test("junta famílias diferentes na mesma frase", () => {
    expect(descreverUnidades(["caput", "inciso I", "inciso II", "alínea a"])).toBe(
      "no caput, nos incisos I e II e na alínea a",
    );
  });

  test("dispensa a preposição quando o rótulo da linha já a carrega", () => {
    expect(descreverUnidades(["inciso IX"], false)).toBe("inciso IX");
    expect(descreverUnidades(["§ 3º", "§ 4º"], false)).toBe("§§ 3º e 4º");
  });

  test("resume lista longa declarando quantas ficaram de fora", () => {
    // Corte declarado, nunca silencioso: o texto integral do artigo vem na
    // mesma resposta, com todas as anotações no lugar de origem.
    expect(
      descreverUnidades(["inciso I", "inciso II", "inciso III", "inciso IV", "inciso V", "inciso VI"]),
    ).toBe("nos incisos I, II, III e IV e outros 2");
  });
});

describe("formatarVigencia", () => {
  test("artigo sem anotação não recebe rótulo nenhum", () => {
    // Silêncio da fonte é a resposta mais comum — 70% dos artigos do acervo —
    // e significa que o Planalto não anotou mudança, não que o dispositivo
    // esteja em vigor.
    expect(formatarVigencia(null)).toBe("");
    expect(formatarVigencia({ situacao: null, eventos: [] })).toBe("");
  });

  test("nunca afirma vigência", () => {
    const registro: RegistroVigencia = {
      situacao: null,
      eventos: [evento("caput", { especie: "Lei", numero: "13.874", ano: 2019 })],
    };
    const saida = formatarVigencia(registro);
    expect(saida).not.toContain("Situação na fonte");
    expect(saida).toContain("Lei 13.874/2019 no caput");
  });

  test("revogação do artigo aparece antes de tudo", () => {
    const registro: RegistroVigencia = {
      situacao: "revogado",
      eventos: [evento("caput", { especie: "Lei", numero: "13.105", ano: 2015 }, "revogacao")],
    };
    expect(formatarVigencia(registro)).toStartWith(
      "**Situação na fonte:** REVOGADO",
    );
  });

  test("agrupa por diploma e prende cada um ao trecho que atingiu", () => {
    // O ponto central do BASE-043: a Lei 14.181/2021 incluiu incisos no art. 6º
    // do CDC. Dizer "art. 6º alterado pela Lei 14.181/2021" seria falso — o
    // caput continua com a redação de 1990.
    const lei14181 = { especie: "Lei", numero: "14.181", ano: 2021 };
    const registro: RegistroVigencia = {
      situacao: null,
      eventos: [
        evento("inciso III", { especie: "Lei", numero: "12.741", ano: 2012 }),
        evento("inciso XI", lei14181, "inclusao"),
        evento("inciso XII", lei14181, "inclusao"),
      ],
    };
    expect(formatarVigencia(registro)).toContain(
      "Lei 12.741/2012 no inciso III; Lei 14.181/2021 nos incisos XI e XII",
    );
  });

  test("ordena os diplomas cronologicamente", () => {
    const registro: RegistroVigencia = {
      situacao: null,
      eventos: [
        evento("§ 1º", { especie: "Lei", numero: "14.000", ano: 2020 }),
        evento("caput", { especie: "Lei", numero: "9.000", ano: 1995 }),
      ],
    };
    expect(formatarVigencia(registro)).toContain(
      "Lei 9.000/1995 no caput; Lei 14.000/2020 no § 1º",
    );
  });

  test("diploma sem ano legível na fonte não finge uma data", () => {
    const registro: RegistroVigencia = {
      situacao: null,
      eventos: [evento("caput", { especie: "Lei", numero: "9.527", ano: null })],
    };
    expect(formatarVigencia(registro)).toContain("Lei 9.527 no caput");
  });

  test("marca o trecho que a fonte revoga sem nomear diploma", () => {
    const registro: RegistroVigencia = {
      situacao: null,
      eventos: [evento("inciso IX", null, "revogacao")],
    };
    expect(formatarVigencia(registro)).toContain(
      "**Trechos revogados ou vetados sem diploma nomeado:** inciso IX",
    );
  });
});

describe("a dimensão temporal chega a quem consulta", () => {
  test("o artigo revogado avisa que é revogado", () => {
    // O art. 30 da CLT é o caso do BASE-042: "aviso prévio de 30 dias" caía
    // nele por acidente e ele saía formatado igual a um dispositivo em vigor.
    const artigo = buscarArtigo("CLT", "30")!;
    const saida = formatArtigo("CLT", artigo);
    expect(saida).toContain("**Situação na fonte:** REVOGADO");
    expect(saida).toContain("não tratar como dispositivo vigente");
  });

  test("o artigo alterado nomeia os diplomas e os trechos", () => {
    const saida = formatArtigo("CF", buscarArtigo("CF", "5")!);
    expect(saida).toContain("Emenda Constitucional 45/2004 no inciso LXXVIII");
    expect(saida).toContain("Emenda Constitucional 115/2022 no inciso LXXIX");
  });

  test("o A CONFIRMAR permanece mesmo com o índice presente", () => {
    // O índice diz o que o Planalto anotou até a data do snapshot; não
    // certifica vigência na data da consulta. Trocar por "confirmado" seria
    // exatamente o excesso que o projeto existe para não cometer.
    const saida = formatArtigo("CLT", buscarArtigo("CLT", "58")!);
    expect(saida).toContain("Lei 13.467/2017 nos §§ 2º e 3º");
    expect(saida).toContain(
      "**Efeito jurídico:** A CONFIRMAR — verifique vigência, redação e aplicabilidade ao caso",
    );
  });

  test("o artigo sem anotação sai como antes, sem bloco temporal", () => {
    const saida = formatArtigo("CPC", buscarArtigo("CPC", "1")!);
    expect(saida).not.toContain("Situação na fonte");
    expect(saida).not.toContain("Alterações anotadas");
  });

  test("bloco temporal e índice publicado batem artigo a artigo", async () => {
    const indice = (await Bun.file(
      new URL("../../data/indices/lei_cdc_vigencia.json", import.meta.url).pathname,
    ).json()) as { vigencia: Record<string, unknown> };

    let comBloco = 0;
    for (let numero = 1; numero <= 131; numero += 1) {
      const artigo = buscarArtigo("CDC", String(numero));
      if (!artigo) continue;
      const saida = formatArtigo("CDC", artigo);
      const temBloco =
        saida.includes("Alterações anotadas") ||
        saida.includes("Situação na fonte") ||
        saida.includes("Trechos revogados");
      expect(temBloco).toBe(String(numero) in indice.vigencia);
      if (temBloco) comBloco += 1;
    }
    expect(comBloco).toBeGreaterThan(0);
  });
});
