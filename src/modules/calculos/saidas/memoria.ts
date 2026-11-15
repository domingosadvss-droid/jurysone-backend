/**
 * Memória de cálculo em Word (Calibri, pt-BR) e PDF, pronta para juntar aos autos (decisão 135).
 * Traz cenários, índices usados, fórmulas, fundamentos, premissas e avisos; as tabelas completas
 * ficam no Excel conferível que acompanha a memória.
 */
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { Resultado, compBr, dataBr, moeda } from '../nucleo';

const LIMITE_LINHAS_TABELA = 120;

function valorTexto(v: number | string, rotulo = ''): string {
  if (typeof v === 'string') return v;
  if (/dias|parcelas|nº|% a\.m\.|prestações|mínimos|aviso prévio/i.test(rotulo)) return String(v).replace('.', ',');
  return moeda(v);
}

function celulaTexto(tipo: string, v: any): string {
  if (v === null || v === undefined || v === '') return '';
  if (tipo === 'moeda') return moeda(Number(v));
  if (tipo === 'data') return dataBr(v);
  if (tipo === 'competencia') return compBr(v);
  if (tipo === 'fator') return Number(v).toFixed(6).replace('.', ',');
  if (tipo === 'pct') return Number(v).toFixed(4).replace('.', ',') + '%';
  return String(v);
}

export interface MetaMemoria { escritorio?: string; versao?: number; processo?: string | null; cliente?: string | null; autor?: string | null }

// ═══════════════════════ WORD ════════════════════════════════════════════

export async function gerarMemoriaDocx(r: Resultado, meta: MetaMemoria = {}): Promise<Buffer> {
  const run = (text: string, o: any = {}) => new TextRun({ text, font: 'Calibri', language: { value: 'pt-BR' }, ...o });
  const p = (text: string, o: any = {}) => new Paragraph({ children: [run(text, o.run)], alignment: o.alinhamento ?? AlignmentType.JUSTIFIED, spacing: { after: 120, line: 360 }, ...(o.par ?? {}) });
  const titulo = (text: string, nivel: any = HeadingLevel.HEADING_2) => new Paragraph({ heading: nivel, children: [run(text, { bold: true, size: nivel === HeadingLevel.HEADING_1 ? 32 : 26 })], spacing: { before: 240, after: 120 } });
  const borda = { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };
  const cel = (text: string, o: { bold?: boolean; fundo?: string; direita?: boolean; tamanho?: number } = {}) => new TableCell({
    borders: bordas,
    shading: o.fundo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fundo } : undefined,
    children: [new Paragraph({ alignment: o.direita ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run(text, { bold: o.bold, size: o.tamanho ?? 20 })] })],
  });

  const corpo: any[] = [
    titulo('MEMÓRIA DE CÁLCULO', HeadingLevel.HEADING_1),
    p(r.titulo, { run: { bold: true } }),
    p(`Data-base: ${dataBr(r.dataBase)}${meta.versao ? ` — versão ${meta.versao}` : ''}${meta.processo ? ` — Processo ${meta.processo}` : ''}${meta.cliente ? ` — ${meta.cliente}` : ''}`),
  ];
  if (r.resumo.length) {
    corpo.push(titulo('Resumo'));
    corpo.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: r.resumo.map((x) => new TableRow({ children: [cel(x.rotulo), cel(valorTexto(x.valor, x.rotulo), { direita: true })] })) }));
  }
  for (const b of r.blocos) {
    corpo.push(titulo(b.titulo + (b.recomendado ? ' (indicado)' : '')));
    if (b.subtitulo) corpo.push(p(b.subtitulo, { run: { italics: true } }));
    if (b.linhas.length) {
      const rows = [new TableRow({ tableHeader: true, children: [cel('Item', { bold: true, fundo: 'E7E6E6' }), cel('Valor', { bold: true, fundo: 'E7E6E6', direita: true }), cel('Fórmula e fundamento', { bold: true, fundo: 'E7E6E6' })] })];
      for (const l of b.linhas) rows.push(new TableRow({ children: [cel(l.rotulo), cel(moeda(l.valor), { direita: true }), cel([l.formula, l.fundamento].filter(Boolean).join(' — '), { tamanho: 18 })] }));
      rows.push(new TableRow({ children: [cel(b.total.rotulo, { bold: true }), cel(moeda(b.total.valor), { bold: true, direita: true }), cel('')] }));
      corpo.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    }
    for (const o of b.observacoes ?? []) corpo.push(p(o));
  }
  for (const t of r.tabelas) {
    corpo.push(titulo(t.titulo));
    if (!t.linhas.length) { corpo.push(p('Sem linhas.')); continue; }
    const linhas = t.linhas.slice(0, LIMITE_LINHAS_TABELA);
    const rows = [new TableRow({ tableHeader: true, children: t.colunas.map((c) => cel(c.titulo, { bold: true, fundo: 'E7E6E6', tamanho: 16 })) })];
    for (const l of linhas) rows.push(new TableRow({ children: t.colunas.map((c) => cel(celulaTexto(c.tipo, l[c.chave]), { direita: c.tipo !== 'texto', tamanho: 16 })) }));
    const totais = t.colunas.map((c) => (c.total ? moeda(t.linhas.reduce((s, l) => s + (Number(l[c.chave]) || 0), 0)) : ''));
    if (totais.some(Boolean)) rows.push(new TableRow({ children: totais.map((x, i) => cel(i === 0 && !x ? 'Total' : x, { bold: true, direita: i > 0, tamanho: 16 })) }));
    corpo.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    if (t.linhas.length > LIMITE_LINHAS_TABELA) corpo.push(p(`Exibidas ${LIMITE_LINHAS_TABELA} de ${t.linhas.length} linhas; a tabela completa está no Excel que acompanha esta memória.`, { run: { italics: true } }));
  }
  if (r.indicesUsados?.length) {
    corpo.push(titulo('Índices e taxas utilizados'));
    for (const i of r.indicesUsados) corpo.push(p(`${i.nome} — série ${i.codigo} do Sistema Gerenciador de Séries do Banco Central${i.faltando.length ? ` (sem valor em ${i.faltando.map(compBr).join(', ')})` : ''}.`));
  }
  const lista = (tit: string, itens: string[]) => { if (itens.length) { corpo.push(titulo(tit)); for (const x of itens) corpo.push(p('• ' + x)); } };
  lista('Premissas e metodologia', r.premissas);
  lista('Destaques', r.destaques);
  lista('Pontos a conferir', r.avisos);
  lista('Fundamentos', r.fundamentos);
  corpo.push(p(`Gerado pelo JurysOne${meta.escritorio ? ` — ${meta.escritorio}` : ''}${meta.autor ? `, sob responsabilidade de ${meta.autor}` : ''}. Os cálculos foram feitos pelo sistema; conferir antes de juntar aos autos.`, { run: { size: 18, italics: true } }));

  const doc = new Document({
    creator: 'JurysOne', title: r.titulo, language: 'pt-BR' as any,
    styles: { default: { document: { run: { font: 'Calibri', size: 24, language: { value: 'pt-BR' } } as any } } },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1701, left: 1701, bottom: 1134, right: 1134 } } }, children: corpo }],
  } as any);
  return Packer.toBuffer(doc);
}

