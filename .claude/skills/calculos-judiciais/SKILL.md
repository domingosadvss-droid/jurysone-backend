---
name: calculos-judiciais
description: Elabora cálculos judiciais e bancários — liquidação de sentença, juros e correção monetária, revisão de contratos bancários, expurgo de índices e planilhas de cálculo para perícia contábil. Use quando o usuário pedir cálculo de valor de causa, atualização monetária, cálculo de juros, planilha de liquidação de sentença ou análise/revisão de contrato bancário.
---

# Cálculos Judiciais e Bancários

## Visão geral
Monta planilhas e memórias de cálculo para liquidação de sentença, atualização de débitos judiciais e revisão de contratos bancários (juros abusivos, capitalização, tarifas indevidas). Esta é uma área normalmente coberta por peritos contábeis — a skill apoia a elaboração de cálculos e a identificação de teses, mas cálculos de alta complexidade ou com forte impacto financeiro devem ser conferidos por contador/perito antes do protocolo.

## Base legal essencial
- **Correção monetária**: índice aplicável varia por matéria — IPCA-E (regra geral em condenações cíveis conforme entendimento do STF no Tema 810), INPC, SELIC (tributário e, após EC 113/2021, também dívidas contra a Fazenda Pública federal em geral).
- **Juros de mora**: art. 406 CC (taxa legal, atualmente vinculada à SELIC conforme entendimento consolidado), juros de 1% ao mês em relações de consumo/CDC quando pactuado, termo inicial (citação, ou evento danoso em responsabilidade extracontratual — Súmula 54 STJ).
- **Contratos bancários**: Súmula 596 STF (juros não limitados a 12% a.a. para instituições financeiras), Súmula 539 STJ (capitalização de juros permitida se pactuada expressamente), Súmula 297 STJ (CDC aplicável a bancos), Resolução CMN sobre tarifas bancárias.
- **CPC/2015**: liquidação de sentença (arts. 509-512) — por arbitramento ou por artigos.

## Fluxo de trabalho
1. **Identificar a natureza do cálculo**: liquidação de sentença cível/trabalhista, atualização de débito para execução, ou revisão de contrato bancário.
2. **Definir os parâmetros antes de calcular**:
   - Termo inicial da correção monetária e dos juros
   - Índice de correção aplicável à matéria
   - Taxa de juros (legal, contratual ou a discutir judicialmente)
   - Eventuais descontos, pagamentos parciais ou compensações já feitos
3. **Liquidação de sentença**: extrair do título judicial (sentença/acórdão) os parâmetros exatos determinados (índice, termo inicial, se há juros compostos ou simples) — nunca aplicar parâmetro diferente do que consta no título sem sinalizar a divergência.
4. **Revisão de contrato bancário** — checklist de red flags:
   - Capitalização de juros não pactuada expressamente
   - Taxa de juros muito acima da média de mercado do Banco Central para a modalidade (sinal de abusividade a discutir)
   - Cobrança cumulada de comissão de permanência com outros encargos (vedada pela Súmula 472 STJ)
   - Tarifas não previstas em contrato ou não informadas previamente (TAC, seguro embutido sem anuência)
   - Venda casada de produtos (vedada pelo CDC)
5. **Montar a planilha/memória de cálculo**: mês a mês ou evento a evento, mostrando principal, índice aplicado, juros e valor atualizado — sempre com transparência total da metodologia usada, para permitir conferência. Use [scripts/calculo_juros_correcao.py](scripts/calculo_juros_correcao.py) para gerar a memória de cálculo automaticamente — informe principal, datas, tabela de índices mensais vigente (obtida no IBGE/BACEN, o script não traz índices pré-carregados) e a taxa de juros.
6. **Suspeita de capitalização/anatocismo em contrato bancário**: use [scripts/detector_capitalizacao.py](scripts/detector_capitalizacao.py) para comparar a taxa anual contratada com a taxa que resultaria de capitalização mensal composta, e para varrer o texto do contrato em busca de termos de risco (comissão de permanência, tarifas cumuladas etc.).

## Alertas
- Sempre declarar explicitamente qual índice e qual taxa de juros foram usados e por quê — nunca apresentar um número final sem a memória de cálculo.
- Para valores de alta relevância ou contratos complexos (capitalização diária, tabela price, sistemas de amortização), recomendar conferência por perito contábil antes do protocolo — a skill apoia a montagem do cálculo, não substitui perícia técnica formal.
- Verificar sempre se o título judicial já transitou em julgado com parâmetros de cálculo fixados — nesse caso, a liquidação deve seguir estritamente o que foi decidido, sob pena de excesso de execução.
