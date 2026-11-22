/**
 * JURYSONE — Provedores de assinatura eletrônica
 *
 *   ZAPSIGN   → API REST da ZapSign (https://docs.zapsign.com.br). Os nomes de campos seguem a
 *               documentação pública; CONFIRMAR NO SANDBOX antes de ligar em produção.
 *   CERTISIGN → API do Portal de Assinaturas Certisign (a mesma plataforma do portal da OAB).
 *               Documentação: https://desenvolvedor.portaldeassinaturas.com.br (API Doc / Callback).
 *   SIMULADO  → só desenvolvimento e testes: não envia nada para fora; a "assinatura" é
 *               disparada pela rota de webhook simulada e carimba os PDFs.
 */
import { randomUUID } from 'crypto';

export interface DocParaAssinar { nome: string; pdf: Buffer }
export interface Signatario { nome: string; email?: string | null; telefone?: string | null; cpf?: string | null }
export interface EnvelopeCriado { externoId: string; signatarios: Array<Signatario & { url: string | null; links?: string[] }> }
export interface EventoWebhook {
  externoId: string;
  evento: 'ASSINADO' | 'RECUSADO' | 'OUTRO';
  /** Certisign: cada PDF é um documento lá; o aviso chega por documento */
  documentoExterno?: string;
}

export interface ProvedorAssinatura {
  readonly nome: 'ZAPSIGN' | 'CERTISIGN' | 'SIMULADO';
  criarEnvelope(titulo: string, docs: DocParaAssinar[], signatarios: Signatario[], externalId: string): Promise<EnvelopeCriado>;
  /** Devolve os PDFs assinados na mesma ordem dos originais */
  obterAssinados(externoId: string, originais: DocParaAssinar[]): Promise<DocParaAssinar[]>;
  interpretarWebhook(corpo: any): EventoWebhook | null;
}

// ── ZAPSIGN ──────────────────────────────────────────────────────────────────

export class AssinaturaZapSign implements ProvedorAssinatura {
  readonly nome = 'ZAPSIGN' as const;
  constructor(private readonly token: string, private readonly base = process.env.ZAPSIGN_API_URL || 'https://api.zapsign.com.br') {}

  private async chamar(metodo: string, caminho: string, corpo?: any) {
    const r = await fetch(`${this.base}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`ZapSign ${metodo} ${caminho} → ${r.status}: ${texto.slice(0, 300)}`);
    return texto ? JSON.parse(texto) : {};
  }

  private telefone(t?: string | null) {
    const d = String(t ?? '').replace(/\D/g, '');
    if (!d) return {};
    const semPais = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
    return { phone_country: '55', phone_number: semPais };
  }

  async criarEnvelope(titulo: string, docs: DocParaAssinar[], signatarios: Signatario[], externalId: string) {
    const [principal, ...extras] = docs;
    const criado = await this.chamar('POST', '/api/v1/docs/', {
      name: titulo,
      base64_pdf: principal.pdf.toString('base64'),
      external_id: externalId,
      lang: 'pt-br',
      signers: signatarios.map((s) => ({
        name: s.nome,
        email: s.email ?? '',
        ...this.telefone(s.telefone),
        auth_mode: 'assinaturaTela',
        // O link é enviado pelo escritório (WhatsApp); a ZapSign não dispara mensagens
        send_automatic_email: false,
        send_automatic_whatsapp: false,
      })),
    });
    for (const extra of extras) {
      await this.chamar('POST', `/api/v1/docs/${criado.token}/upload-extra-doc/`, { name: extra.nome, base64_pdf: extra.pdf.toString('base64') });
    }
    return {
      externoId: criado.token as string,
      signatarios: signatarios.map((s, i) => ({ ...s, url: criado.signers?.[i]?.sign_url ?? null })),
    };
  }

  async obterAssinados(externoId: string, originais: DocParaAssinar[]) {
    const det = await this.chamar('GET', `/api/v1/docs/${externoId}/`);
    const urls: (string | null)[] = [det.signed_file ?? null, ...((det.extra_docs ?? []) as any[]).map((d) => d.signed_file ?? null)];
    const saida: DocParaAssinar[] = [];
    for (let i = 0; i < originais.length; i++) {
      const url = urls[i];
      if (!url) throw new Error(`ZapSign ainda não disponibilizou o PDF assinado de "${originais[i].nome}".`);
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Falha ao baixar PDF assinado (${r.status}).`);
      saida.push({ nome: originais[i].nome, pdf: Buffer.from(await r.arrayBuffer()) });
    }
    return saida;
  }

  interpretarWebhook(corpo: any): EventoWebhook | null {
    const externoId = corpo?.token ?? corpo?.doc_token;
    if (!externoId) return null;
    const tipo = String(corpo?.event_type ?? '').toLowerCase();
    const evento = tipo === 'doc_signed' || corpo?.status === 'signed' ? 'ASSINADO' : tipo === 'doc_refused' ? 'RECUSADO' : 'OUTRO';
    return { externoId, evento };
  }
}

