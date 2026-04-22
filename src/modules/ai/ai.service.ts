import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { PrismaService } from '../../database/prisma.service';
import { ChavesService } from '../chaves/chaves.service';

const GEMINI_MODEL = 'gemini-2.5-flash';

@Injectable()
export class AiService {
  private _client: GoogleGenAI | null = null;
  private readonly logger = new Logger(AiService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private chavesService: ChavesService,
  ) {
    const key = this.config.get<string>('GEMINI_API_KEY');
    if (key) {
      this._client = new GoogleGenAI({ apiKey: key });
      this.logger.log(`Gemini ${GEMINI_MODEL} inicializado via variável de ambiente.`);
    } else {
      this.logger.warn('GEMINI_API_KEY não configurada no ambiente — tentará carregar do banco de dados na primeira chamada.');
    }
  }

  /** Retorna o cliente Gemini, inicializando com chave do banco se necessário */
  private async getClient(officeId?: string): Promise<GoogleGenAI> {
    if (this._client) return this._client;

    if (officeId) {
      const key = await this.chavesService.getChave(officeId, 'gemini');
      if (key) {
        this._client = new GoogleGenAI({ apiKey: key });
        this.logger.log(`Gemini ${GEMINI_MODEL} inicializado via chave do banco de dados.`);
        return this._client;
      }
    }

    throw new Error('GEMINI_API_KEY não configurada. Acesse Configurações → Integrações e salve sua chave Gemini.');
  }

  // ─── Analisar processo ────────────────────────────────────────────────────
  async analyzeProcess(processId: string, question: string, officeId: string) {
    const process = await this.prisma.process.findFirst({
      where: { id: processId, officeId },
      include: {
        client:    { select: { name: true } },
        movements: { orderBy: { date: 'desc' }, take: 20 },
      },
    });

    if (!process) throw new Error('Processo não encontrado.');

    const movimentsText = process.movements
      .map((m) => `[${m.date.toISOString().split('T')[0]}] ${m.description}`)
      .join('\n');

    const prompt = `Você é um assistente jurídico especializado em direito brasileiro.
Analise o processo e responda com precisão. Seja objetivo e profissional.

PROCESSO: ${process.number}
CLIENTE: ${process.client.name}
STATUS: ${process.status}

ANDAMENTOS RECENTES:
${movimentsText || 'Nenhum andamento registrado.'}

PERGUNTA: ${question}`;

    const ai     = await this.getClient(officeId);
    const result = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    const answer      = result.text ?? '';
    const totalTokens = result.usageMetadata?.totalTokenCount ?? 0;

    await this.prisma.aiInteraction.create({
      data: {
        officeId,
        processId,
        question,
        answer,
        model:      GEMINI_MODEL,
        tokensUsed: totalTokens,
      },
    });

    return { answer, tokensUsed: totalTokens };
  }

  // ─── Geração de Petição ────────────────────────────────────────────────────
  async generatePetition(type: string, processData: Record<string, any>, officeId: string) {
    const prompt = `Você é um advogado especialista em redação de peças processuais brasileiras.
Gere uma petição jurídica do tipo: ${type}.

Dados do processo:
${JSON.stringify(processData, null, 2)}

Inclua: qualificação das partes, fundamentos de direito, pedidos claros.
Seções: I - DOS FATOS, II - DO DIREITO, III - DOS PEDIDOS`;

    const ai     = await this.getClient(officeId);
    const result = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    return result.text ?? '';
  }

  // ─── Análise de Risco ──────────────────────────────────────────────────────
  async analyzeRisk(processId: string, officeId: string) {
    const process = await this.prisma.process.findFirst({
      where:   { id: processId, officeId },
      include: { movements: { orderBy: { date: 'desc' }, take: 30 } },
    });

    const prompt = `Analise o risco jurídico do processo abaixo. Responda APENAS com JSON válido, sem markdown.

Processo ${process.number}
Movimentações: ${process.movements.map((m) => m.description).join(' | ')}

JSON esperado: { "riskLevel": "ALTO|MEDIO|BAIXO", "score": 0-100, "mainRisks": ["string"], "recommendations": ["string"] }`;

    const ai     = await this.getClient(officeId);
    const result = await ai.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    const text   = (result.text ?? '').replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  }

  // ─── Embeddings ───────────────────────────────────────────────────────────
  async generateEmbedding(_text: string): Promise<number[]> {
    this.logger.warn('generateEmbedding: configure um modelo de embeddings dedicado para busca semântica.');
    return [];
  }
}
