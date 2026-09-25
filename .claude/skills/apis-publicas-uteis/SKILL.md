---
name: apis-publicas-uteis
description: Catálogo curado de APIs públicas/gratuitas relevantes para um escritório de advocacia full-service e para o desenvolvimento do próprio JurysOne — dados jurídicos e de empresas brasileiras (CNPJ/CPF, IBGE, licitações), financeiro (boleto, Pix/pagamento, câmbio) e ferramentas de desenvolvimento (PDF, e-signature, OCR, CEP). Use quando o usuário pedir uma API para validar CNPJ/CPF, gerar boleto, consultar CEP, gerar/assinar PDF, fazer OCR de documento, ou integrar dado público de governo/empresa ao sistema.
---

# APIs Públicas Úteis (escritório + plataforma)

## Visão geral
Curadoria de APIs públicas (a maioria gratuita ou com tier gratuito) selecionadas do catálogo [public-apis/public-apis](https://github.com/public-apis/public-apis) (MIT), filtradas para três necessidades do JurysOne: (1) dados jurídicos/empresariais brasileiros para o trabalho do escritório, (2) financeiro/pagamento, (3) ferramentas de desenvolvimento para continuar construindo a própria plataforma (geração de PDF, OCR, e-signature, validação de dado).

Catálogo completo, com todos os campos (auth, HTTPS, CORS) e mais opções por categoria: [references/catalogo.md](references/catalogo.md).

## Como usar
1. Identificar a necessidade: dado jurídico/empresarial BR, financeiro, ou ferramenta de dev.
2. Consultar o catálogo e escolher a API mais adequada (a maioria não documentada aqui em detalhe — sempre conferir a documentação oficial de cada API antes de integrar, pois `public-apis` só lista, não garante SLA/estabilidade).
3. Antes de integrar qualquer API que trate dado de cliente/terceiro (CPF, CNPJ, e-mail), avaliar a skill [lgpd-compliance](../lgpd-compliance/SKILL.md) — tratamento de dado pessoal por API de terceiro precisa de base legal e, se for operador externo, cláusula contratual de proteção de dados.
4. Nunca commitar chave de API no código — usar variável de ambiente (`.env`), seguindo o padrão já usado no projeto.

## Destaques por necessidade

**Validar/consultar empresa ou pessoa (BR)**: BrasilAPI, Receita WS (CNPJ), CPFHub (CPF), IBGE (geografia/estatística) — ver catálogo.

**Financeiro**: Banco do Brasil (API oficial, OAuth), Boleto.Cloud (emissão de boleto), MercadoPago (pagamento) — ver catálogo.

**Gerar/processar documento (peças, contratos)**: APIs de HTML/Markdown → PDF e de e-signature — relevante para complementar a skill [3.2-diagramar-peca](../3.2-diagramar-peca/SKILL.md) e a integração de e-assinatura já existente no projeto (ClickSign). Ver catálogo para opções com tier gratuito.

**OCR de documento escaneado**: útil para a skill [1.1-organizar-caso](../1.1-organizar-caso/SKILL.md) quando um PDF de autos vem sem texto pesquisável.

**Endereço/CEP**: para cadastro de cliente na captação de leads — ver skill [captacao-leads](../captacao-leads/SKILL.md).

## Alertas
- `public-apis` é uma lista comunitária, não uma garantia de qualidade — antes de integrar qualquer API em produção, testar limites de taxa, estabilidade e ler os termos de uso.
- APIs de terceiro que tratam CPF/CNPJ de cliente são tratamento de dado pessoal sob a LGPD — documentar a base legal e avaliar se a API em si tem conformidade adequada antes de usar em produção.
- Prioridade para APIs oficiais de fonte governamental (Receita Federal via Receita WS, IBGE, Banco Central) sobre agregadores não oficiais, quando a informação precisar de valor jurídico/probatório.
