# BASE-042 — Consulta por número devolvia o registro errado

**Data da verificação:** 2026-07-30
**Famílias:** `temas_repetitivos_stj`, `sumulas_stj`, `sumulas_stf`,
`sumulas_vinculantes`, `legislacao`
**Severidade:** alta — o resultado errado era indistinguível do certo na tela

O achado nos temas repetitivos e a correção daquela família vieram de
contribuição externa, reproduzida sobre cópia limpa do repositório. A varredura
que revelou a mesma falha nas súmulas e na legislação foi feita na revisão da
contribuição.

## Sintoma

```text
$ tema "981"    →  **Tema 1056 STJ**       ← tema ERRADO, sem qualquer aviso
$ tema "1296"   →  Nenhum tema encontrado  ← existe no snapshot
$ tema "1000"   →  Nenhum tema encontrado  ← existe no snapshot
$ tema "1420"   →  Nenhum tema encontrado  ← existe no snapshot
$ tema "tema 981" → **Tema 981 STJ**       ← só a forma rotulada acertava

$ sumula "741"  →  **Súmula 199 do STJ**   ← súmula ERRADA (não existe Súmula 741)

buscarLegislacao("aviso previo de 30 dias", "CLT")
                →  art. 30 da CLT — REVOGADO, como resultado único
```

## Causa

Um mecanismo só, em três lugares.

**Temas repetitivos** — o lookup por número existia, mas a regex exigia o
rótulo:

```ts
query.match(/tema\s*(?:repetitivo)?\s*n?[º°.]?\s*(\d+)/i)
```

Com `"tema 981"` acertava. Com `"981"` — que é como a CLI e a ferramenta MCP
recebem a consulta na prática — não casava, e a busca caía no índice de tokens:

```text
terms["981"] = [1056]
```

O Tema 1056 cita, no corpo: *"…presente o quanto decidido no **EREsp
1.121.981/RJ**, em ordem a demarcar o efetivo espectro de beneficiários…"*. O
token `981` foi indexado apontando para ele. O Tema 981 verdadeiro —
redirecionamento de execução fiscal, art. 135, III, do CTN — nunca era
alcançado.

**Súmulas** — a consulta numérica pura era aceita, mas quando o número não
existia em nenhum dos três acervos a busca prosseguia para o índice de
palavras-chave. A consulta `"741"` devolvia a **Súmula 199 do STJ**, que cita a
*"Lei n. 5.741/71"*. Varredura de 1 a 900: **22 números** devolviam outra súmula
no topo.

**Legislação** — a regex tinha o rótulo opcional e não era ancorada, então
capturava qualquer número em qualquer posição da consulta e devolvia **um único
resultado**:

```ts
query.match(/(?:art(?:igo)?\.?\s*)?(\d+)/i)
```

| Consulta | Devolvia |
|---|---|
| CC · "prazo de 3 anos para reparação civil" | art. 3º (absolutamente incapazes) |
| CC · "prescrição em 5 anos" | art. 5º (menoridade) |
| CPC · "recurso no prazo de 15 dias" | art. 15 (aplicação supletiva) |
| CDC · "garantia de 90 dias produto durável" | art. 90 (normas do CPC) |
| CLT · "aviso prévio de 30 dias" | art. 30 — **revogado** |
| CP · "pena de 8 anos homicídio qualificado" | art. 8º (pena cumprida no estrangeiro) |

Seis de seis consultas realistas sequestradas pelo número solto, sem alternativa
na tela.

## Por que era grave

O falso positivo **saía formatado exatamente como um acerto**: identificação,
situação e, nos precedentes qualificados, o carimbo `OBSERVÂNCIA OBRIGATÓRIA
QUANDO APLICÁVEL — tese firmada em repetitivo (art. 927, III, do CPC)`. Quem
digitasse "Tema 1296" e recebesse o Tema 1056 não tinha, na tela, nenhum sinal
de que trocou de tema.

A taxonomia de efeito jurídico — que existe para impedir que se trate como
obrigatório o que não é — trabalhava, nestes casos, **contra** quem consulta:
emprestava autoridade ao engano.

## Correção

Uma regra única, nas três famílias: **consulta por número nunca cai no índice
textual.** Resolvido o número, devolve o registro pedido ou **vazio** — jamais
outro registro. Vale também para o número inexistente.

