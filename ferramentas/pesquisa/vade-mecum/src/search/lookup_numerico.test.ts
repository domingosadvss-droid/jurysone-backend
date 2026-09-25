import { createRequire } from "module";
import { describe, expect, test } from "bun:test";

import { buscarSumulas } from "./sumulas.js";
import { buscarLegislacao } from "./legislacao.js";

const require = createRequire(import.meta.url);
const sumulasStj = require("../../data/sumulas_stj.json") as {
  sumulas: Record<string, { enunciado: string }>;
};
const clt = require("../../data/lei_clt.json") as {
  artigos: Record<string, { numero: string; texto: string }>;
};

// Mesma família de defeito corrigida em `temas.test.ts`, nas outras duas
// famílias que resolviam consulta por número: o número pedido colide com um
// número citado no corpo de outro registro, e o resultado errado saía
// formatado — e declarado — exatamente como um acerto.
describe("consulta por número não cai no índice textual", () => {
  test("súmula inexistente devolve vazio, nunca a que cita aquele número", () => {
    // Guarda da premissa: a Súmula 199 do STJ cita a "Lei n. 5.741/71", e era
    // por esse "741" que ela era devolvida à consulta "741". Se o enunciado
    // mudar, este teste perdeu o alvo e precisa ser reavaliado, não apagado.
    expect(sumulasStj.sumulas["199"]!.enunciado).toContain("5.741");

    // Não existe Súmula 741 em nenhum dos três acervos.
    expect(buscarSumulas("741", "todos", 5)).toEqual([]);
    for (const numero of ["749", "752", "780", "804"]) {
      expect(buscarSumulas(numero, "todos", 5), `súmula ${numero}`).toEqual([]);
    }
  });

  test("súmula existente continua sendo encontrada pelo número", () => {
    expect(buscarSumulas("7", "STJ", 1)[0]!.sumula.numero).toBe(7);
    expect(buscarSumulas("13", "vinculante", 1)[0]!.sumula.numero).toBe(13);
  });

  test("busca textual de súmula não é afetada", () => {
    const achados = buscarSumulas("honorários advocatícios", "STJ", 5);
    expect(achados.length).toBeGreaterThan(0);
  });

  test("número dentro de frase não sequestra a busca em legislação", () => {
    // Guarda da premissa: o art. 30 da CLT existe e está revogado — era ele
    // que a consulta "aviso previo de 30 dias" devolvia, como resultado único.
    expect(clt.artigos["30"]!.texto).toContain("Revogado");

    const achados = buscarLegislacao("aviso previo de 30 dias", "CLT", 5);
    expect(achados.map((r) => r.artigo.numero)).not.toContain("30");
    expect(achados.length).toBeGreaterThan(1);
  });

  test("lookup por artigo continua funcionando nas duas formas", () => {
    expect(buscarLegislacao("927", "CPC", 1)[0]!.artigo.numero).toBe("927");
    expect(buscarLegislacao("art. 927", "CPC", 1)[0]!.artigo.numero).toBe("927");
    expect(buscarLegislacao("artigo 927", "CPC", 1)[0]!.artigo.numero).toBe("927");
    // Dispositivo acrescentado, com sufixo de letra.
    expect(buscarLegislacao("art. 48-A", "CC", 1)[0]!.artigo.numero).toBe("48-A");
  });

  test("artigo inexistente devolve vazio, não um artigo qualquer", () => {
    expect(buscarLegislacao("art. 99999", "CPC", 5)).toEqual([]);
    expect(buscarLegislacao("99999", "CPC", 5)).toEqual([]);
  });
});