// ── CERTISIGN ────────────────────────────────────────────────────────────────

/**
 * Portal de Assinaturas Certisign (API v2).
 *   1. POST /document/upload  { fileName, bytes[] }            → { uploadId }
 *   2. POST /document/create  { document, electronicSigners… } → { id, signUrl }  (um por PDF)
 *   3. Callback POST (configurado no portal) { documentID, action: FLOW | SIGNATURE-NOK | … }
 *   4. GET  /document/package?key=… → PDF assinado (PAdES) em { bytes[], name, mimeType }
 * O token vai no cabeçalho CERTISIGN_TOKEN_HEADER (padrão "token"); sandbox e produção têm
 * tokens e URLs diferentes (CERTISIGN_API_URL). A Certisign exige o CPF de cada signatário.
 *
 * externoId guarda ",id:chave,id:chave," — um par por PDF, na ordem dos originais.
 */
export class AssinaturaCertisign implements ProvedorAssinatura {
  readonly nome = 'CERTISIGN' as const;
  constructor(
    private readonly token: string,
    private readonly base = (process.env.CERTISIGN_API_URL || 'https://api-sbx.portaldeassinaturas.com.br/api/v2').replace(/\/+$/, ''),
    private readonly cabecalho = process.env.CERTISIGN_TOKEN_HEADER || 'token',
  ) {}