// ═══════════════════════ PDF ═════════════════════════════════════════════

function limpar(s: string) {
  return String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-').replace(/…/g, '...').replace(/×/g, 'x').replace(/Π/g, 'Prod')
    .replace(/[•]/g, '-').replace(/[\r\t]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF]/g, '');
}

export async function gerarMemoriaPdf(r: Resultado, meta: MetaMemoria = {}): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(limpar(r.titulo)); pdf.setLanguage('pt-BR'); pdf.setCreator('JurysOne');
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const neg = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595; const H = 842; const ML = 70; const MR = 45; const L = W - ML - MR;
  let pg = pdf.addPage([W, H]); let y = H - 60;
  const nova = () => { pg = pdf.addPage([W, H]); y = H - 60; };
  const quebra = (t: string, f: any, tam: number, larg: number) => {
    const out: string[] = [];
    for (const par of limpar(t).split('\n')) {
      let linha = '';
      for (const w of par.split(' ')) {
        const tent = linha ? linha + ' ' + w : w;
        if (f.widthOfTextAtSize(tent, tam) > larg && linha) { out.push(linha); linha = w; } else linha = tent;
      }
      out.push(linha);
    }
    return out;
  };
  const texto = (t: string, o: { tam?: number; bold?: boolean; x?: number; larg?: number; cor?: any; esp?: number } = {}) => {
    const tam = o.tam ?? 10; const f = o.bold ? neg : reg;
    for (const l of quebra(t, f, tam, o.larg ?? L)) {
      if (y < 60) nova();
      pg.drawText(l, { x: o.x ?? ML, y, size: tam, font: f, color: o.cor ?? rgb(0.1, 0.1, 0.1) });
      y -= tam * 1.45;
    }
    y -= o.esp ?? 2;
  };
  const linhaValor = (rot: string, val: string, o: { bold?: boolean; nota?: string } = {}) => {
    const f = o.bold ? neg : reg; const larg = L - 110;
    const ls = quebra(rot, f, 9.5, larg);
    if (y - ls.length * 13 < 60) nova();
    const y0 = y;
    for (const l of ls) { pg.drawText(l, { x: ML, y, size: 9.5, font: f }); y -= 13; }
    const v = limpar(val);
    pg.drawText(v, { x: ML + L - f.widthOfTextAtSize(v, 9.5), y: y0, size: 9.5, font: f });
    if (o.nota) texto(o.nota, { tam: 8, x: ML + 10, larg: larg - 10, cor: rgb(0.35, 0.35, 0.35) });
    y -= 2;
  };

  texto('MEMÓRIA DE CÁLCULO', { tam: 15, bold: true, esp: 4 });
  texto(r.titulo, { tam: 11.5, bold: true });
  texto(`Data-base: ${dataBr(r.dataBase)}${meta.versao ? ` - versão ${meta.versao}` : ''}${meta.processo ? ` - Processo ${meta.processo}` : ''}${meta.cliente ? ` - ${meta.cliente}` : ''}`, { esp: 10 });
  if (r.resumo.length) { texto('Resumo', { tam: 12, bold: true }); for (const x of r.resumo) linhaValor(x.rotulo, valorTexto(x.valor, x.rotulo)); y -= 8; }
  for (const b of r.blocos) {
    texto(b.titulo + (b.recomendado ? ' (indicado)' : ''), { tam: 12, bold: true });
    if (b.subtitulo) texto(b.subtitulo, { tam: 9, cor: rgb(0.3, 0.3, 0.3) });
    for (const l of b.linhas) linhaValor(l.rotulo, moeda(l.valor), { nota: [l.formula, l.fundamento].filter(Boolean).join(' - ') });
    if (b.linhas.length) linhaValor(b.total.rotulo, moeda(b.total.valor), { bold: true });
    for (const o of b.observacoes ?? []) texto(o, { tam: 9 });
    y -= 8;
  }
  for (const t of r.tabelas) {
    texto(t.titulo, { tam: 11, bold: true });
    const cols = t.colunas; const largCol = L / cols.length; const tam = cols.length > 8 ? 6 : cols.length > 6 ? 7 : 8;
    const cab = () => { if (y < 80) nova(); cols.forEach((c, i) => { const ls = quebra(c.titulo, neg, tam, largCol - 3); ls.slice(0, 2).forEach((l, k) => pg.drawText(l, { x: ML + i * largCol, y: y - k * (tam + 2), size: tam, font: neg })); }); y -= 2 * (tam + 2) + 4; };
    cab();
    for (const l of t.linhas.slice(0, LIMITE_LINHAS_TABELA)) {
      if (y < 60) { nova(); cab(); }
      cols.forEach((c, i) => { let s = limpar(celulaTexto(c.tipo, l[c.chave])); while (s && reg.widthOfTextAtSize(s, tam) > largCol - 3) s = s.slice(0, -1); pg.drawText(s, { x: ML + i * largCol, y, size: tam, font: reg }); });
      y -= tam + 4;
    }
    if (t.linhas.length > LIMITE_LINHAS_TABELA) texto(`Exibidas ${LIMITE_LINHAS_TABELA} de ${t.linhas.length} linhas; tabela completa no Excel.`, { tam: 8 });
    y -= 8;
  }
  const lista = (tit: string, itens: string[]) => { if (itens.length) { texto(tit, { tam: 11, bold: true }); for (const x of itens) texto('- ' + x, { tam: 9 }); y -= 6; } };
  if (r.indicesUsados?.length) lista('Índices e taxas utilizados', r.indicesUsados.map((i) => `${i.nome} - série ${i.codigo} do SGS/BCB${i.faltando.length ? ` (sem valor em ${i.faltando.map(compBr).join(', ')})` : ''}`));
  lista('Premissas e metodologia', r.premissas);
  lista('Destaques', r.destaques);
  lista('Pontos a conferir', r.avisos);
  lista('Fundamentos', r.fundamentos);
  texto(`Gerado pelo JurysOne${meta.escritorio ? ` - ${meta.escritorio}` : ''}. Os cálculos foram feitos pelo sistema; conferir antes de juntar aos autos.`, { tam: 8, cor: rgb(0.4, 0.4, 0.4) });
  const paginas = pdf.getPages();
  paginas.forEach((pp, i) => pp.drawText(`${i + 1}/${paginas.length}`, { x: W - MR - 20, y: 30, size: 8, font: reg, color: rgb(0.5, 0.5, 0.5) }));
  return Buffer.from(await pdf.save());
}
