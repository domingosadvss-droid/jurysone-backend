/**
 * JURYSONE — Cliente da API oficial do WhatsApp (Cloud API / Graph API da Meta).
 * Só faz as chamadas HTTP; quem decide o que enviar e onde guardar são os serviços.
 */
import axios, { AxiosInstance } from 'axios';

const VERSAO = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';

export class ErroGraph extends Error {
  constructor(msg: string, readonly status?: number, readonly codigo?: number) {
    super(msg);
  }
}

export interface MidiaInfo { url: string; mime_type: string; file_size?: number; sha256?: string }

export class GraphWhatsapp {
  private readonly http: AxiosInstance;

  constructor(token: string) {
    this.http = axios.create({
      baseURL: `https://graph.facebook.com/${VERSAO}`,
      timeout: 30_000,
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private erro(e: any): never {
    const status = e?.response?.status;
    const meta = e?.response?.data?.error;
    throw new ErroGraph(meta?.message ? `Meta: ${meta.message}` : `Falha na API do WhatsApp${status ? ` (HTTP ${status})` : ''}: ${e?.message ?? e}`, status, meta?.code);
  }

  /** Envia texto livre (só dentro da janela de 24 h desde a última mensagem do contato) */
  async enviarTexto(phoneNumberId: string, para: string, texto: string): Promise<string> {
    try {
      const { data } = await this.http.post(`/${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'text', text: { body: texto, preview_url: false },
      });
      return data?.messages?.[0]?.id;
    } catch (e) { this.erro(e); }
  }

  async marcarLida(phoneNumberId: string, wamid: string): Promise<void> {
    try {
      await this.http.post(`/${phoneNumberId}/messages`, { messaging_product: 'whatsapp', status: 'read', message_id: wamid });
    } catch (e) { this.erro(e); }
  }

  /** Passo 1 da mídia: a Meta devolve uma URL temporária (válida por ~5 min) */
  async infoMidia(midiaId: string): Promise<MidiaInfo> {
    try {
      const { data } = await this.http.get(`/${midiaId}`);
      return data;
    } catch (e) { this.erro(e); }
  }

  /** Passo 2 da mídia: baixa o conteúdo (exige o mesmo token no cabeçalho) */
  async baixar(url: string): Promise<Buffer> {
    try {
      const { data } = await this.http.get(url, { baseURL: '', responseType: 'arraybuffer', timeout: 120_000, maxContentLength: 100 * 1024 * 1024 });
      return Buffer.from(data);
    } catch (e) { this.erro(e); }
  }

  /** Dados públicos do número (para mostrar na tela de conexão) */
  async numero(phoneNumberId: string): Promise<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }> {
    try {
      const { data } = await this.http.get(`/${phoneNumberId}`, { params: { fields: 'display_phone_number,verified_name,quality_rating' } });
      return data;
    } catch (e) { this.erro(e); }
  }
}
