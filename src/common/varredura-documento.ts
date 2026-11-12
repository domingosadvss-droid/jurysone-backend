/**
 * JURYSONE — Varredura de prompt injection em PDF/DOCX vindos de fora
 *
 * Mesmas regras da skill "auditoria-prompt-injection" do escritório, adaptadas ao servidor:
 *   • texto invisível (modo de renderização 3), branco ou minúsculo no PDF;
 *   • texto oculto (vanish), branco ou minúsculo no DOCX, comentários e metadados;
 *   • padrões de instrução dirigida a IA em qualquer camada;
 *   • caracteres invisíveis / de controle bidirecional / "tag characters".
 * A camada de OCR de PDF escaneado (quase todo o texto da página invisível) não é tratada
 * como texto oculto, mas o seu conteúdo também passa pelos padrões.
 * Resultado: LIMPO | ACHADOS | INCONCLUSIVO (PDF só imagem, ou arquivo ilegível).
 */

const PADROES_SUSPEITOS = [
  String.raw`ignor\w*\s+(todas\s+)?(as\s+)?(instru\w+|ordens|orienta\w+)\s+(anteriores|acima|pr[eé]vias)`,
  String.raw`desconsider\w*\s+(as\s+)?(instru\w+|orienta\w+|regras)`,
  String.raw`ignore\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?|rules)`,
  String.raw`disregard\s+(all\s+)?(the\s+)?(previous|prior|above)`,
  String.raw`\b(system\s+prompt|prompt\s+do\s+sistema|developer\s+message)\b`,
  String.raw`\b(voc[eê]\s+[eé]\s+(um|uma)\s+(ia|assistente|modelo)|you\s+are\s+(an?\s+)?(ai|assistant|language\s+model))\b`,
  String.raw`\b(como|enquanto)\s+(ia|intelig[eê]ncia\s+artificial|modelo\s+de\s+linguagem|assistente)\b`,
  String.raw`\b(as\s+an?\s+)(ai|llm|language\s+model|assistant)\b`,
  String.raw`\b(chatgpt|gpt-?\d|claude|gemini|copilot|llm|openai|anthropic)\b`,
  String.raw`\b(responda|conclua|afirme|declare|diga)\s+(apenas\s+)?que\b`,
  String.raw`\b(respond|answer|conclude|state|say)\s+(only\s+)?that\b`,
  String.raw`\b(nova|novas)\s+instru\w+\b|\bnew\s+instructions?\b`,
  String.raw`\b(n[aã]o\s+mencione|do\s+not\s+mention|n[aã]o\s+revele|do\s+not\s+reveal)\b`,
  String.raw`\b(resum\w+|summar\w+)\s+.{0,40}\b(favor[aá]vel|favorably|procedente)\b`,
  String.raw`<\s*/?\s*(system|instructions?|prompt|assistant|user)\s*>`,
  String.raw`\[\s*(system|inst|instructions?)\s*\]`,
];
const RE_SUSPEITO = new RegExp(PADROES_SUSPEITOS.map((p) => `(?:${p})`).join('|'), 'giu');
const RE_INVISIVEIS = /[​‌‍⁠﻿‪-‮⁦-⁩]/g;
const RE_TAGS = /[\u{E0000}-\u{E007F}]/gu;

export type Gravidade = 'ALTA' | 'MEDIA' | 'BAIXA';
export interface Achado { gravidade: Gravidade; camada: string; local: string; descricao: string; trecho: string }
export interface ResultadoVarredura {
  resultado: 'LIMPO' | 'ACHADOS' | 'INCONCLUSIVO';
  achados: Achado[];
  camadas: string[];
  observacoes: string[];
}

function trecho(t: string, max = 400) {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max) + ' […]';
}

function verificarTexto(achados: Achado[], camada: string, local: string, texto: string, gravidadeInvisivel: Gravidade = 'MEDIA') {
  if (!texto || !texto.trim()) return;
  for (const m of texto.matchAll(RE_SUSPEITO)) {
    const ini = Math.max(0, (m.index ?? 0) - 150);
    achados.push({ gravidade: 'ALTA', camada, local, descricao: `padrão de instrução a IA: “${m[0]}”`, trecho: trecho(texto.slice(ini, (m.index ?? 0) + m[0].length + 250)) });
  }
  const inv = texto.match(RE_INVISIVEIS)?.length ?? 0;
  const tags = texto.match(RE_TAGS) ?? [];
  if (inv >= 3 || tags.length) {
    const decod = tags.map((c) => String.fromCodePoint(c.codePointAt(0)! - 0xe0000)).join('');
    achados.push({
      gravidade: tags.length ? 'ALTA' : gravidadeInvisivel, camada, local,
      descricao: `caracteres invisíveis/controle (${inv})${tags.length ? `; tag characters decodificados: “${trecho(decod, 200)}”` : ''}`,
      trecho: trecho(texto),
    });
  }
}

