/**
 * JURYSONE — Texto de um arquivo (PDF com texto, DOCX ou TXT), para a base de conhecimento.
 * PDF escaneado (só imagem) devolve texto vazio: não há OCR aqui.
 */
// import() real (o TypeScript em CommonJS trocaria por require, e o pdf.js só tem ESM)
const importarEsm = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

async function textoPdf(buf: Buffer): Promise<string> {
  const pdfjs = await importarEsm('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const paginas: string[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const c = await page.getTextContent();
      paginas.push(c.items.map((i: any) => (i.str ?? '') + (i.hasEOL ? '\n' : ' ')).join(''));
      page.cleanup();
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }
  return paginas.join('\n\n');
}

async function textoDocx(buf: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const xml: string = await zip.file('word/document.xml')?.async('string') ?? '';
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [])
    .map((p) => (p.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))
    .join('\n')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export async function extrairTexto(buf: Buffer, nomeArquivo: string, mime?: string | null): Promise<string> {
  const nome = nomeArquivo.toLowerCase();
  let texto: string;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-' || nome.endsWith('.pdf') || mime === 'application/pdf') texto = await textoPdf(buf);
  else if (nome.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') texto = await textoDocx(buf);
  else if (nome.endsWith('.txt') || nome.endsWith('.md') || String(mime ?? '').startsWith('text/')) texto = buf.toString('utf8');
  else throw new Error('Formato não aceito: envie PDF, DOCX ou TXT.');
  return texto.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Divide o texto em trechos de ~1.200 caracteres, quebrando em parágrafos */
export function dividirEmTrechos(texto: string, tamanho = 1200): string[] {
  const paragrafos = texto.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  const trechos: string[] = [];
  let atual = '';
  for (const p of paragrafos) {
    if (p.length > tamanho * 1.5) {
      if (atual) { trechos.push(atual); atual = ''; }
      for (let i = 0; i < p.length; i += tamanho) trechos.push(p.slice(i, i + tamanho));
      continue;
    }
    if ((atual + '\n' + p).length > tamanho && atual) { trechos.push(atual); atual = p; }
    else atual = atual ? `${atual}\n${p}` : p;
  }
  if (atual) trechos.push(atual);
  return trechos;
}
