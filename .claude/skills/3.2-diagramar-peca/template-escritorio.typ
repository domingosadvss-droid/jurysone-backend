// =============================================================================
// template-escritorio.typ — Papel timbrado real do escritório (Domingos
// Advocacia e Assessoria Jurídica), extraído do modelo Word oficial
// (escritorio.dotx). Ver references/padrao-escritorio.md para a especificação
// completa e a data da extração.
//
// Diferença para template.typ: este é sóbrio e fiel ao papel timbrado
// (logo real, rodapé com endereço/contato, tipografia formal) — use para
// peças que vão para protocolo/entrega formal. template.typ é o "Legal
// Design" colorido, para material de apoio e apresentação ao cliente.
//
// Como usar no .typ gerado (compile com `typst compile --root . <arquivo>.typ`):
//   #import "/.agents/skills/3.2-diagramar-peca/template-escritorio.typ": *
//   #show: peca.with(titulo: "...", juizo: "...", partes: "...")
//
// Os componentes (destaque, citacao, fundamento, cronologia, marcador) têm a
// MESMA assinatura de template.typ — o conteúdo gerado no Passo 2 da skill
// funciona com qualquer um dos dois templates, só troca o import.
// =============================================================================

#let logo = "/.agents/skills/3.2-diagramar-peca/assets/logo-escritorio.png"
#let icone-whatsapp = "/.agents/skills/3.2-diagramar-peca/assets/whatsapp.png"

// ─── Documento base ────────────────────────────────────────────────────────
// Envolve a peça inteira. Use com:  #show: peca.with(titulo: "...", ...)
#let peca(
  titulo: "",
  juizo: none,       // ex.: "Juízo da 2ª Vara Cível da Comarca de ..."
  partes: none,      // ex.: "FULANO move contra BELTRANO"
  rodape: none,       // não usado aqui — o rodapé é fixo (institucional). Ponha
                      // assinatura/OAB no fim do corpo da peça, se precisar.
  numeracao: false,  // true liga numeração de página (útil para protocolo)
  corpo,
) = {
  set page(
    paper: "a4",
    // Margens do .dotx oficial: topo 1,54cm / base 2,5cm / laterais 3cm.
    // O topo é alargado aqui para caber a logo (~2,84cm de altura) + linha
    // sem invadir o corpo do texto — é uma aproximação do comportamento do
    // Word, que expande a margem automaticamente quando o cabeçalho é maior
    // que a distância configurada.
    margin: (top: 4.6cm, bottom: 3.4cm, left: 3cm, right: 3cm),
    numbering: if numeracao { "1" } else { none },
    header: [
      #align(center)[#image(logo, width: 9.47cm)]
      #v(0.25cm)
      #line(length: 100%, stroke: 0.6pt + black)
    ],
    footer: [
      #line(length: 100%, stroke: 0.6pt + black)
      #v(0.15cm)
      #align(center, text(size: 12pt)[R. 501, nº145, Sl 05, centro, Balneário Camboriú])
      #v(0.1cm)
      #align(center)[
        #text(font: ("Baskerville Old Face", "Georgia", "Times New Roman"), size: 10pt)[jonathan\@domingosadvocacia.com.br]
        #h(0.4cm)
        #text(font: ("Arial", "Helvetica"), size: 10pt)[47 - 999159178]
        #h(0.2cm)
        #box(baseline: 30%)[#image(icone-whatsapp, width: 0.45cm)]
      ]
    ],
  )

  // Corpo: Calibri 12pt, espaçamento 1,5, recuo de primeira linha 3cm —
  // padrão do escritório (ver references/padrao-escritorio.md).
  set text(font: ("Calibri", "Carlito", "Arial"), size: 12pt, lang: "pt")
  // `all: true` força o recuo em todo parágrafo, inclusive o que vem logo
  // depois de um título — sem isso o Typst pula o recuo nesse caso.
  set par(justify: true, leading: 0.95em, first-line-indent: (amount: 3cm, all: true), spacing: 1.3em)

  // Títulos de seção — sóbrios, sem cor.
  show heading.where(level: 1): it => {
    set text(size: 13pt, weight: "bold")
    block(above: 1.4em, below: 0.8em)[#upper(it.body)]
  }
  show heading.where(level: 2): it => {
    set text(size: 12pt, weight: "bold")
    block(above: 1.1em, below: 0.6em)[#it.body]
  }

  // Cabeçalho da peça (endereçamento / título / partes)
  if juizo != none {
    align(center, text(size: 12pt, upper(juizo)))
    v(1em)
  }
  align(center, text(size: 14pt, weight: "bold", upper(titulo)))
  if partes != none {
    v(0.5em)
    align(center, text(size: 11pt, style: "italic", partes))
  }
  v(1.5em)

  corpo
}

// ─── Destaque ────────────────────────────────────────────────────────────────
// Caixa para o ponto-chave que não pode passar batido. Sóbria: sem cor, só
// uma borda à esquerda.
#let destaque(corpo) = block(
  width: 100%,
  stroke: (left: 2pt + black),
  inset: (left: 12pt, rest: 8pt),
  above: 1em, below: 1em,
)[#set par(first-line-indent: 0pt); #corpo]

// ─── Citação em bloco ─────────────────────────────────────────────────────────
// Transcrição literal (lei, doutrina, jurisprudência). Enquadramento de 4cm a
// partir da margem esquerda, espaçamento simples, fonte reduzida — padrão do
// escritório para citações longas.
#let citacao(fonte: none, corpo) = block(above: 1em, below: 1em)[
  #pad(left: 4cm)[
    #set par(first-line-indent: 0pt, leading: 0.65em, justify: true)
    #set text(size: 11pt)
    #corpo
    #if fonte != none [
      #v(0.3em)
      #text(size: 9.5pt, style: "italic")[— #fonte]
    ]
  ]
]

// ─── Fundamento (lei / jurisprudência) ─────────────────────────────────────────
// Caixa enxuta para citar uma fonte verificada. NÃO inventar: só preencher com
// dados reais (de /buscar-fontes ou /buscar-tjpr).
#let fundamento(tipo: "FUNDAMENTO", ref: "", corpo) = block(
  width: 100%,
  stroke: 0.6pt + black,
  inset: 10pt,
  above: 1em, below: 1em,
)[
  #set par(first-line-indent: 0pt)
  #text(size: 9pt, weight: "bold")[#upper(tipo)#if ref != "" [ · #ref]]
  #v(0.3em)
  #corpo
]

// ─── Cronologia ────────────────────────────────────────────────────────────────
// Linha do tempo simples. Uso: #cronologia((("12/03/2024", "Contrato assinado"), ...))
#let cronologia(eventos) = block(above: 1em, below: 1em)[
  #set par(first-line-indent: 0pt)
  #for (data, evento) in eventos [
    #grid(
      columns: (3.2cm, 1fr),
      gutter: 8pt,
      text(weight: "bold", size: 10pt)[#data],
      text(size: 10pt)[#evento],
    )
    #v(0.35em)
  ]
]

// ─── Marcador inline ───────────────────────────────────────────────────────────
// Etiqueta curta para guiar a leitura (ex.: #marcador("PEDIDO")).
#let marcador(txt) = box(
  stroke: 0.6pt + black,
  inset: (x: 5pt, y: 2pt),
  radius: 2pt,
)[#text(size: 8pt, weight: "bold")[#upper(txt)]]