  private async chamar(metodo: string, caminho: string, corpo?: any) {
    const r = await fetch(`${this.base}${caminho}`, {
      method: metodo,
      headers: { [this.cabecalho]: this.token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const texto = await r.text();
    if (!r.ok) throw new Error(`Certisign ${metodo} ${caminho.split('?')[0]} → ${r.status}: ${texto.slice(0, 300)}`);
    return texto ? JSON.parse(texto) : {};
  }

  /** Pares id:chave na ordem dos documentos */
  static pares(externoId: string): Array<{ id: string; chave: string }> {
    return String(externoId ?? '').split(',').filter(Boolean).map((p) => {
      const [id, chave] = p.split(':');
      return { id, chave: chave || id };
    });
  }

  async criarEnvelope(titulo: string, docs: DocParaAssinar[], signatarios: Signatario[], _externalId: string) {
    const semCpf = signatarios.find((s) => String(s.cpf ?? '').replace(/\D/g, '').length !== 11);
    if (semCpf) throw new Error(`A Certisign exige o CPF de cada signatário (falta ou é inválido o de ${semCpf.nome}).`);
    const semEmail = signatarios.find((s) => !s.email);
    if (semEmail) throw new Error(`A Certisign envia o link por e-mail: falta o e-mail de ${semEmail.nome}.`);

    const pares: Array<{ id: string; chave: string; url: string | null }> = [];
    for (const doc of docs) {
      const nomeArquivo = `${doc.nome}.pdf`.replace(/(\.pdf)+$/i, '.pdf');
      const up = await this.chamar('POST', '/document/upload', { fileName: nomeArquivo, bytes: Array.from(doc.pdf) });
      if (!up.uploadId) throw new Error('Certisign não devolveu o uploadId.');
      const criado = await this.chamar('POST', '/document/create', {
        typeId: 1,
        document: { name: `${titulo} - ${doc.nome}`.slice(0, 200), upload: { id: up.uploadId, name: nomeArquivo } },
        callback: true,
        electronicSigners: signatarios.map((s) => ({
          step: 1, title: 'Contratante', name: s.nome, email: s.email,
          individualIdentificationCode: String(s.cpf).replace(/\D/g, ''),
        })),
      });
      const url: string | null = criado.signUrl ?? null;
      const chave = (url && /[?&]chave=([^&]+)/i.exec(url)?.[1]) || String(criado.id);
      pares.push({ id: String(criado.id), chave, url });
    }
    return {
      externoId: `,${pares.map((p) => `${p.id}:${p.chave}`).join(',')},`,
      signatarios: signatarios.map((s) => ({ ...s, url: pares[0]?.url ?? null, links: pares.map((p) => p.url).filter((u): u is string => !!u) })),
    };
  }

  async obterAssinados(externoId: string, originais: DocParaAssinar[]) {
    const pares = AssinaturaCertisign.pares(externoId);
    const saida: DocParaAssinar[] = [];
    for (let i = 0; i < originais.length; i++) {
      const par = pares[i];
      if (!par) throw new Error(`Certisign: falta o documento correspondente a "${originais[i].nome}".`);
      const pkg = await this.chamar('GET', `/document/package?key=${encodeURIComponent(par.chave)}&includeOriginal=false&includeManifest=false&zipped=false`);
      const bytes: number[] | undefined = Array.isArray(pkg?.bytes) ? pkg.bytes : Array.isArray(pkg?.[0]?.bytes) ? pkg[0].bytes : undefined;
      if (!bytes?.length) throw new Error(`Certisign ainda não disponibilizou o PDF assinado de "${originais[i].nome}".`);
      const mime = String(pkg?.mimeType ?? pkg?.[0]?.mimeType ?? 'application/pdf');
      if (!/pdf/i.test(mime)) throw new Error(`Certisign devolveu "${mime}" em vez de PDF (o formato de assinatura precisa ser PAdES).`);
      saida.push({ nome: originais[i].nome, pdf: Buffer.from(bytes) });
    }
    return saida;
  }

  interpretarWebhook(corpo: any): EventoWebhook | null {
    const id = corpo?.documentID ?? corpo?.documentId ?? corpo?.DocumentID;
    if (id === undefined || id === null || id === '') return null;
    const acao = String(corpo?.action ?? '').toUpperCase();
    const evento = acao === 'FLOW' ? 'ASSINADO' : acao === 'SIGNATURE-NOK' ? 'RECUSADO' : 'OUTRO';
    return { externoId: String(id), documentoExterno: String(id), evento };
  }
}

// ── SIMULADO ─────────────────────────────────────────────────────────────────

export class AssinaturaSimulada implements ProvedorAssinatura {
  readonly nome = 'SIMULADO' as const;

  async criarEnvelope(_titulo: string, _docs: DocParaAssinar[], signatarios: Signatario[]) {
    const externoId = `sim_${randomUUID()}`;
    return { externoId, signatarios: signatarios.map((s) => ({ ...s, url: `https://assinatura.simulada.local/${externoId}` })) };
  }

  async obterAssinados(_externoId: string, originais: DocParaAssinar[]) {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const saida: DocParaAssinar[] = [];
    for (const o of originais) {
      const pdf = await PDFDocument.load(o.pdf);
      const fonte = await pdf.embedFont(StandardFonts.HelveticaBold);
      for (const pg of pdf.getPages()) {
        pg.drawText('ASSINADO ELETRONICAMENTE - SIMULACAO DE TESTE', { x: 40, y: 20, size: 8, font: fonte, color: rgb(0.7, 0.1, 0.1) });
      }
      saida.push({ nome: o.nome, pdf: Buffer.from(await pdf.save()) });
    }
    return saida;
  }

  interpretarWebhook(corpo: any): EventoWebhook | null {
    if (!corpo?.externoId) return null;
    return { externoId: corpo.externoId, evento: corpo.evento === 'RECUSADO' ? 'RECUSADO' : 'ASSINADO' };
  }
}

export function simuladoPermitido() {
  return process.env.NODE_ENV !== 'production' || process.env.ASSINATURA_PROVEDOR === 'SIMULADO';
}
