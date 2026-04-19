/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — AI Copilot 2.0 (powered by Google Gemini — free tier)
 * ═══════════════════════════════════════════════════════════════
 */

import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ChavesService } from '../chaves/chaves.service';

interface RiskAnalysis {
  score: number;
  nivel: 'baixo' | 'medio' | 'alto' | 'critico';
  fatores: Array<{
    fator: string;
    impacto: 'positivo' | 'negativo';
    peso: number;
    descricao: string;
  }>;
  probabilidade_exito: number;
  recomendacoes: string[];
  proximas_acoes: Array<{
    acao: string;
    prioridade: 'urgente' | 'alta' | 'media' | 'baixa';
    prazo_sugerido?: string;
  }>;
  jurisprudencia_relevante: Array<{
    tribunal: string;
    numero: string;
    ementa: string;
    favoravel: boolean;
    relevancia: number;
  }>;
}

interface PeticaoGerada {
  tipo: string;
  conteudo: string;
  estrutura: Array<{ secao: string; conteudo: string }>;
  fundamentacao_legal: string[];
  pedidos: string[];
  estimated_tokens: number;
}

@Injectable()
export class AiCopilotService {

  private _model: GenerativeModel | null = null;
  private _modelKey: string | null = null; // chave usada para criar o modelo atual
  private readonly logger = new Logger(AiCopilotService.name);