function concluir(achados: Achado[], camadas: string[], observacoes: string[], inconclusivo: boolean): ResultadoVarredura {
  const relevante = achados.some((a) => a.gravidade !== 'BAIXA');
  return { resultado: relevante ? 'ACHADOS' : inconclusivo ? 'INCONCLUSIVO' : 'LIMPO', achados, camadas, observacoes };
}

// ── PDF ──────────────────────────────────────────────────────────────────────

// import() real (o TypeScript em CommonJS trocaria por require, e o pdf.js só tem ESM)
const importarEsm = new Function('m', 'return import(m)') as (m: string) => Promise<any>;

function corClara(args: any[]): boolean {
  if (!args?.length) return false;
  if (typeof args[0] === 'string') {
    const h = args[0].replace('#', '');
    if (h.length !== 6) return false;
    return [0, 2, 4].every((i) => parseInt(h.slice(i, i + 2), 16) >= 245);
  }
  const nums = args.map(Number).filter((n) => !Number.isNaN(n));
  if (nums.length === 1) return nums[0] >= 0.96 || nums[0] >= 245;
  if (nums.length >= 3) return nums.slice(0, 3).every((n) => n >= 0.96 && (n <= 1 || n >= 245));
  return false;
}

async function varrerPdf(buf: Buffer): Promise<ResultadoVarredura> {
  const achados: Achado[] = [];
  const camadas = ['texto visível', 'texto invisível / branco / minúsculo', 'metadados'];
  const observacoes: string[] = [];
  const pdfjs = await importarEsm('pdfjs-dist/legacy/build/pdf.mjs');
  const OPS = pdfjs.OPS;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  let totalTexto = 0;
  let paginasOcr = 0;

  try {
    const meta = await doc.getMetadata().catch(() => null);
    if (meta?.info) verificarTexto(achados, 'metadados', 'info', Object.values(meta.info).filter((v) => typeof v === 'string').join(' \n '));
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const conteudo = await page.getTextContent();
      const visivel = conteudo.items.map((i: any) => i.str ?? '').join(' ');
      totalTexto += visivel.replace(/\s/g, '').length;

      // Estado gráfico simplificado para achar texto escondido
      const ops = await page.getOperatorList();
      const pilha: any[] = [];
      let st = { modo: 0, clara: false, tamanho: 12, escala: 1 };
      let oculto = '';
      let totalGlifos = 0;
      let invisiveis = 0;
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        const a = ops.argsArray[i];
        if (fn === OPS.save) pilha.push({ ...st });
        else if (fn === OPS.restore) st = pilha.pop() ?? st;
        else if (fn === OPS.setTextRenderingMode) st.modo = Number(a?.[0] ?? 0);
        else if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillColor || fn === OPS.setFillColorN) st.clara = corClara(a ?? []);
        else if (fn === OPS.setFont) st.tamanho = Math.abs(Number(a?.[1] ?? 12));
        else if (fn === OPS.setTextMatrix) st.escala = Math.abs(Number(a?.[3] ?? 1)) || 1;
        else if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
          const glifos = (fn === OPS.nextLineSetSpacingShowText ? a?.[2] : a?.[0]) ?? [];
          const txt = (Array.isArray(glifos) ? glifos : []).map((g: any) => (g && typeof g === 'object' ? g.unicode ?? '' : '')).join('');
          const qtd = txt.replace(/\s/g, '').length;
          totalGlifos += qtd;
          const invisivel = st.modo === 3 || st.modo === 7;
          if (invisivel) invisiveis += qtd;
          if (invisivel || st.clara || st.tamanho * st.escala < 1.5) oculto += txt + ' ';
        }
      }
      // Camada OCR: quase todo o texto da página é invisível (escaneado com reconhecimento de texto)
      const ocr = totalGlifos > 0 && invisiveis / totalGlifos > 0.8;
      if (ocr) {
        paginasOcr++;
        verificarTexto(achados, 'texto da camada OCR', `página ${n}`, visivel);
      } else {
        verificarTexto(achados, 'texto visível', `página ${n}`, visivel);
        const limpo = oculto.replace(/\s+/g, ' ').trim();
        if (limpo.replace(/\s/g, '').length >= 15) {
          const antes = achados.length;
          verificarTexto(achados, 'texto oculto', `página ${n}`, limpo, 'ALTA');
          if (achados.length === antes) {
            achados.push({ gravidade: 'MEDIA', camada: 'texto oculto', local: `página ${n}`, descricao: 'texto invisível, branco ou minúsculo na página', trecho: trecho(limpo) });
          }
        }
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }
  if (paginasOcr) observacoes.push(`${paginasOcr} página(s) escaneada(s) com camada de OCR: o texto do OCR foi verificado; a imagem em si não é lida pela varredura.`);
  const soImagem = totalTexto < 20;
  if (soImagem) observacoes.push('PDF sem texto (só imagem): a varredura é inconclusiva para camadas ocultas.');
  return concluir(achados, camadas, observacoes, soImagem);
}

