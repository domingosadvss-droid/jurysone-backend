# BASE-043 — A legislação não tinha dimensão temporal

**Data da verificação:** 2026-08-01
**Famílias:** `legislacao`
**Severidade:** alta — artigo revogado e artigo em vigor saíam com a mesma
aparência, sem aviso

A lacuna veio de contribuição externa em 2026-07-27, na leitura de que os campos
da legislação eram todos estruturais (onde o dispositivo está dentro da norma) e
nenhum era temporal, enquanto a jurisprudência já trazia data e situação.

## Sintoma

```text
buscarLegislacao("aviso previo de 30 dias", "CLT")
   → **Art. 30** da CLT, formatado igual a qualquer dispositivo em vigor
     (revogado pela Lei 13.874/2019 desde 2019)

formatArtigo("CDC", art. 6º)
   → texto compilado de 2026, sem dizer que os incisos XI e XII entraram
     em 2021 e que o caput continua com a redação de 1990
```

O motor devolvia o texto **compilado** — a redação vigente na data da coleta —
sem dizer que era uma redação entre várias, qual diploma a deu, nem se o
dispositivo ainda existia. Toda a conferência ficava com quem consulta, sob o
rótulo `Efeito jurídico: A CONFIRMAR`.

## Causa

Não era falta de dado, era dado ilegível. O Planalto anota cada mudança dentro
do próprio texto que a base já coletava:

```text
"...e a proteção contra a publicidade enganosa; (Redação dada pela Lei
nº 12.741, de 2012)"
```

A anotação vivia como prosa dentro do campo `texto`. Estruturalmente invisível:
nenhum campo dizia "revogado", nenhum campo nomeava o diploma alterador, e a
busca não tinha como distinguir um artigo revogado de um artigo originário.

## Correção

Índice derivado reproduzível (`anotacoes-planalto-v1`), no padrão que o
`BASE-019` estabeleceu para a legislação: gerador versionado em
`ferramentas/manutencao/gerar_indice_vigencia.py`, manifesto e parâmetros em
[`indices-derivados.json`](../indices-derivados.json), saída em
`data/indices/lei_*_vigencia.json` com o SHA-256 da fonte de cada diploma.

Nada é inferido: todo evento preserva a anotação em `literal` e é rastreável a
uma string da fonte. O dado permanece separado da fonte — os 277 `lei_*.json`
não foram tocados.

### A âncora, que define o desenho

**As anotações se prendem à unidade alterada, não ao artigo.** Medido no acervo:
das 32.074 anotações, apenas 6.336 (20%) estão no caput. As outras 25.738 fecham
parágrafo (11.369), inciso (10.361), alínea (2.675) ou parágrafo único (1.333).

Sem a âncora, o art. 6º do CDC sairia como "alterado pela Lei 14.181/2021" —
afirmação que a fonte não faz e que o caput desmente, já que aquela lei incluiu
os incisos XI e XII e não tocou no caput de 1990. Por isso cada evento carrega a
`unidade`, `situacao` só se propaga ao artigo quando a anotação está no caput, e
a resposta diz sempre o trecho atingido:

```text
**Situação na fonte:** REVOGADO — não tratar como dispositivo vigente;
confira o histórico na fonte oficial
**Alterações anotadas na fonte:** Emenda Constitucional 45/2004 no inciso
LXXVIII e nos §§ 3º e 4º; Emenda Constitucional 115/2022 no inciso LXXIX
```

### O que o índice deliberadamente não diz

- **Nunca escreve "vigente".** Ausência de anotação significa que o Planalto não
  registrou mudança, não que o dispositivo esteja em vigor hoje. Artigo sem
  anotação não recebe rótulo nenhum — 70% do acervo.
- **O `A CONFIRMAR` permanece.** O índice informa o que a fonte anotou até a data
  do snapshot; quem responde por vigência na data da consulta é a fonte oficial.
- **Não completa século.** Quando a fonte escreve o ano com dois dígitos
  ("de 10.12.97"), o campo `ano` fica nulo em vez de virar 1997 por inferência;
  a anotação inteira continua em `literal` (331 anotações, 1,03%).
- **Não guarda o texto das redações anteriores.** Diz *que* mudou, por *qual*
  diploma e *quando*. O texto antigo é o `BASE-044`, aberto e declarado.

## Medição

| Medida | Valor |
|---|---:|
| Diplomas com índice | 277 (1:1 com as fontes) |
| Artigos com anotação | 7.309 |
| Anotações extraídas | 32.074 |
| — com diploma alterador nomeado | 27.084 (84,4%) |
| — marcador seco de situação, sem diploma na fonte | 4.990 (15,6%) |
| Artigos revogados | 866 |
| Artigos vetados | 395 |
| Artigos com vigência encerrada | 33 |
| **Resíduo real** | **2 anotações (0,006%)** |

Concentração nos diplomas mais consultados: CLT 2.045, CF 1.191, CP 1.153,
CPP 1.060, CC 648.

O resíduo é nominal, não estimado: são duas anotações em que a própria fonte
omite a espécie normativa ("Redação dada pela nº 9.099, de 1995"), e não há o que
extrair sem adivinhar.

## Defeitos encontrados durante a construção

Achados pela medição contra o acervo inteiro, antes de publicar o índice:

- **`Constitucionais?` não casa "Constitucional"** (nem `Complementares?` casa
  "Complementar"): o sufixo opcional pedia "Constitucionai" + "s". 1.623 emendas
  constitucionais e 2.414 leis complementares ficavam sem diploma extraído.
- **Número de medida provisória truncava no hífen.** A MP 2.177-44 é norma
  distinta da MP 2.177-43; o corte perdia a reedição e ainda derrubava o ano
  seguinte, que deixava de casar. Afetava as 792 anotações de norma reeditada.
- **Falso positivo de prosa comum.** A TIPI traz "(incluídos os fios absorvíveis
  esterilizados para cirurgia ou odontologia)" como texto da própria norma —
  parêntese que abre com o mesmo verbo de "(Incluído pela Lei...)" e não registra
  alteração nenhuma. A guarda passou a exigir que a anotação nomeie um diploma ou
  seja o marcador seco de situação; frase não passa.

## Testes

- `ferramentas/manutencao/tests/test_gerar_indice_vigencia.py` — 21 testes:
  extração de espécie, número e ano; âncora por unidade; revogação de inciso que
  não revoga o artigo; recusa do falso positivo; reprodutibilidade exata dos 277
  índices; cobertura 1:1 entre fonte e índice; e a medição do acervo fixada, para
  que regressão apareça como queda.
- `ferramentas/pesquisa/vade-mecum/src/search/vigencia.test.ts` — 16 testes:
  concordância de artigo e substantivo na descrição das unidades, agrupamento
  cronológico por diploma, corte declarado em lista longa, e a verificação de que
  o bloco temporal da resposta bate artigo a artigo com o índice publicado.

## Estado após a correção

```text
bun test                    → 86 pass, 0 fail (10 arquivos)
testes de manutenção        → 127 pass, 0 fail (9 arquivos)
tsc --noEmit                → sem erro
auditar_base_juridica.py    → nenhuma inconsistência estrutural
verificar_compatibilidade   → 10 skills portáveis e sincronizadas
gerar_indice_vigencia --verificar → reproduzível, 277 índices
avaliação de recuperação    → idêntica à da main, caso a caso
```

A avaliação de recuperação não muda por desenho: o índice de vigência não entra
no ranking. Ele altera o que a resposta **declara**, não o que ela **encontra**.