  private readonly SYSTEM_PROMPT = `Você é o Copiloto Jurídico do Jurysone, assistente especializado em direito brasileiro.
Capacidades: direito civil, trabalhista, previdenciário, tributário, penal.
Diretrizes: seja preciso, cite fundamentos legais, use linguagem jurídica formal, cite jurisprudência com tribunal e número.
Contexto: direito brasileiro vigente, 2024/2025.`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly chavesService: ChavesService,
  ) {
    // Modelo inicializado lazily na primeira chamada para sempre usar a chave mais recente
    this.logger.log('AiCopilotService inicializado — modelo Gemini será carregado na primeira chamada.');
  }

  /** Retorna o modelo Gemini sempre atualizado com a chave mais recente do banco/env */
  private async getModel(officeId?: string): Promise<GenerativeModel> {
    const key = await this.getApiKey(officeId);

    // Recria o modelo somente se a chave mudou (evita criar objetos desnecessários)
    if (this._model && this._modelKey === key) return this._model;

    const genAI = new GoogleGenerativeAI(key);
    this._model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: this.SYSTEM_PROMPT,
    });
    this._modelKey = key;
    this.logger.log('Gemini Copiloto: modelo atualizado com nova chave.');
    return this._model;
  }

  /** Retorna a API key mais recente (env tem precedência sobre banco) */
  private async getApiKey(officeId?: string): Promise<string> {
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) return envKey;
    if (officeId) {
      const dbKey = await this.chavesService.getChave(officeId, 'gemini');
      if (dbKey) return dbKey;
    }
    throw new Error('Gemini não configurado. Acesse Configurações → Integrações e salve sua chave Gemini.');
  }

  // Helper para parsear JSON das respostas do Gemini (remove possíveis blocos markdown)
  private parseJson<T>(text: string): T {
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    return JSON.parse(clean) as T;
  }

  /* ──────────────────── CHAT CONTEXTUAL ─────────────────────── */

  async chat(params: {
    userId: string;
    officeId: string;
    mensagem: string;
    processo_id?: string;
    conversa_id?: string;
  }) {
    const { userId, officeId, mensagem, processo_id, conversa_id } = params;

    let contexto = '';
    if (processo_id) {
      contexto = await this.buildProcessoContext(processo_id);
    }

    // Monta histórico no formato do Gemini
    const historico = conversa_id
      ? await this.getHistoricoConversa(conversa_id, 10)
      : [];

    const geminiModel = await this.getModel(officeId);
    const chat = geminiModel.startChat({ history: historico });

    const promptFinal = contexto
      ? `${contexto}\n\nPERGUNTA: ${mensagem}`
      : mensagem;

    const result = await chat.sendMessage(promptFinal);
    const resposta = result.response.text();
    const usage = result.response.usageMetadata;
    const totalTokens = (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

    await this.salvarInteracao(userId, officeId, {
      conversa_id,
      processo_id,
      pergunta: mensagem,
      resposta,
      tokens_usados: totalTokens,
    });

    return {
      resposta,
      conversa_id: conversa_id || this.generateConversaId(),
      tokens: { total_tokens: totalTokens },
    };
  }

  /* ──────────────────── ANÁLISE DE RISCO ────────────────────── */

  async analisarRisco(processoId: string, officeId: string): Promise<RiskAnalysis> {
    const processo = await this.prisma.process.findFirst({
      where: { id: processoId, office: { id: officeId } },
      include: {
        client: true,
        movements: { orderBy: { date: 'desc' }, take: 20 },
        documents: true,
        tasks: { where: { status: 'pending' } },
      },
    });

    if (!processo) throw new Error('Processo não encontrado');

    const prompt = `Analise o risco processual. Responda APENAS com JSON válido, sem markdown nem explicações fora do JSON.

PROCESSO: ${processo.number} | ÁREA: ${processo.area || 'N/A'} | STATUS: ${processo.status}
TRIBUNAL: ${processo.court || 'N/A'} | VALOR: ${processo.value ? `R$ ${processo.value}` : 'N/A'}
CLIENTE: ${processo.client?.name}
MOVIMENTAÇÕES: ${processo.movements.slice(0, 10).map(m => `${m.date}: ${m.description}`).join(' | ')}
TAREFAS PENDENTES: ${processo.tasks.length}

JSON esperado:
{
  "score": 0,
  "nivel": "baixo|medio|alto|critico",
  "probabilidade_exito": 0,
  "fatores": [{ "fator": "", "impacto": "positivo|negativo", "peso": 1, "descricao": "" }],
  "recomendacoes": [],
  "proximas_acoes": [{ "acao": "", "prioridade": "urgente|alta|media|baixa", "prazo_sugerido": "" }],
  "jurisprudencia_relevante": [{ "tribunal": "", "numero": "", "ementa": "", "favoravel": true, "relevancia": 0 }]
}`;

    const geminiModel = await this.getModel(officeId);
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text();
    const parsed = this.parseJson<RiskAnalysis>(text);
    const totalTokens = (result.response.usageMetadata?.promptTokenCount || 0) +
                        (result.response.usageMetadata?.candidatesTokenCount || 0);

    await this.prisma.aiInteraction.create({
      data: {
        userId: '',
        officeId,
        type: 'risk_analysis',
        input: prompt,
        output: JSON.stringify(parsed),
        processId: processoId,
        tokens: totalTokens,
        model: 'gemini-1.5-flash',
      },
    });

    if (parsed.nivel === 'critico') {
      this.logger.warn(`Risco CRÍTICO detectado no processo ${processoId}`);
    }

    return parsed;
  }

  /* ──────────────────── GERAÇÃO DE PETIÇÕES ─────────────────── */

  async gerarPeticao(params: {
    processoId: string;
    officeId: string;
    userId: string;
    tipo: string;
    instrucoes_adicionais?: string;
    advogado_nome: string;
    oab: string;
  }): Promise<PeticaoGerada> {

    const contexto = await this.buildProcessoContext(params.processoId);

    const prompt = `Gere uma ${params.tipo} completa. Responda APENAS com JSON válido, sem markdown.

${contexto}
ADVOGADO: ${params.advogado_nome} | OAB: ${params.oab}
${params.instrucoes_adicionais ? `INSTRUÇÕES: ${params.instrucoes_adicionais}` : ''}

JSON esperado:
{
  "tipo": "",
  "conteudo": "texto completo da peça",
  "estrutura": [{ "secao": "", "conteudo": "" }],
  "fundamentacao_legal": [],
  "pedidos": []
}`;

    const geminiModel = await this.getModel(params.officeId);
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text();
    const parsed = this.parseJson<PeticaoGerada>(text);
    parsed.estimated_tokens = (result.response.usageMetadata?.promptTokenCount || 0) +
                               (result.response.usageMetadata?.candidatesTokenCount || 0);
    return parsed;
  }

  /* ──────────────────── ANÁLISE DE CONTRATO ─────────────────── */

  async analisarContrato(params: {
    officeId: string;
    userId: string;
    documento_texto: string;
    tipo_contrato: string;
  }) {
    const prompt = `Analise o contrato de ${params.tipo_contrato} sob o direito brasileiro.
Responda APENAS com JSON válido, sem markdown.

CONTRATO:
${params.documento_texto.substring(0, 12000)}

JSON esperado:
{
  "resumo": "",
  "clausulas_problematicas": [{ "clausula": "", "problema": "", "lei_violada": "", "risco": "alto|medio|baixo" }],
  "clausulas_favoraveis": [],
  "riscos_gerais": [],
  "pontos_negociacao": [],
  "conformidade_lgpd": { "ok": true, "problemas": [] },
  "score_seguranca": 0,
  "recomendacoes": []
}`;

    const geminiModel = await this.getModel(params.officeId);
    const result = await geminiModel.generateContent(prompt);
    return this.parseJson(result.response.text());
  }

  /* ──────────────────── PESQUISA JURISPRUDÊNCIA ──────────────── */

  async pesquisarJurisprudencia(params: {
    tese: string;
    tribunal?: string;
    area?: string;
    favoravel?: boolean;
  }) {
    const prompt = `Pesquise jurisprudência brasileira sobre: "${params.tese}"
${params.tribunal ? `Tribunal: ${params.tribunal}` : 'STF, STJ e tribunais superiores'}
${params.area ? `Área: ${params.area}` : ''}
Responda APENAS com JSON válido, sem markdown.

JSON esperado:
{
  "total_encontrado": 0,
  "jurisprudencia": [{ "tribunal": "", "numero": "", "relator": "", "data_julgamento": "", "ementa": "", "favoravel": true, "relevancia": 0, "trechos_relevantes": [] }],
  "tendencia": "favoravel|desfavoravel|divergente",
  "analise_sumaria": ""
}`;

    const geminiModel = await this.getModel();
    const result = await geminiModel.generateContent(prompt);
    return this.parseJson(result.response.text());
  }

  /* ──────────────────── RESUMO AUTOMÁTICO ───────────────────── */

  async resumirAndamentos(processoId: string, para: 'cliente' | 'advogado') {
    const processo = await this.prisma.process.findUnique({
      where: { id: processoId },
      include: { movements: { orderBy: { date: 'desc' }, take: 30 } },
    });

    if (!processo) throw new Error('Processo não encontrado');

    const tom = para === 'cliente'
      ? 'linguagem simples e acessível, sem jargões jurídicos'
      : 'linguagem jurídica técnica e objetiva';

    const prompt = `Resuma os andamentos em ${tom}. Responda APENAS com JSON válido, sem markdown.

PROCESSO: ${processo.number}
ANDAMENTOS: ${processo.movements.map(m => `${m.date}: ${m.description}`).join(' | ')}

JSON esperado:
{ "resumo_curto": "", "resumo_detalhado": "", "situacao_atual": "", "proximas_etapas": [], "pontos_atencao": [] }`;

    const geminiModel = await this.getModel();
    const result = await geminiModel.generateContent(prompt);
    return this.parseJson(result.response.text());
  }

  /* ──────────────────── HELPERS PRIVADOS ────────────────────── */

  private async buildProcessoContext(processoId: string): Promise<string> {
    const processo = await this.prisma.process.findUnique({
      where: { id: processoId },
      include: {
        client: true,
        movements: { orderBy: { date: 'desc' }, take: 15 },
        tasks: { where: { status: 'pending' }, take: 10 },
      },
    });

    if (!processo) return '';

    return `CONTEXTO DO PROCESSO:
Número: ${processo.number} | Área: ${processo.area || 'N/A'} | Status: ${processo.status}
Tribunal: ${processo.court || 'N/A'} | Fase: ${processo.phase || 'N/A'}
Valor: ${processo.value ? `R$ ${processo.value}` : 'N/A'} | Cliente: ${processo.client?.name || 'N/A'}
Movimentações: ${processo.movements.map(m => `${m.date}: ${m.description}`).join(' | ')}
Tarefas pendentes: ${processo.tasks.map(t => t.title).join(', ') || 'Nenhuma'}`;
  }

  private async getHistoricoConversa(conversaId: string, limit: number) {
    const interacoes = await this.prisma.aiInteraction.findMany({
      where: { sessionId: conversaId },
      orderBy: { createdAt: 'asc' },
      take: limit * 2,
    });

    // Formato do Gemini: { role: 'user'|'model', parts: [{ text }] }
    return interacoes.flatMap(i => [
      { role: 'user' as const, parts: [{ text: i.input }] },
      { role: 'model' as const, parts: [{ text: i.output }] },
    ]);
  }

  private async salvarInteracao(userId: string, officeId: string, data: any) {
    return this.prisma.aiInteraction.create({
      data: {
        userId,
        officeId,
        type: 'chat',
        input: data.pergunta,
        output: data.resposta,
        processId: data.processo_id,
        sessionId: data.conversa_id,
        tokens: data.tokens_usados,
        model: 'gemini-1.5-flash',
      },
    });
  }

  private generateConversaId(): string {
    return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /* ──────────────── ASSISTENTE DE SUPORTE ────────────────────── */

  async suporteChat(params: {
    userId: string;
    officeId: string;
    mensagem: string;
    arquivos?: Array<{ nome: string; mimeType: string; base64: string }>;
  }): Promise<{ resposta: string; dados_extraidos?: Record<string, any> }> {
    const { mensagem, arquivos } = params;

    const supportSystemPrompt = `Você é o Juri, assistente de suporte do Jurysone — sistema de gestão para escritórios de advocacia brasileiro.

FUNÇÕES:
1. SUPORTE AO SISTEMA: Responda dúvidas sobre como usar o Jurysone (dashboard, atendimentos, processos, financeiro, agenda, documentos, clientes, configurações).
2. EXTRAÇÃO DE DADOS: Quando o usuário enviar conversa de WhatsApp, documento ou imagem com dados de um cliente, extraia as informações e retorne JSON estruturado.

QUANDO DETECTAR DADOS DE CLIENTE (conversa de WhatsApp, documento, imagem com dados pessoais):
Retorne APENAS este JSON válido, sem markdown nem texto fora do JSON:
{
  "resposta": "Extraí os seguintes dados do cliente. Revise e clique em 'Preencher Formulário' para usar.",
  "dados_extraidos": {
    "nome": "Nome completo ou vazio",
    "cpf": "000.000.000-00 ou vazio",
    "rg": "RG ou vazio",
    "dataNasc": "YYYY-MM-DD ou vazio",
    "telefone": "(00) 00000-0000 ou vazio",
    "email": "email ou vazio",
    "cep": "00000-000 ou vazio",
    "rua": "logradouro ou vazio",
    "numero": "número ou vazio",
    "bairro": "bairro ou vazio",
    "cidade": "cidade ou vazio",
    "estado": "UF com 2 letras ou vazio",
    "area": "trabalhista|familia|previdenciario|tributario|empresarial|criminal|civil ou vazio",
    "mensagem": "Resumo do problema ou caso descrito pelo cliente ou vazio"
  }
}

QUANDO FOR SUPORTE NORMAL (dúvidas sobre o sistema):
Responda em texto claro e objetivo. Use **negrito** para destacar termos importantes.

Sobre o Jurysone:
- **Dashboard**: visão geral com KPIs, gráficos, atendimentos e processos recentes
- **Novo Atendimento**: cadastrar novo cliente e caso jurídico com dados completos
- **Processos**: gerenciar processos judiciais, movimentações, documentos e prazos
- **Agenda**: compromissos, audiências, integração com Google Calendar
- **Financeiro**: honorários, parcelas, lançamentos, relatórios DRE
- **Documentos**: upload, contratos, petições, modelos, assinatura eletrônica
- **Clientes**: CRM completo com histórico de casos
- **WhatsApp**: enviar mensagens e notificações automáticas
- **IA Copiloto**: análise de risco, geração de petições, pesquisa de jurisprudência`;

    const apiKey = await this.getApiKey(params.officeId);
    const genAI = new GoogleGenerativeAI(apiKey);
    const supportModel = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: supportSystemPrompt,
    });

    type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
    const parts: Part[] = [];
    if (arquivos && arquivos.length > 0) {
      for (const arq of arquivos) {
        parts.push({ inlineData: { mimeType: arq.mimeType, data: arq.base64 } });
      }
    }
    parts.push({ text: mensagem || 'Analise o arquivo enviado e extraia os dados do cliente.' });

    const result = await supportModel.generateContent({ contents: [{ role: 'user', parts }] });
    const text = result.response.text();

    try {
      const parsed = this.parseJson<{ resposta: string; dados_extraidos?: Record<string, any> }>(text);
      if (parsed && typeof parsed.resposta === 'string') {
        return parsed;
      }
    } catch {
      // Not JSON — return as plain text response
    }

    return { resposta: text };
  }
}
