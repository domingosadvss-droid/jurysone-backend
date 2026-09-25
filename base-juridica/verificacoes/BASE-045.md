# BASE-045 — O léxico não cumpria o critério que ele próprio declarava

**Data da verificação:** 2026-08-01
**Famílias:** todas as de jurisprudência (`sumulas_*`, `jurisprudencia_teses`,
`temas_repetitivos_stj`, `temas_rg_stf`, `informativo_stf`, `espelhos_stj`)
**Severidade:** média — a expansão é posterior e declarada, então nunca deslocou
resultado direto; o dano era ruído volumoso oferecido a quem consulta como se
fosse achado

A revisão nasceu de contribuição externa de 2026-07-27, que perguntou pela
governança da tabela de equivalências: *"Essa tabela é pública? Versionada?
Assinada por quem? Quem escreve o dicionário escreve o resultado."*

## Sintoma

```text
buscar("cdi")   →  0 diretos, 30 por equivalência
   Súmula 12/STJ  — juros compensatórios e moratórios em desapropriação
   Súmula 54/STJ  — juros moratórios em responsabilidade extracontratual
   JT_028_T04     — imposto de renda sobre juros de mora em rescisão

buscar("pix")   →  4 diretos, 26 por equivalência
   transferência de crédito de ICMS na exportação
   transferência para presídio federal de segurança máxima
   TRANSFERÊNCIA DE PESSOA CONDENADA (cooperação internacional)
```

Nenhum dos 56 registros tratava do assunto consultado.

## Causa

Duas, encadeadas.

**A regra declarada não era cumprida.** O `_meta` do arquivo dizia, desde
2026-07-23, que *"só entra o par que um caso julgado em
`avaliacao/consultas.json` comprove necessário"*. O cruzamento entrada a entrada
mostrou que **cinco das oito** não tinham caso nenhum, e a `razao` de seis delas
dizia literalmente "herdado da expansão silenciosa dos temas do STJ" — foram
absorvidas do comportamento legado sem passar pelo critério novo.

**A salvaguarda de concorrência estava invertida:**

```ts
const minimoTermos = termos.length >= 3 ? 2 : 1;
```

Entrada com três ou mais termos exigia que o registro casasse **dois** deles.
Entrada com dois termos não exigia nada — bastava casar o mais genérico. Como
`cdi` é `[juros, encargo financeiro]` e `pix` é `[transferência, pagamento
instantâneo]`, o termo genérico sozinho abria a porta. A proteção cobria quem já
estava bem especificado e abandonava justamente quem não estava.

O teste de concorrência que existia só exercitava `nepotismo`, de seis termos,
que já estava do lado protegido. Por isso o buraco atravessou incólume.

## Correção

### 1. A concorrência passa a valer sempre

```ts
const minimoTermos = Math.min(2, termos.length);
```

Efeito medido, por entrada:

| entrada | antes | depois | o que sobra |
|---|---:|---:|---|
| `nepotismo` | 8 | 8 | intacta |
| `whatsapp` | 5 | 5 | intacta |
| `uber` | 5 | 5 | intacta |
| `selic` | 6 | 1 | marginal |
| `cdi` | 30 | 5 | marginal |
| `pix` | 26 | **0** | ruído eliminado |
| `citação` | 0 | 0 | inerte |
| `intimação` | 1 | 0 | inerte |

As entradas de três ou mais termos, que já exigiam corroboração, não mudaram.

### 2. Revisão por evidência, não por opinião

Cruzamento de cada conceito com o acervo, com fronteira de palavra:

| conceito | ocorrência literal no acervo | destino |
|---|---:|---|
| `nepotismo` | descrito sem ser nomeado (SV 13, Tema 1000) | **mantido** |
| `uber` | **0** — nem uma vez | **mantido** |
| `whatsapp` | 22 literais + 6 perífrases | **mantido** |
| `selic` | 256 | removido — a busca direta resolve |
| `cdi` | **0** | removido — não há o que recuperar |
| `pix` | 10, todas "emendas Pix" (emenda parlamentar) | removido — outro assunto |
| `citação` | — | removido — relação inadmissível |
| `intimação` | — | removido — relação inadmissível |

`uber` é o caso mais puro do léxico depois de `nepotismo`: a palavra não aparece
uma única vez no acervo, e o Tema 967 do STF julga exatamente a atividade —
"transporte privado individual por motorista cadastrado em aplicativo".

`whatsapp` teve os termos reespecificados de `[aplicativo, mensagens, redes
sociais]` para `[aplicativo, mensagens]`: "redes sociais" trazia o JT_264_T07,
sobre crime de preconceito em postagens, alheio a comunicação privada. Com dois
termos e concorrência exigida, o sinal (JT_279_T03 e JT_279_T04) permanece e o
ruído desaparece.

### 3. Relações recusadas, declaradas no dado

Duas famílias de relação passam a ser inadmissíveis, registradas em
`_meta.relacoes_recusadas`:

- **espécie para gênero** — `cdi → juros` perde a especificidade que a consulta
  trazia. Todo CDI é juros; nem todo juros é CDI;
- **instituto para instituto** — `citação ≈ intimação` são atos processuais
  distintos, como prescrição e decadência. Era exatamente a hipótese que a
  contribuição externa apontou como inaceitável.

### 4. A prova deixa de ser a palavra de quem curou

Cada entrada passa a apontar em `casos` os identificadores de
`avaliacao/consultas.json` que sustenta, e `lexico.test.ts` recusa entrada sem
caso. Dois casos julgados foram escritos para as entradas que funcionavam sem
tê-los (99 casos no corpus, contra 97).

A verificação é mecânica — removida cada entrada, a avaliação cai:

```text
linha de base       Global | casos=99 | cobertura=1.0000 | obrigatórios=1.0000 | MRR=0.9899
sem nepotismo    →  cobertura=0.9899 | obrigatórios=0.9798 | MRR=0.9798
sem uber         →  cobertura=0.9899 | obrigatórios=0.9899 | MRR=0.9798
sem whatsapp     →  cobertura=1.0000 | obrigatórios=0.9899 | MRR=0.9899
```

Antes da revisão, o mesmo teste mostrava que **sete das oito entradas não
sustentavam nada**: só `nepotismo` movia a avaliação.

## Testes

- `a concorrência vale também para a entrada de dois termos` — falha com o
  limiar antigo, verificado explicitamente;
- `nenhuma entrada existe sem caso julgado que a sustente` — cruza `casos` com o
  corpus de avaliação e recusa identificador inexistente;
- `a expansão exige ao menos dois termos por registro` — impede que entrada de
  termo único contorne a concorrência;
- `normaliza o acento da consulta contra o conceito` — a cobertura de acento
  vinha de `citacao` casar `citação`; com a entrada removida, passou a ser
  exercida pelo lado da consulta ("nepotísmo" casa "nepotismo"). Registrado no
  próprio teste que conceito acentuado novo deve ser exercitado ali.

## Estado após a correção

```text
bun test                    → 90 pass, 0 fail
tsc --noEmit                → sem erro
avaliação de recuperação    → 99 casos, cobertura 1.0000, obrigatórios 1.0000
```

## O que esta revisão não resolve

O léxico continua sendo uma decisão humana sobre o que a fonte quis dizer. O que
mudou é que a decisão agora precisa exibir a prova, e que duas classes de
decisão errada estão vedadas por escrito. Não existe teste que impeça alguém de
escrever um caso julgado ruim para justificar uma entrada ruim — a curadoria
segue sendo o elo humano, só que auditável.
