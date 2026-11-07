/**
 * JURYSONE — Provedores de armazenamento de arquivos do caso
 *
 *   GOOGLE_DRIVE → Drive do escritório (Google Workspace), via OAuth do próprio escritório
 *   LOCAL        → pasta no servidor; só para desenvolvimento e testes
 */
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export interface ArquivoSalvo { id: string; link: string | null }

export interface ProvedorArmazenamento {
  readonly nome: 'GOOGLE_DRIVE' | 'LOCAL';
  criarPasta(nome: string, paiId?: string | null): Promise<string>;
  enviarArquivo(pastaId: string, nome: string, mimeType: string, conteudo: Buffer): Promise<ArquivoSalvo>;
  baixarArquivo(id: string): Promise<Buffer>;
}

/** Nome seguro para pasta/arquivo (sem barras nem caracteres de controle) */
export function nomeSeguro(nome: string, max = 120): string {
  return String(nome ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'sem-nome';
}

// ── LOCAL ────────────────────────────────────────────────────────────────────

export class ArmazenamentoLocal implements ProvedorArmazenamento {
  readonly nome = 'LOCAL' as const;
  constructor(private readonly raiz: string) {
    fs.mkdirSync(raiz, { recursive: true });
  }

  private resolver(id: string) {
    const destino = path.resolve(this.raiz, id);
    if (!destino.startsWith(path.resolve(this.raiz))) throw new Error('Caminho inválido.');
    return destino;
  }

  async criarPasta(nome: string, paiId?: string | null) {
    const rel = path.join(paiId ?? '', nomeSeguro(nome));
    fs.mkdirSync(this.resolver(rel), { recursive: true });
    return rel;
  }

  async enviarArquivo(pastaId: string, nome: string, _mime: string, conteudo: Buffer) {
    const base = nomeSeguro(nome, 160);
    let rel = path.join(pastaId, base);
    let n = 1;
    while (fs.existsSync(this.resolver(rel))) {
      const ext = path.extname(base);
      rel = path.join(pastaId, `${path.basename(base, ext)} (${++n})${ext}`);
    }
    fs.writeFileSync(this.resolver(rel), conteudo);
    return { id: rel, link: null };
  }

  async baixarArquivo(id: string) {
    return fs.readFileSync(this.resolver(id));
  }
}

// ── GOOGLE DRIVE ─────────────────────────────────────────────────────────────

export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive.file';

export function clienteOAuthGoogle() {
  // googleapis é carregado sob demanda para não pesar o boot
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { google } = require('googleapis');
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_DRIVE_REDIRECT_URI,
  );
}

export class ArmazenamentoGoogleDrive implements ProvedorArmazenamento {
  readonly nome = 'GOOGLE_DRIVE' as const;
  private readonly drive: any;

  constructor(refreshToken: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { google } = require('googleapis');
    const auth = clienteOAuthGoogle();
    auth.setCredentials({ refresh_token: refreshToken });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async criarPasta(nome: string, paiId?: string | null) {
    const r = await this.drive.files.create({
      requestBody: { name: nomeSeguro(nome), mimeType: 'application/vnd.google-apps.folder', parents: paiId ? [paiId] : undefined },
      fields: 'id',
      supportsAllDrives: true,
    });
    return r.data.id as string;
  }

  async enviarArquivo(pastaId: string, nome: string, mimeType: string, conteudo: Buffer) {
    const r = await this.drive.files.create({
      requestBody: { name: nomeSeguro(nome, 160), parents: [pastaId] },
      media: { mimeType, body: Readable.from(conteudo) },
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });
    return { id: r.data.id as string, link: (r.data.webViewLink as string) ?? null };
  }

  async baixarArquivo(id: string) {
    const r = await this.drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    return Buffer.from(r.data as ArrayBuffer);
  }
}
