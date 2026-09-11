# BASE-046 — Precedentes de súmulas do STF com link de inteiro teor que abre em 404

**Data da verificação:** 2026-08-01
**Famílias:** `sumulas_stf`, `sumulas_vinculantes` (campo `precedentes[].url`)
**Fonte oficial consultada:** páginas de súmula do STF
(`jurisprudencia.stf.jus.br/pages/search/seq-sumulaN/false`) e os endereços que
elas publicam para o inteiro teor de cada precedente
**Severidade:** alta — é a promessa central do acervo. O leitor clicava em
"abrir na fonte oficial" e recebia a tela de erro do STF, sem meio de conferir o
julgado que sustenta a súmula

O defeito chegou por relato de uso: um leitor abriu a fonte de um registro de
repercussão geral e recebeu a tela de 404 do portal do STF.

## Sintoma

A resposta do MCP para a Súmula 70 do STF, antes da correção:

```text
- ARE 914.045 RG, rel. min. Edson Fachin, P, j. 15/10/2015 — Tema 856 de repercussão geral
  Inteiro teor: https://www.stf.jus.br/portal/inteiroTeor/obterInteiroTeor.asp?numero=914045&classe=ARE-RG
```

```console
$ curl -o /dev/null -w '%{http_code}\n' -L \
  'https://www.stf.jus.br/portal/inteiroTeor/obterInteiroTeor.asp?numero=914045&classe=ARE-RG'
404
```

Oito precedentes de sete súmulas estavam nessa situação, **seis deles de
repercussão geral** — o que explica o relato ter chegado com esse nome:

| Súmula | Precedente | Tema RG |
|---|---|---|
| STF 14 | ARE 678.112 RG | 646 |
| STF 15 | RE 724.347 | 671 |
| STF 70 | ARE 914.045 RG | 856 |
| STF 70 | RE 565.048 | 31 |
| STF 70 | RE 627.543 | 363 |
| STF 71 | RE 593.849 | — |
| STF 121 | RE 592.377 | 33 |
| Vinculante 37 | Rcl 27.310 AgR | — |

## Causa

O STF desativou o portal antigo servido em `www.stf.jus.br/portal/`. As páginas
de súmula, porém, continuam citando aquele endereço no `href` do precedente, e o
coletor apenas repassava o link publicado (`url_https(links.get(processo))`), sem
conferir se ele abre. É o mesmo defeito que o `BASE-028` corrigiu no STJ: link
que a fonte publica não é, por si só, link que abre.

Trocar o host não resolve. `portal.stf.jus.br` responde **200 com a página de
erro** — soft 404 — para os mesmos caminhos:

```console
$ curl -sL 'https://portal.stf.jus.br/inteiroTeor/obterInteiroTeor.asp?idDocumento=8429975' \
  | grep -o 'não encontramos o que você está procurando'
não encontramos o que você está procurando
```

Ou seja: o documento não está mais nesse caminho, em nenhum host.

## Correção

1. **Coletor** — `url_de_inteiro_teor()` em
   `ferramentas/manutencao/atualizar_base_juridica.py` descarta o link quando ele
   casa `ROTA_STF_DESATIVADA` (`https?://www.stf.jus.br/portal/`). O precedente
   fica sem `url` e mantém a `consulta` por classe e número em
   `jurisprudencia.stf.jus.br`, que o coletor já montava como segunda porta.
2. **Dados publicados** — a mesma função foi aplicada aos 8 registros existentes
   (7 em `sumulas_stf.json`, 1 em `sumulas_vinculantes.json`). Nenhum precedente
   ficou sem porta: a consulta estava preenchida nos 8.
3. **Auditor** — `auditar_base_juridica.py` varre todos os JSONs de `data/` e
   registra `ROTA_DESATIVADA` (P0) se o endereço morto reaparecer, por recoleta
   ou por edição manual.
4. **Teste de regressão** —
   `test_precedente_nao_publica_link_de_rota_desativada` reproduz a página da
   súmula com os dois formatos de link morto (`inteiroTeor/obterInteiroTeor.asp`
   e `jurisprudencia/listarJurisprudencia.asp`) e exige `url` vazia com consulta
   preservada.

Resposta do MCP depois da correção:

```text
- ARE 914.045 RG, rel. min. Edson Fachin, P, j. 15/10/2015 — Tema 856 de repercussão geral
  Consulta por classe e número: https://jurisprudencia.stf.jus.br/pages/search?...&classeNumeroIncidente=ARE%20914045
```

## Validação executada

- `python3 ferramentas/manutencao/auditar_base_juridica.py` — nenhuma
  inconsistência; a nova checagem foi exercitada com um arquivo semeado e
  reprovou como esperado.
- `python3 -m unittest discover -s tests` em `ferramentas/manutencao` — 133
  testes, todos verdes.
- `bun test` no motor — 90 testes, todos verdes.
- `gerar_indices_derivados.py --escrever` e `gerar_snapshots.py --escrever`:
  `sumulas_stf.json` e `sumulas_vinculantes.json` na versão 4, com o manifesto
  registrando as 5 súmulas e a vinculante alteradas.
- `verificar_compatibilidade.py` — 10 protocolos portáveis e sincronizados.

## Limites desta verificação

- **A consulta por classe e número não pode ser validada por linha de comando.**
  `jurisprudencia.stf.jus.br` responde `202` com corpo vazio a cliente
  automatizado (a página monta o resultado por JavaScript), então a confirmação
  depende de conferência no navegador. Feita em 01/08/2026: **os 8 substitutos
  foram abertos um a um e todos exibem o acórdão** — ARE 678.112, RE 724.347,
  ARE 914.045, RE 565.048, RE 627.543, RE 593.849, RE 592.377 e Rcl 27.310. O
  que está provado por linha de comando é o contrário: que o endereço removido
  **não** abre.
- **O portal do STF é intermitente.** Em 30 requisições de controle a
  `verTeseTema.asp`, `detalharProcesso.asp` e `verPronunciamento.asp` não houve
  falha, mas numa tentativa isolada anterior o `detalharProcesso.asp?numeroTema=69`
  devolveu a tela de 404 e, repetido em seguida, devolveu a página correta. Link
  válido do STF pode falhar por instabilidade do servidor — o que reforça manter
  sempre uma segunda porta no registro.
- **Os demais padrões de link do STF não foram varridos integralmente.** Amostras
  responderam bem (`redir.stf.jus.br/paginadorpub` com `202` de desafio,
  `portal.stf.jus.br/processos/downloadPeca.asp` com PDF, edições do Informativo
  com `200`), mas o WAF do STF bloqueia varredura em volume: 1.211 requisições
  seguidas levaram a `403` generalizado por vários minutos. Uma verificação
  completa dos links do acervo precisa de execução espaçada e retomável.