// ── DOCX ─────────────────────────────────────────────────────────────────────

async function varrerDocx(buf: Buffer): Promise<ResultadoVarredura> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  const achados: Achado[] = [];
  const camadas = ['texto do corpo, cabeçalhos e rodapés', 'texto oculto/branco/minúsculo', 'comentários', 'metadados'];
  const partes = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes|comments\w*)\.xml$/.test(n));
  for (const nome of partes) {
    const xml: string = await zip.file(nome).async('string');
    let visivel = '';
    let oculto = '';
    for (const run of xml.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? []) {
      const texto = (run.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, '')).join('');
      if (!texto) continue;
      const rpr = run.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? '';
      const vanish = /<w:(?:vanish|specVanish|webHidden)(?:\s*\/>|\s+w:val="(?:true|1|on)"\s*\/>)/.test(rpr);
      const cor = rpr.match(/<w:color\s+w:val="([0-9A-Fa-f]{6})"/)?.[1];
      const branca = cor ? [0, 2, 4].every((i) => parseInt(cor.slice(i, i + 2), 16) >= 245) : false;
      const sz = Number(rpr.match(/<w:sz\s+w:val="(\d+)"/)?.[1] ?? 24);
      if (vanish || branca || sz <= 3) oculto += texto + ' ';
      else visivel += texto + ' ';
    }
    const camada = nome.includes('comments') ? 'comentários' : 'corpo';
    verificarTexto(achados, camada, nome, visivel);
    const limpo = oculto.replace(/\s+/g, ' ').trim();
    if (limpo.replace(/\s/g, '').length >= 15) {
      const antes = achados.length;
      verificarTexto(achados, 'texto oculto', nome, limpo, 'ALTA');
      if (achados.length === antes) achados.push({ gravidade: 'MEDIA', camada: 'texto oculto', local: nome, descricao: 'texto oculto, branco ou minúsculo', trecho: trecho(limpo) });
    }
  }
  for (const meta of ['docProps/core.xml', 'docProps/app.xml', 'docProps/custom.xml']) {
    const f = zip.file(meta);
    if (f) verificarTexto(achados, 'metadados', meta, (await f.async('string')).replace(/<[^>]+>/g, ' '));
  }
  return concluir(achados, camadas, [], false);
}

export async function varrerDocumento(buf: Buffer, nomeArquivo: string, mimeType?: string | null): Promise<ResultadoVarredura> {
  const nome = nomeArquivo.toLowerCase();
  try {
    if (buf.subarray(0, 5).toString('latin1') === '%PDF-' || nome.endsWith('.pdf') || mimeType === 'application/pdf') return await varrerPdf(buf);
    if (nome.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return await varrerDocx(buf);
    return { resultado: 'INCONCLUSIVO', achados: [], camadas: [], observacoes: ['Tipo de arquivo não coberto pela varredura (só PDF e DOCX).'] };
  } catch (e: any) {
    return { resultado: 'INCONCLUSIVO', achados: [], camadas: [], observacoes: [`Não foi possível ler o arquivo: ${e?.message ?? e}`] };
  }
}
