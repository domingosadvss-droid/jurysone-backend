/**
 * Excel conferível (decisão 135): cada tabela traz as fórmulas e os fatores apontam para a aba "Índices",
 * onde estão as taxas mensais usadas. Fator = EXP(SOMARPRODUTO(LN(1 + taxas/100))) — funciona em qualquer Excel.
 */
import * as ExcelJS from 'exceljs';
import { MapaIndices, Resultado, SERIES, compBr, compsEntre, LEI_14905_COMPETENCIA } from '../nucleo';

const FMT: Record<string, string> = {
  moeda: '"R$" #,##0.00;[Red]-"R$" #,##0.00', fator: '0.000000', pct: '0.0000', numero: '0', data: 'dd/mm/yyyy',
};

function letra(n: number) {
  let s = ''; n++;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function dataCelula(iso: string | null | undefined) {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

function nomeAba(base: string, usados: Set<string>) {
  let n = base.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28).trim() || 'Tabela';
  let k = 2; const orig = n;
  while (usados.has(n)) n = `${orig.slice(0, 25)} ${k++}`;
  usados.add(n);
  return n;
}

export async function gerarExcel(r: Resultado, indices: MapaIndices, meta: { escritorio?: string; versao?: number } = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JurysOne';
  wb.created = new Date();
  const abas = new Set<string>();
  const ws = wb.addWorksheet(nomeAba('Resumo', abas));

  // ── Aba Índices: só as séries e meses referenciados ──────────────────────
  const precisa = new Set<string>(); let minC: string | null = null; let maxC: string | null = null;
  for (const t of r.tabelas) for (const l of t.linhas) for (const ref of Object.values(l._ref ?? {})) {
    if (!ref.de || !ref.ate) continue;
    if (ref.tipo === 'fator') {
      if (ref.indice === 'LEGAL') { precisa.add('INPC'); precisa.add('IPCA'); precisa.add('LEGAL'); } else if (ref.indice !== 'NENHUM') precisa.add(ref.indice);
    } else if (ref.serie === 'JUROS_LEGAL') { precisa.add('SELIC'); precisa.add('IPCA'); precisa.add('JUROS_LEGAL'); } else if (ref.serie !== 'FIXA') precisa.add(ref.serie);
    if (!minC || ref.de < minC) minC = ref.de;
    if (!maxC || ref.ate > maxC) maxC = ref.ate;
  }
  const ordem = ['IPCA', 'INPC', 'IGPM', 'IGPDI', 'INCC', 'INCC_M', 'IPCAE', 'SELIC', 'TR', 'LEGAL', 'JUROS_LEGAL'].filter((s) => precisa.has(s));
  const linhaComp: Record<string, number> = {};
  const colSerie: Record<string, string> = {};
  const wsI = wb.addWorksheet(nomeAba('Índices', abas));
  wsI.getCell('A1').value = 'Competência';
  ordem.forEach((s, i) => {
    colSerie[s] = letra(i + 1);
    wsI.getCell(`${letra(i + 1)}1`).value = s === 'LEGAL' ? 'Índice legal (INPC até 08/2024; IPCA depois) %' : s === 'JUROS_LEGAL' ? 'Taxa legal de juros % a.m.' : `${SERIES[s]?.nome ?? s} (SGS ${SERIES[s]?.codigo ?? '—'}) %`;
  });
  wsI.getRow(1).font = { bold: true };
  if (minC && maxC) {
    compsEntre(minC, maxC).forEach((c, k) => {
      const row = k + 2; linhaComp[c] = row;
      wsI.getCell(`A${row}`).value = compBr(c);
      for (const s of ordem) {
        const cell = wsI.getCell(`${colSerie[s]}${row}`);
        if (s === 'LEGAL') cell.value = { formula: `${colSerie[c < LEI_14905_COMPETENCIA ? 'INPC' : 'IPCA']}${row}`, result: indices[c < LEI_14905_COMPETENCIA ? 'INPC' : 'IPCA']?.[c] ?? 0 };
        else if (s === 'JUROS_LEGAL') cell.value = c < LEI_14905_COMPETENCIA ? 1 : { formula: `MAX(0,${colSerie.SELIC}${row}-${colSerie.IPCA}${row})`, result: Math.max(0, (indices.SELIC?.[c] ?? 0) - (indices.IPCA?.[c] ?? 0)) };
        else cell.value = indices[s]?.[c] ?? 0;
        cell.numFmt = '0.0000';
      }
    });
  }
  wsI.columns.forEach((c, i) => (c.width = i === 0 ? 13 : 22));
  const faixa = (serie: string, de: string, ate: string) => `'${wsI.name}'!$${colSerie[serie]}$${linhaComp[de]}:$${colSerie[serie]}$${linhaComp[ate]}`;

  // ── Abas das tabelas ─────────────────────────────────────────────────────
  for (const t of r.tabelas) {
    const wt = wb.addWorksheet(nomeAba(t.titulo, abas));
    wt.getCell('A1').value = t.titulo; wt.getCell('A1').font = { bold: true, size: 12 };
    const colDe: Record<string, string> = {};
    t.colunas.forEach((c, i) => { colDe[c.chave] = letra(i); wt.getCell(`${letra(i)}3`).value = c.titulo; });
    wt.getRow(3).font = { bold: true };
    t.linhas.forEach((l, k) => {
      const row = k + 4;
      t.colunas.forEach((c, i) => {
        const cell = wt.getCell(`${letra(i)}${row}`);
        const v = l[c.chave];
        const ref = l._ref?.[c.chave];
        if (ref) {
          if (!ref.de || !ref.ate) cell.value = { formula: ref.tipo === 'fator' ? '1' : '0', result: v };
          else if (ref.tipo === 'fator') cell.value = ref.indice === 'NENHUM' ? 1 : { formula: `EXP(SUMPRODUCT(LN(1+${faixa(ref.indice, ref.de, ref.ate)}/100)))`, result: v };
          else if (ref.serie === 'FIXA') cell.value = { formula: `${ref.fixa ?? 0}*${linhaComp[ref.ate] - linhaComp[ref.de] + 1}`, result: v };
          else cell.value = { formula: `SUM(${faixa(ref.serie, ref.de, ref.ate)})`, result: v };
        } else if (c.formula) {
          cell.value = { formula: c.formula.replace(/\{(\w+)\}/g, (_, ch) => `${colDe[ch]}${row}`), result: v };
        } else if (c.tipo === 'data') cell.value = dataCelula(v);
        else if (c.tipo === 'competencia') cell.value = v ? compBr(v) : '';
        else cell.value = v ?? '';
        if (FMT[c.tipo]) cell.numFmt = FMT[c.tipo];
      });
    });
    const tr = t.linhas.length + 4;
    if (t.linhas.length) {
      wt.getCell(`A${tr}`).value = 'Total'; wt.getRow(tr).font = { bold: true };
      t.colunas.forEach((c, i) => {
        if (!c.total) return;
        const col = letra(i);
        const soma = t.linhas.reduce((s, l) => s + (Number(l[c.chave]) || 0), 0);
        wt.getCell(`${col}${tr}`).value = { formula: `SUM(${col}4:${col}${tr - 1})`, result: Math.round(soma * 100) / 100 };
        wt.getCell(`${col}${tr}`).numFmt = FMT.moeda;
      });
    }
    wt.columns.forEach((c, i) => (c.width = t.colunas[i]?.tipo === 'texto' ? 46 : 18));
    wt.views = [{ state: 'frozen', ySplit: 3 }];
  }

  // ── Aba Resumo (primeira) ────────────────────────────────────────────────
  let row = 1;
  ws.getCell(`A${row}`).value = r.titulo; ws.getCell(`A${row}`).font = { bold: true, size: 14 }; row++;
  ws.getCell(`A${row}`).value = `Data-base: ${r.dataBase.split('-').reverse().join('/')}${meta.versao ? ` — versão ${meta.versao}` : ''}${meta.escritorio ? ` — ${meta.escritorio}` : ''}`; row += 2;
  for (const x of r.resumo) {
    ws.getCell(`A${row}`).value = x.rotulo; ws.getCell(`B${row}`).value = x.valor as any;
    if (typeof x.valor === 'number' && !/dias|parcelas|nº|% a\.m\.|prestações|SM|mínimos/i.test(x.rotulo)) ws.getCell(`B${row}`).numFmt = FMT.moeda;
    row++;
  }
  for (const b of r.blocos) {
    row++;
    ws.getCell(`A${row}`).value = b.titulo + (b.recomendado ? ' (indicado)' : ''); ws.getCell(`A${row}`).font = { bold: true, size: 12 }; row++;
    if (b.subtitulo) { ws.getCell(`A${row}`).value = b.subtitulo; ws.getCell(`A${row}`).font = { italic: true }; row++; }
    const ini = row;
    for (const l of b.linhas) {
      ws.getCell(`A${row}`).value = l.rotulo; ws.getCell(`B${row}`).value = l.valor; ws.getCell(`B${row}`).numFmt = FMT.moeda;
      ws.getCell(`C${row}`).value = [l.formula, l.fundamento].filter(Boolean).join(' — ');
      row++;
    }
    ws.getCell(`A${row}`).value = b.total.rotulo; ws.getCell(`A${row}`).font = { bold: true };
    ws.getCell(`B${row}`).value = b.linhas.length ? { formula: `SUM(B${ini}:B${row - 1})`, result: b.total.valor } : 0;
    ws.getCell(`B${row}`).numFmt = FMT.moeda; ws.getCell(`B${row}`).font = { bold: true }; row++;
    for (const o of b.observacoes ?? []) { ws.getCell(`A${row}`).value = o; row++; }
  }
  const lista = (titulo: string, itens: string[]) => {
    if (!itens.length) return;
    row++; ws.getCell(`A${row}`).value = titulo; ws.getCell(`A${row}`).font = { bold: true }; row++;
    for (const i of itens) { ws.getCell(`A${row}`).value = '• ' + i; row++; }
  };
  lista('Avisos', r.avisos); lista('Destaques', r.destaques); lista('Premissas', r.premissas); lista('Fundamentos', r.fundamentos);
  ws.getColumn(1).width = 70; ws.getColumn(2).width = 20; ws.getColumn(3).width = 80;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}
