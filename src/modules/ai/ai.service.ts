import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiService {
  private _model: GenerativeModel | null = null;
  private readonly logger = new Logger(AiService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const key = this.config.get<string>('GEMINI_API_KEY');
    if (key) {
      const genAI = new GoogleGenerativeAI(key);
      this._model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } else {
      this.logger.warn('GEMINI_API_KEY não configurada — funcionalidades de IA estarão indisponíveis.');
    }
  }

  private get model(): GenerativeModel {
    if (!this._model) {
      throw new Error('GEMINI_API_KEY não configurada. Configure a variável de ambiente no Railway Dashboard.');
    }
    return this._model;
  }

  // ─── Analisar processo ────────────────────────────────────────────────────
  async analyzeProcess(processId: string, question: string, officeId: string) {
    const process = await this.prisma.process.findFirst({
      where: { id: processId, officeId },
      include: {
        client: { select: { name: true } },
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

    const result = await this.model.generateContent(prompt);
    const answer = result.response.text();
    const usage = result.response.usageMetadata;
    const totalTokens = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

    await this.prisma.aiInteraction.create({
      data: {
        officeId,
        processId,
        question,
        answer,
        model: 'gemini-1.5-flash',
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

    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }

  // ─── Análise de Risco ──────────────────────────────────────────────────────
  async analyzeRisk(processId: string, officeId: string) {
    const process = await this.prisma.process.findFirst({
      where: { id: processId, officeId },
      include: { movements: { orderBy: { date: 'desc' }, take: 30 } },
    });

    const prompt = `Analise o risco jurídico do processo abaixo. Responda APENAS com JSON válido, sem markdown.

Processo ${process.number}
Movimentações: ${process.movements.map((m) => m.description).join(' | ')}

JSON esperado: { "riskLevel": "ALTO|MEDIO|BAIXO", "score": 0-100, "mainRisks": ["string"], "recommendations": ["string"] }`;

    const result = await this.model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    return JSON.parse(text);
  }

  // ─── Embeddings (não suportado nativamente pelo Gemini free tier) ──────────
  async generateEmbedding(_text: string): Promise<number[]> {
    this.logger.warn('generateEmbedding: configure um modelo de embeddings dedicado para busca semântica.');
    return [];
  }
}
