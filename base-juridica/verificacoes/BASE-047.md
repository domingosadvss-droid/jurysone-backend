# BASE-047 — O portal do STF devolve a tela de erro no primeiro acesso vindo de fora

**Data da verificação:** 2026-08-01
**Famílias:** `temas_rg_stf` e os precedentes de súmula cujo inteiro teor está em
`portal.stf.jus.br`
**Origem:** relato de uso. O leitor clicava no link do tema, recebia a tela de
404 do STF e, ao clicar de novo, a página abria
**Severidade:** média — o endereço está correto e o acervo não tem o que
corrigir, mas quem consulta conclui que a fonte citada não existe

## Sintoma

Primeiro clique num link de `portal.stf.jus.br` vindo de outro site: a página do
STF carrega com menu, busca e a mensagem *"404 — Desculpe, mas não encontramos o
que você está procurando"*. Segundo clique no **mesmo endereço**: a página abre
normalmente.

## O que foi medido

Do IP da verificação, **o comportamento não se reproduz**:

| Endereço | Requisições | Tela de erro |
|---|---|---|
| `verTeseTema.asp?numTema=506` | 20 | 0 |
| `verTeseTema.asp?numTema=1400` | 20 | 0 |
| `detalharProcesso.asp?numeroTema=506` | 20 | 0 |
| `detalharProcesso.asp?numeroTema=69` | 20 | 0 |
| `verPronunciamento.asp?pronunciamento=4117416` | 20 | 0 |

Houve **uma** ocorrência isolada antes dessa medição: o
`detalharProcesso.asp?numeroTema=69` devolveu a tela de erro e, repetido em
seguida, devolveu a página correta.

Hipóteses descartadas, todas testadas com cabeçalhos de navegador:

- **não é endereço errado** — os oito temas citados no relato abrem e trazem a
  tese (o 506 traz a íntegra dos oito itens; o 192, cancelado, e o 1463, sem
  repercussão geral, abrem a ficha sem tese, que é o correto);
- **não é balanceamento** — os três IPs de `portal.stf.jus.br`
  (56.126.90.170, 18.228.95.119, 54.94.88.30) respondem igual quando testados um
  a um com `--resolve`;
- **não é cookie de sessão** — sem cookie, com cookie ASP inválido e com cookies
  obtidos navegando antes no portal, a resposta é idêntica;
- **não é origem externa** — `Referer` de outro site com `Sec-Fetch-Site:
  cross-site` devolve a página correta.

O gatilho está no lado do STF e não é acionável daqui.

## Por que isso engana

O portal serve a tela de erro **com status 200**. Um verificador que confie no
código de status considera o link saudável. É diferente do `BASE-046`, em que o
endereço estava de fato morto (404 sem corpo) — e é por isso que os dois casos
foram separados: um se corrige no acervo, o outro não.

## Correção

Não há endereço a trocar. O que se corrige é o que o leitor sabe: `avisoPortalSTF`
(`src/search/utils.ts`) acrescenta uma linha às respostas que trazem link de
`portal.stf.jus.br`:

```text
> **Se a página do STF abrir em 404, recarregue uma vez.** O portal responde com
> a tela de erro em parte dos primeiros acessos vindos de outro site; o mesmo
> endereço abre na segunda tentativa.
```

O aviso acompanha o link, não a família: aparece nos temas de repercussão geral
e nos precedentes cujo inteiro teor está no portal, e **não** aparece onde os
links são de `jurisprudencia.stf.jus.br`, do SCON ou do Planalto.

## Validação executada

- `bun test` no motor — 93 testes, todos verdes, incluindo três novos: o aviso
  acompanha o tema de repercussão geral, acompanha o precedente com link do
  portal e não aparece onde nenhum link é do portal.
- `python3 ferramentas/manutencao/auditar_base_juridica.py` — nenhuma
  inconsistência.
- `python3 -m unittest discover -s tests` em `ferramentas/manutencao` — 133
  testes verdes.

## Limites desta verificação

O aviso descreve um comportamento observado, não uma regra publicada pelo STF. Se
a fonte estabilizar, ele deixa de ser necessário e deve sair — hoje ele existe
porque o relato de uso é reprodutível para quem consulta, ainda que não o seja
para quem verifica.
