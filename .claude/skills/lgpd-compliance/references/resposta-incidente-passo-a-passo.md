# Resposta a incidente de segurança / vazamento de dados — passo a passo

## Fase 1 — Contenção imediata (primeiras horas)
1. Isolar o sistema/ponto de vazamento (revogar credenciais comprometidas, desligar serviço afetado se necessário)
2. Preservar evidências (logs, capturas de tela, horário exato da descoberta) — não apagar nada antes de documentar
3. Formar equipe de resposta: DPO/encarregado, TI/segurança, jurídico, comunicação

## Fase 2 — Avaliação do incidente
1. **Escopo**: quais dados foram afetados (categoria: comuns ou sensíveis), quantos titulares, desde quando
2. **Causa raiz**: falha técnica, erro humano, ataque externo, terceiro/operador
3. **Avaliação de risco/dano relevante aos titulares** (critério do art. 48 LGPD para decidir se a notificação é obrigatória):
   - Há risco de dano patrimonial, moral, discriminação ou uso indevido da identidade?
   - Os dados vazados permitem identificação direta do titular?
   - Havia medida de mitigação já aplicada (ex.: dados criptografados, tornando o vazamento de baixo risco)?

## Fase 3 — Notificação (quando o risco for relevante)
1. **À ANPD**: em prazo razoável, conforme orientação da autoridade — reportar natureza dos dados, titulares afetados, medidas técnicas de segurança já empregadas, riscos, medidas adotadas/planejadas para reverter ou mitigar
2. **Aos titulares**: comunicação clara sobre o que aconteceu, quais dados, o que a empresa está fazendo e o que o titular pode fazer para se proteger (ex.: trocar senha, monitorar conta)
3. Documentar toda a comunicação enviada (data, canal, conteúdo) para eventual fiscalização posterior

## Fase 4 — Remediação e prevenção
1. Corrigir a vulnerabilidade que originou o incidente
2. Atualizar o RIPD e o mapeamento de dados (ROPA) se o incidente revelar tratamento não mapeado
3. Revisar contratos com operadores envolvidos, se o incidente teve origem em terceiro
4. Registrar o incidente em um log interno de incidentes (obrigação implícita de accountability, art. 6º, X)

## Alerta
Não existe prazo legal fixo em número de dias na LGPD (diferente do GDPR, que tem 72h) — a lei fala em "prazo razoável definido pela autoridade nacional". Isso não deve ser interpretado como liberdade para procrastinar: quanto mais rápida e transparente a notificação, menor o risco de sanção por omissão ou atraso injustificado.
