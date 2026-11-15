/**
 * JURYSONE — Jurisprudência Service
 * Pesquisa real de jurisprudência via DataJud CNJ + IA Gemini
 * Permite salvar ementas por processo (workspace jurídico)
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import axios, { AxiosInstance } from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';

const TRIBUNAL_INDEX: Record<string, string> = {
  STF: 'api_publica-stf',
  STJ: 'api_publica-stj',
  TST: 'api_publica-tst',
  TRF1: 'api_publica-trf1',
  TRF2: 'api_publica-trf2',
  TRF3: 'api_publica-trf3',
  TRF4: 'api_publica-trf4',
  TRF5: 'api_publica-trf5',
  TJSP: 'api_publica-tjsp',
  TJRJ: 'api_publica-tjrj',
  TJMG: 'api_publica-tjmg',
  TJPR: 'api_publica-tjpr',
  TJSC: 'api_publica-tjsc',
  TJRS: 'api_publica-tjrs',
};

@Injectable()
export class JurisprudenciaService {
  private readonly logger = new Logger(JurisprudenciaService.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const baseUrl = this.config.get<string>('DATAJUD_BASE_URL', 'https://api-publica.datajud.cnj.jus.br');
    const apiKey  = this.config.get<string>('DATAJUD_API_KEY', 'cDZHYzlZa0JadVREZDJCendFbXNBR3A1');

    this.http = axios.create({
      baseURL: baseUrl,
      headers: { 'Authorization': `ApiKey ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30_000,
    });
  }

  // ── Pesquisa real via DataJud (texto livre) ─────────────────────────────────

  async pesquisar(params: {
    tese: string;
    tribunal?: string;
    area?: string;
    dataInicio?: string;
    dataFim?: string;
    pagina?: number;
    officeId: string;
  }) {
    const { tese, tribunal, area, dataInicio, dataFim, pagina = 1 } = params;
    const from = (pagina - 1) * 10;

    // Define tribunais-alvo: superiores por padrão para jurisprudência relevante
    const tribunais = tribunal
      ? [tribunal.toUpperCase()]
      : area === 'trabalhista'
        ? ['TST', 'TRT4', 'TRT15']
        : ['STJ', 'STF', 'TRF4', 'TJSP'];

    const resultados: any[] = [];

    for (const trib of tribunais.slice(0, 4)) {
      const indice = TRIBUNAL_INDEX[trib];
      if (!indice) continue;

      try {
        const query: any = {
          bool: {
            should: [
              { match: { 'assuntos.nome': { query: tese, operator: 'or' } } },
              { match_phrase: { 'assuntos.nome': tese } },
            ],
            minimum_should_match: 1,
          },
        };

        if (dataInicio || dataFim) {
          query.bool.filter = [{
            range: {
              dataHoraUltimaAtualizacao: {
                ...(dataInicio ? { gte: dataInicio } : {}),
                ...(dataFim   ? { lte: dataFim }    : {}),
              },
            },
          }];
        }

        const { data } = await this.http.post(`/${indice}/_search`, {
          from,
          size: 5,
          query,
          sort: [{ dataHoraUltimaAtualizacao: { order: 'desc' } }],
        });

        const hits = (data?.hits?.hits ?? []).map((h: any) => ({
          tribunal: trib,
          numero:   h._source.numeroProcesso,
          classe:   h._source.classe?.nome,
          assuntos: (h._source.assuntos ?? []).map((a: any) => a.nome),
          dataAjuizamento: h._source.dataAjuizamento,
          ultimaAtualizacao: h._source.dataHoraUltimaAtualizacao,
          grau: h._source.grau,
        }));

        resultados.push(...hits);
      } catch (err: any) {
        this.logger.warn(`Jurisprudência [${trib}]: ${err.message}`);
      }
    }

    // Enriquece com IA quando há resultados reais
    let analiseIA: any = null;
    if (resultados.length > 0) {
      analiseIA = await this.analisarComIA(tese, resultados, area);
    } else {
      // Fallback: apenas IA se DataJud não retornou nada
      analiseIA = await this.pesquisarSomenteIA(tese, tribunal, area);
    }

    return {
      tese,
      tribunal: tribunal ?? 'múltiplos',
      area,
      resultadosDataJud: resultados,
      analiseIA,
      total: resultados.length,
    };
  }

  // ── Análise por IA dos resultados DataJud ────────────────────────────────────

  private async analisarComIA(tese: string, resultados: any[], area?: string): Promise<any> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const resumo = resultados.slice(0, 5).map((r) =>
        `Tribunal: ${r.tribunal} | Número: ${r.numero} | Assuntos: ${r.assuntos?.join(', ')}`
      ).join('\n');

      const prompt = `Analise esses processos do DataJud sobre a tese "${tese}"${area ? ` na área ${area}` : ''}.
Responda APENAS com JSON válido, sem markdown:
${resumo}

JSON esperado:
{
  "tendencia": "favoravel|desfavoravel|divergente",
  "analise_sumaria": "",
  "pontos_relevantes": [],
  "recomendacao": ""
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  private async pesquisarSomenteIA(tese: string, tribunal?: string, area?: string): Promise<any> {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;

    try {
      const genAI = new GoogleGenerativeAI(key);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = `Pesquise jurisprudência brasileira sobre: "${tese}"
${tribunal ? `Tribunal: ${tribunal}` : 'Foco: STJ, STF e tribunais superiores'}
${area ? `Área: ${area}` : ''}
Responda APENAS com JSON válido, sem markdown.

JSON esperado:
{
  "total_encontrado": 0,
  "jurisprudencia": [{ "tribunal": "", "numero": "", "relator": "", "data_julgamento": "", "ementa": "", "favoravel": true, "relevancia": 0 }],
  "tendencia": "favoravel|desfavoravel|divergente",
  "analise_sumaria": ""
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  // ── Ementas Salvas (workspace por processo) ──────────────────────────────────

  async salvarEmenta(params: {
    officeId: string;
    processoId?: string;
    userId: string;
    tribunal: string;
    numero: string;
    relator?: string;
    dataJulgamento?: string;
    ementa: string;
    favoravel?: boolean;
    relevancia?: number;
    tese?: string;
  }) {
    return this.prisma.ementaSalva.create({
      data: {
        escritorioId:  params.officeId,
        processoId:    params.processoId ?? null,
        salvoById:     params.userId,
        tribunal:      params.tribunal,
        numero:        params.numero,
        relator:       params.relator ?? null,
        dataJulgamento: params.dataJulgamento ? new Date(params.dataJulgamento) : null,
        ementa:        params.ementa,
        favoravel:     params.favoravel ?? null,
        relevancia:    params.relevancia ?? 0,
        tese:          params.tese ?? null,
      },
    });
  }

  async listarEmentas(params: {
    officeId: string;
    processoId?: string;
    favoravel?: boolean;
  }) {
    const where: any = { escritorioId: params.officeId };
    if (params.processoId !== undefined) where.processoId = params.processoId;
    if (params.favoravel  !== undefined) where.favoravel  = params.favoravel;

    return this.prisma.ementaSalva.findMany({
      where,
      orderBy: [{ relevancia: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async removerEmenta(id: string, officeId: string) {
    const ementa = await this.prisma.ementaSalva.findFirst({ where: { id, escritorioId: officeId } });
    if (!ementa) throw new NotFoundException(`Ementa ${id} não encontrada`);
    await this.prisma.ementaSalva.delete({ where: { id } });
    return { message: 'Ementa removida' };
  }

  // ── Workspace de caso (Feature 4) ────────────────────────────────────────────

  async getWorkspace(processoId: string, officeId: string) {
    const [processo, historiaIA, ementas] = await Promise.all([
      this.prisma.processo.findFirst({
        where: { id: processoId, escritorioId: officeId },
        include: {
          cliente: { select: { id: true, nome: true } },
          movimentacoes: { orderBy: { data: 'desc' }, take: 5 },
        },
      }),
      this.prisma.interacaoIA.findMany({
        where: { processoId, escritorioId: officeId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true, tipo: true, input: true, output: true,
          sessaoId: true, tokens: true, modelo: true, createdAt: true,
        },
      }),
      this.prisma.ementaSalva.findMany({
        where: { processoId, escritorioId: officeId },
        orderBy: [{ relevancia: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    if (!processo) throw new NotFoundException(`Processo ${processoId} não encontrado`);

    // Agrupa histórico de IA por sessão/tipo
    const chats = historiaIA.filter((i) => i.tipo === 'chat');
    const analises = historiaIA.filter((i) => i.tipo === 'risk_analysis');
    const peticoes = historiaIA.filter((i) => i.tipo !== 'chat' && i.tipo !== 'risk_analysis');

    return {
      processo: {
        id: processo.id,
        numero: processo.numero,
        area: processo.area,
        status: processo.status,
        cliente: processo.cliente,
        ultimasMovimentacoes: processo.movimentacoes,
      },
      workspace: {
        chats,
        analises,
        peticoes,
        ementas,
        totais: {
          chats: chats.length,
          analises: analises.length,
          peticoes: peticoes.length,
          ementas: ementas.length,
        },
      },
    };
  }
}
