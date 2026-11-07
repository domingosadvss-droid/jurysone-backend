/**
 * JURYSONE — Termo de entrevista em PDF
 * Transforma as respostas do questionário da área num termo formal para o cliente assinar.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface DadosTermo {
  escritorioNome: string;
  clienteNome: string;
  clienteDocumento?: string | null;
  area?: string | null;
  processoTitulo?: string | null;
  questionario: any;
  cidade?: string;
  data?: Date;
}

/** Normaliza formatos de questionário: lista {pergunta,resposta}, {respostas:[...]} ou objeto chave→valor */
export function paresDoQuestionario(q: any): Array<{ pergunta: string; resposta: string }> {
  const texto = (v: any): string => {
    if (v === null || v === undefined || v === '') return 'Não informado';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    if (Array.isArray(v)) return v.map(texto).join('; ');
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${texto(x)}`).join('; ');
    return String(v);
  };
  if (!q) return [];
  const lista = Array.isArray(q) ? q : Array.isArray(q.respostas) ? q.respostas : null;
  if (lista) {
    return lista.map((it: any, i: number) => ({
      pergunta: String(it?.pergunta ?? it?.label ?? it?.campo ?? `Pergunta ${i + 1}`),
      resposta: texto(it?.resposta ?? it?.valor ?? it?.value),
    }));
  }
  return Object.entries(q).map(([k, v]) => ({ pergunta: k, resposta: texto(v) }));
}

/** Fontes padrão do PDF só aceitam o conjunto WinAnsi: troca o que estiver fora dele */
function limpar(s: string) {
  return String(s ?? '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/…/g, '...').replace(/[\r\t]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x0A\x20-\x7E -ÿ]/g, '');
}

export async function gerarTermoEntrevista(d: DadosTermo): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const neg = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 60; const L = 595 - 2 * M; const FS = 10.5; const LH = 15;
  const logoPath = path.join(process.cwd(), 'public', 'logo-domingos.png');
  const logo = fs.existsSync(logoPath) ? await pdf.embedPng(fs.readFileSync(logoPath)) : null;

  let pg = pdf.addPage([595, 842]);
  let y = 0;
  const cabecalho = () => {
    if (logo) {
      const h = 40; const w = logo.width * (h / logo.height);
      pg.drawImage(logo, { x: (595 - w) / 2, y: 790, width: w, height: h });
    } else {
      const t = limpar(d.escritorioNome);
      pg.drawText(t, { x: (595 - neg.widthOfTextAtSize(t, 14)) / 2, y: 805, size: 14, font: neg });
    }
    pg.drawLine({ start: { x: M, y: 780 }, end: { x: 595 - M, y: 780 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y = 755;
  };
  const novaPaginaSePreciso = (altura: number) => {
    if (y - altura < 70) { pg = pdf.addPage([595, 842]); cabecalho(); }
  };
  const quebrar = (texto: string, fonte: any, tam: number) => {
    const linhas: string[] = [];
    for (const par of limpar(texto).split('\n')) {
      let atual = '';
      for (const palavra of par.split(' ')) {
        const teste = atual ? `${atual} ${palavra}` : palavra;
        if (fonte.widthOfTextAtSize(teste, tam) > L && atual) { linhas.push(atual); atual = palavra; } else atual = teste;
      }
      linhas.push(atual);
    }
    return linhas;
  };
  const paragrafo = (texto: string, fonte = reg, tam = FS, espacoDepois = 6) => {
    for (const linha of quebrar(texto, fonte, tam)) {
      novaPaginaSePreciso(LH);
      pg.drawText(linha, { x: M, y, size: tam, font: fonte });
      y -= LH;
    }
    y -= espacoDepois;
  };

  cabecalho();
  const titulo = 'TERMO DE ENTREVISTA';
  pg.drawText(titulo, { x: (595 - neg.widthOfTextAtSize(titulo, 14)) / 2, y, size: 14, font: neg });
  y -= 30;

  paragrafo(`Cliente: ${d.clienteNome}${d.clienteDocumento ? ` - CPF/CNPJ ${d.clienteDocumento}` : ''}`, neg);
  if (d.area) paragrafo(`Área: ${d.area}`);
  if (d.processoTitulo) paragrafo(`Assunto: ${d.processoTitulo}`);
  y -= 6;
  paragrafo('Declaro que prestei as informações abaixo ao escritório, para fins de análise e condução do meu caso:');

  const pares = paresDoQuestionario(d.questionario);
  if (pares.length === 0) paragrafo('(Nenhuma resposta registrada no questionário.)');
  pares.forEach((p, i) => {
    paragrafo(`${i + 1}. ${p.pergunta}`, neg, FS, 2);
    paragrafo(p.resposta, reg, FS, 8);
  });

  y -= 6;
  paragrafo('Declaro, sob as penas da lei, que as informações acima são verdadeiras e completas, e que fui orientado(a) sobre a importância de não omitir fatos relevantes. Estou ciente de que informações falsas ou omitidas podem prejudicar o resultado do caso e são de minha exclusiva responsabilidade.');
  const data = (d.data ?? new Date()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  paragrafo(`${d.cidade ?? 'Balneário Camboriú'}, ${data}.`, reg, FS, 40);
  novaPaginaSePreciso(40);
  pg.drawLine({ start: { x: M + 80, y }, end: { x: 595 - M - 80, y }, thickness: 0.5 });
  y -= 14;
  const nome = limpar(d.clienteNome);
  pg.drawText(nome, { x: (595 - reg.widthOfTextAtSize(nome, FS)) / 2, y, size: FS, font: reg });

  return Buffer.from(await pdf.save());
}
