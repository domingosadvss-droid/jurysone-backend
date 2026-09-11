# Atribuição — Base Jurídica e Ferramentas

Este diretório (`base-juridica/`), o diretório `ferramentas/`, o diretório `templates/`,
o scaffold de `casos/` (README, `_modelo-de-caso/` e o caso sintético de exemplo) e as
10 skills numeradas em `.claude/skills/` (`0.1-criar-protocolo` a `4.1-revisar-peca`)
foram importados do projeto open source **Advocacia Aberta**:

- Autor: Emidio Trancoso (OAB/PR 119.075)
- Repositório: https://github.com/emidio-trancoso/advocacia-aberta
- Licença: MIT (texto completo abaixo)
- Site: https://advocaciaaberta.org

Os dados de legislação, súmulas, teses e acórdãos referenciam fontes oficiais públicas
(textos de lei e decisões judiciais não são protegidos por direito autoral no Brasil,
art. 8º da Lei 9.610/1998) — a curadoria, taxonomia e estrutura de acesso são o que o
projeto Advocacia Aberta desenvolveu e disponibilizou sob MIT.

**Antes de usar em produção**: os dados são *snapshots* de trabalho — não presumir
vigência/atualização sem conferir a fonte oficial (ver `base-juridica/CATALOGO.md` e
`base-juridica/ATUALIZACAO.md`). Nada aqui substitui revisão profissional.

## Licença MIT (do projeto de origem)

```
MIT License

Copyright (c) 2026 Emidio Trancoso

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Fonte adicional — skills-datajud-djen

As skills `datajud` e `djen` (em `.claude/skills/datajud` e `.claude/skills/djen`)
foram importadas do projeto:

- Autor: Ricardo Sanches
- Repositório: https://github.com/rvsanches/skills-datajud-djen
- Licença: MIT
- Origem do conteúdo: operação em produção do SaaS jurídico Judis, consumindo as
  APIs públicas do CNJ (DataJud e DJEN/Comunica PJe)

Documentam comportamento de produção das duas APIs oficiais do CNJ que a documentação
oficial não cobre (timeouts reais, geo-bloqueio, paginação, formatos de data, códigos
de movimento). Projeto independente, sem afiliação com o CNJ — as APIs são públicas,
sem SLA nem versionamento formal, e podem mudar sem aviso.

## Como isso se relaciona com as 12 skills próprias do escritório

As 12 skills criadas para o JurysOne (`peticionamento-civel`, `peticionamento-trabalhista`,
`peticionamento-penal`, `direito-administrativo-licitacoes`, `direito-tributario`,
`revisao-contratos`, `calculos-judiciais`, `lgpd-compliance`, `captacao-leads`,
`gestao-financeira-escritorio`, `processos-extrajudiciais`, `protocolo-processual`)
continuam ativas e cobrem áreas que o Advocacia Aberta não endereça diretamente
(gestão financeira do escritório, captação de leads, cálculos bancários, LGPD,
licitações, tributário). As skills numeradas do Advocacia Aberta cobrem o **pipeline
de caso** (organizar → diagnosticar → pesquisar fonte → redigir → diagramar → revisar)
apoiado numa base de legislação/jurisprudência com proveniência verificada — use-as
como o fluxo principal de um caso litigioso, e as 12 skills próprias para as áreas
complementares/administrativas do escritório.
