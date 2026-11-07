/**
 * JURYSONE — Provedores de assinatura eletrônica
 *
 *   ZAPSIGN  → API REST da ZapSign (https://docs.zapsign.com.br). Os nomes de campos seguem a
 *              documentação pública; CONFIRMAR NO SANDBOX antes de ligar em produção.
 *   SIMULADO → só desenvolvimento e testes: não envia nada para fora; a "assinatura" é
 *              disparada pela rota de webhook simulada e carimba os PDFs.
 */
import { randomUUID } from 'crypto';

export interface DocParaAssinar { nome: string; pdf: Buffer }
export interface Signatario { nome: string; email?: string | null; telefone?: string | null }
export interface EnvelopeCriado { externoId: string; signatarios: Array<Signatario & { url: string | null }> }
export interface EventoWebhook { externoId: string; evento: 'ASSINADO' | 'RECUSADO' | 'OUTRO' }

export interface ProvedorAssinatura {
  readonly nome: 'ZAPSIGN' | 'SIMULADO';
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