- `temas.ts` — aceita o número puro (`/^n?[º°.]?\s*(\d{1,4})$/`) além da forma
  rotulada. O limite de quatro dígitos é deliberado: preserva número longo
  (processo em numeração CNJ) indo pelo índice textual, em vez de virar lookup
  falho.
- `sumulas.ts` — consulta numérica pura passa a devolver o que encontrou,
  inclusive vazio, sem prosseguir para as palavras-chave.
- `legislacao.ts` — o lookup passa a exigir rótulo (`\bart(?:igo)?\.?\s*`) ou
  número puro e isolado, com suporte a dispositivo acrescentado (`48-A`). Número
  dentro de frase volta a ser texto.

| Consulta | Antes | Depois |
|---|---|---|
| `tema 981` (puro) | Tema **1056** | **Tema 981** |
| `tema 1296` / `1000` / `69` / `1420` | vazio | o tema pedido |
| `tema 9999` | vazio | vazio (correto) |
| `sumula 741` | **Súmula 199 STJ** | vazio (correto) |
| CLT · "aviso prévio de 30 dias" | art. 30 (revogado), único | arts. 197, 391-A, 135 |
| CP · "pena de 8 anos homicídio qualificado" | art. 8º | **art. 121**, 343, 44 |
| CC · "prescrição em 5 anos" | art. 5º | **arts. 191, 206, 189** |

Varredura numérica depois da correção — temas repetitivos (1 a 1500), temas de
repercussão geral (1 a 1500) e súmulas (1 a 900): **zero** consultas devolvendo
outro registro no topo.

## Validação

| Verificação | Antes | Depois |
|---|---|---|
| `bun test` | 58 pass / 0 fail | **70 pass / 0 fail** |
| `bun run typecheck` | limpo | limpo |
| Avaliação — global | 0,7945 · 0,9508 · 0,9897 | **idêntico** |
| Avaliação — `temas_repetitivos` | 0,8667 · 1,0 · 1,0 | **idêntico** |
| Avaliação — `legislacao` (69 casos) | 0,8000 · 0,9403 · 0,9855 | **idêntico** |
| `auditar_base_juridica.py --strict` | limpo | limpo |
| `validar_integridade.py` | válido | válido |
| `gerar_snapshots.py --verificar` | 285 coerentes | 285 coerentes |
| `verificar_compatibilidade.py` | 10 skills OK | 10 skills OK |
| `unittest` (manutenção) | 111 OK | 111 OK |

Nenhum dado publicado foi alterado — a mudança é só de motor.

## Testes

Doze casos de regressão, em dois arquivos, todos com **guarda da premissa**: o
teste afirma o dado que produzia o falso positivo antes de exercitar a busca, de
modo que, se a fonte mudar, fique evidente que o teste perdeu o alvo em vez de
passar por acidente.

- `src/search/temas.test.ts` (da contribuição) — o `981` que não pode devolver
  1056, com a guarda de que `terms["981"]` contém 1056; os números que devolviam
  vazio; a forma rotulada preservada; número inexistente devolvendo vazio; busca
  por tese seguindo textual.
- `src/search/lookup_numerico.test.ts` — a Súmula 741 inexistente devolvendo
  vazio, com a guarda de que o enunciado da Súmula 199 do STJ cita `5.741`; os
  demais 4 números do grupo; súmula existente ainda encontrada pelo número; o
  art. 30 da CLT fora do resultado de "aviso previo de 30 dias", com a guarda de
  que ele existe e está revogado; lookup por artigo nas duas formas e com sufixo
  `48-A`; artigo inexistente devolvendo vazio.

## Relação com o `BASE-020`

A contribuição sugeria que a ressalva do `BASE-020` — os temas 1406 a 1462 "só
são encontrados pela busca por número" — não se sustentaria, porque
`tema "1420"` devolvia vazio.

**A ressalva se sustenta.** Conferido antes da correção: `tema "tema 1420"`
devolvia o Tema 1420 corretamente; era a forma **não rotulada** que falhava. O
`BASE-020` descreve a busca por número, que funcionava. São dois defeitos
independentes: este corrige a consulta pelo número puro; a invisibilidade
textual daqueles temas permanece aberta no `BASE-020`, cuja redação recebeu
apenas uma nota de precisão.
