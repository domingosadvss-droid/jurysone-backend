# Padrão do escritório — Domingos Advocacia e Assessoria Jurídica

Extraído do modelo Word oficial do escritório (`escritorio.dotx`) em 2026-09-11.
Fonte de verdade para o `template-escritorio.typ` desta skill — se o padrão do
escritório mudar (novo endereço, nova logo, nova fonte), atualize primeiro este
arquivo e depois o `.typ`.

## Página

- Tamanho: A4
- Margem superior: 1,54 cm
- Margem inferior: 2,5 cm
- Margens esquerda/direita: 3,0 cm cada
- Distância do rodapé até a borda: 1,25 cm

## Cabeçalho

- Logo do escritório (`assets/logo-escritorio.png`), centralizada, ~9,47 × 2,84 cm
- Linha horizontal fina separando o cabeçalho do corpo do texto

## Rodapé

Linha horizontal fina acima do conteúdo, depois duas linhas centralizadas:

1. Endereço, 12pt: `R. 501, nº145, Sl 05, centro, Balneário Camboriú`
2. Contato: e-mail `jonathan@domingosadvocacia.com.br` (fonte Baskerville Old
   Face) + telefone `47 - 999159178` (fonte Arial) + ícone do WhatsApp
   (`assets/whatsapp.png`)

## Corpo do texto

- Fonte: Calibri, 12pt
- Espaçamento entre linhas: 1,5
- Recuo da primeira linha do parágrafo: 3 cm
- Citações em bloco (transcrição literal de lei, doutrina, jurisprudência):
  enquadramento (recuo) de 4 cm a partir da margem esquerda, espaçamento
  simples, fonte em tamanho reduzido — conforme convenção usual de citação
  longa em peças jurídicas.

## Onde isso é usado

- `template-escritorio.typ` (nesta pasta, um nível acima) implementa esse
  padrão exatamente — cabeçalho/rodapé com a logo e os dados reais do
  escritório, tipografia e recuos conforme acima. Use para peças que vão para
  protocolo/entrega formal com o papel timbrado do escritório.
- `template.typ` continua sendo o template de "Legal Design" colorido (caixas
  de destaque, cor institucional azul) — use para material de apoio, análise
  interna ou apresentação ao cliente, quando o visual mais elaborado ajuda a
  leitura e não há exigência de papel timbrado formal.
