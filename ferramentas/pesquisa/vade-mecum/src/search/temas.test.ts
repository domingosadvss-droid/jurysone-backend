import { createRequire } from "module";
import { describe, expect, test } from "bun:test";

import { buscarTemas } from "./temas.js";

const require = createRequire(import.meta.url);
const raw = require("../../data/flash_temas_stj.json") as {
  temas: Record<string, { numero: number }>;
  terms: Record<string, readonly number[]>;
};

// A busca de tema repetitivo por número devolvia o tema ERRADO.
//
// O lookup por número exigia o rótulo ("tema 981"); com o número puro ("981")
// — que é como a CLI e a ferramenta MCP recebem a consulta, e o que a descrição
// da ferramenta anuncia — a consulta caía no índice de tokens, onde
// `terms["981"] = [1056]` porque o corpo do Tema 1056 cita "EREsp 1.121.981/RJ".
//
// O falso positivo saía formatado como um acerto, com o carimbo
// OBSERVÂNCIA OBRIGATÓRIA QUANDO APLICÁVEL — emprestando autoridade ao engano.
describe("busca de tema repetitivo por número", () => {
  test('"981" devolve o Tema 981, nunca o 1056', () => {
    // Guarda da premissa: se o índice deixar de associar o token 981 ao tema
    // 1056, este teste perde o alvo e precisa ser reavaliado, não apagado.
    expect(raw.terms["981"]).toContain(1056);

    const achados = buscarTemas("981", 5);
    expect(achados.length).toBeGreaterThan(0);
    expect(achados[0]!.numero).toBe(981);
    expect(achados.map((t) => t.numero)).not.toContain(1056);
  });

  test("o número puro resolve temas que antes devolviam vazio", () => {
    for (const numero of [1296, 1000, 69]) {
      const achados = buscarTemas(String(numero), 1);
      expect(achados.length, `tema ${numero}`).toBe(1);
      expect(achados[0]!.numero, `tema ${numero}`).toBe(numero);
    }
  });

  test("a forma rotulada continua funcionando", () => {
    expect(buscarTemas("tema 981", 1)[0]!.numero).toBe(981);
    expect(buscarTemas("Tema 1296", 1)[0]!.numero).toBe(1296);
    expect(buscarTemas("tema repetitivo 1000", 1)[0]!.numero).toBe(1000);
  });

  test("número inexistente devolve vazio, não um tema qualquer", () => {
    expect(buscarTemas("9999", 5)).toEqual([]);
    expect(buscarTemas("tema 9999", 5)).toEqual([]);
  });

  test("busca por tese continua textual e não é afetada", () => {
    const achados = buscarTemas("intimacao pessoal multa obrigacao de fazer", 5);
    expect(achados.length).toBeGreaterThan(0);
    expect(achados.map((t) => t.numero)).toContain(1296);
  });

  test("consulta com número embutido em texto continua textual", () => {
    // "5" é descartado pelo tokenizer (comprimento <= 2) e a consulta não é
    // numérica pura: segue pelo índice, sem virar lookup falso.
    const achados = buscarTemas("prescricao 5 anos", 5);
    for (const tema of achados) expect(typeof tema.numero).toBe("number");
  });
});
