# Checklist para elaboração de RIPD (Relatório de Impacto à Proteção de Dados)

Obrigatório (ou recomendável como boa prática) quando o tratamento envolver: dados sensíveis em larga escala, monitoramento sistemático, decisões automatizadas com efeito relevante ao titular, ou uso de novas tecnologias com alto risco.

## Estrutura sugerida do RIPD

1. **Descrição do tratamento**
   - Que dados são coletados, de quem, com qual finalidade
   - Base legal aplicável (art. 7º ou 11)
   - Fluxo de dados: coleta → armazenamento → uso → compartilhamento → descarte

2. **Necessidade e proporcionalidade**
   - O tratamento é necessário para a finalidade pretendida?
   - Há alternativa que trate menos dados ou dados menos sensíveis?

3. **Identificação de riscos aos titulares**
   - Risco de discriminação, exposição indevida, uso para finalidade diversa, decisão automatizada injusta
   - Probabilidade e severidade de cada risco (matriz simples: baixa/média/alta x baixo/médio/alto impacto)

4. **Medidas de mitigação**
   - Técnicas: criptografia, pseudonimização, controle de acesso, log de auditoria
   - Organizacionais: treinamento, políticas internas, cláusulas contratuais com operadores

5. **Conclusão**
   - Risco residual aceitável ou não
   - Recomendação de medidas adicionais, se necessário
   - Data de revisão programada (RIPD não é documento estático — deve ser revisto quando o tratamento mudar)

## Perguntas de triagem rápida (para decidir se o RIPD é necessário)
- O tratamento envolve dados sensíveis (art. 11) em volume relevante? → provável necessidade de RIPD
- Há decisão automatizada que afeta significativamente o titular (ex.: score de crédito, triagem automática)? → provável necessidade de RIPD
- É um tratamento pontual, de baixo volume, com base legal clara e sem dado sensível? → RIPD geralmente dispensável, mas documentar a análise mesmo assim
