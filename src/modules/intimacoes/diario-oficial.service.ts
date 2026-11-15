/**
 * JURYSONE — DiarioOficialService
 * ══════════════════════════════════════════════════════════════════════════
 * Integração com Diários da Justiça Eletrônicos (DJe) reais dos tribunais
 *
 * Tribunais suportados:
 *   TJSP  → esaj.tjsp.jus.br/cdje/
 *   TJRJ  → djrj.jusbrasil.com.br / tjrj.jus.br
 *   TJMG  → jurisprudencia.tjmg.jus.br
 *   TRF1  → portal.trf1.jus.br
 *   TRF3  → web.trf3.jus.br
 *   STJ   → scon.stj.jus.br
 *   STF   → portal.stf.jus.br
 *   CNJ   → api-publica.datajud.cnj.jus.br (DataJud REST API — PÚBLICA/GRATUITA)
 *
 * Estratégia por tribunal:
 *   1. Se tem API REST pública → usa diretamente
 *   2. Se tem portal HTML → scraping via axios + cheerio
 *   3. Se tem PDF → download + extração de texto
 * ══════════════════════════════════════════════════════════════════════════
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios, { AxiosInstance } from 'axios';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ResultadoBusca {
  tribunal:        string;
  dataPublicacao:  string;           // ISO date
  edicao:          string;
  titulo:          string;
  conteudo:        string;
  caderno:         string;
  pagina:          string;
  urlOrigem:       string;
  nomesEncontrados: string[];
  numeroProcesso:  string | null;
  prazoIdentificado: number | null;  // dias
}

export interface ConfigBusca {
  tribunais:    string[];
  termosBusca:  string[];   // nomes, OAB, CPF, etc.
  dataInicio?:  Date;
  dataFim?:     Date;
}

// ─── Nomes completos dos tribunais ───────────────────────────────────────────

const TRIBUNAL_NOME: Record<string, string> = {
  STF:   'Supremo Tribunal Federal',
  STJ:   'Superior Tribunal de Justiça',
  TST:   'Tribunal Superior do Trabalho',
  TSE:   'Tribunal Superior Eleitoral',
  STM:   'Superior Tribunal Militar',
  TRF1:  'Tribunal Regional Federal da 1ª Região',
  TRF2:  'Tribunal Regional Federal da 2ª Região',
  TRF3:  'Tribunal Regional Federal da 3ª Região',
  TRF4:  'Tribunal Regional Federal da 4ª Região',
  TRF5:  'Tribunal Regional Federal da 5ª Região',
  TRF6:  'Tribunal Regional Federal da 6ª Região',
  TJSP:  'Tribunal de Justiça de São Paulo',
  TJRJ:  'Tribunal de Justiça do Rio de Janeiro',
  TJMG:  'Tribunal de Justiça de Minas Gerais',
  TJRS:  'Tribunal de Justiça do Rio Grande do Sul',
  TJPR:  'Tribunal de Justiça do Paraná',
  TJSC:  'Tribunal de Justiça de Santa Catarina',
  TJBA:  'Tribunal de Justiça da Bahia',
  TJGO:  'Tribunal de Justiça de Goiás',
  TJPE:  'Tribunal de Justiça de Pernambuco',
  TJCE:  'Tribunal de Justiça do Ceará',
  TJMT:  'Tribunal de Justiça do Mato Grosso',
  TJMS:  'Tribunal de Justiça do Mato Grosso do Sul',
  TJMA:  'Tribunal de Justiça do Maranhão',
  TJPA:  'Tribunal de Justiça do Pará',
  TJAM:  'Tribunal de Justiça do Amazonas',
  TJRN:  'Tribunal de Justiça do Rio Grande do Norte',
  TJPB:  'Tribunal de Justiça da Paraíba',
  TJAL:  'Tribunal de Justiça de Alagoas',
  TJSE:  'Tribunal de Justiça de Sergipe',
  TJPI:  'Tribunal de Justiça do Piauí',
  TJTO:  'Tribunal de Justiça do Tocantins',
  TJRO:  'Tribunal de Justiça de Rondônia',
  TJAC:  'Tribunal de Justiça do Acre',
  TJAP:  'Tribunal de Justiça do Amapá',
  TJRR:  'Tribunal de Justiça de Roraima',
  TJDF:  'Tribunal de Justiça do Distrito Federal e Territórios',
  TRT1:  'Tribunal Regional do Trabalho da 1ª Região (RJ)',
  TRT2:  'Tribunal Regional do Trabalho da 2ª Região (SP)',
  TRT3:  'Tribunal Regional do Trabalho da 3ª Região (MG)',
  TRT4:  'Tribunal Regional do Trabalho da 4ª Região (RS)',
  TRT5:  'Tribunal Regional do Trabalho da 5ª Região (BA)',
  TRT6:  'Tribunal Regional do Trabalho da 6ª Região (PE)',
  TRT7:  'Tribunal Regional do Trabalho da 7ª Região (CE)',
  TRT8:  'Tribunal Regional do Trabalho da 8ª Região (PA/AP)',
  TRT9:  'Tribunal Regional do Trabalho da 9ª Região (PR)',
  TRT10: 'Tribunal Regional do Trabalho da 10ª Região (DF/TO)',
  TRT12: 'Tribunal Regional do Trabalho da 12ª Região (SC)',
  TRT15: 'Tribunal Regional do Trabalho da 15ª Região (Campinas)',
  TRT24: 'Tribunal Regional do Trabalho da 24ª Região (MS)',
};

// Mapeamento tribunal → índice DataJud (underscore, conforme wiki oficial CNJ)
// Fonte: https://datajud-wiki.cnj.jus.br/api-publica/endpoints/
const DATAJUD_INDEX: Record<string, string> = {
  // Tribunais Superiores
  STJ:    'api_publica_stj',
  TST:    'api_publica_tst',
  TSE:    'api_publica_tse',
  STM:    'api_publica_stm',
  // Justiça Federal
  TRF1:   'api_publica_trf1',
  TRF2:   'api_publica_trf2',
  TRF3:   'api_publica_trf3',
  TRF4:   'api_publica_trf4',
  TRF5:   'api_publica_trf5',
  TRF6:   'api_publica_trf6',
  // Justiça Estadual
  TJAC:   'api_publica_tjac',
  TJAL:   'api_publica_tjal',
  TJAM:   'api_publica_tjam',
  TJAP:   'api_publica_tjap',
  TJBA:   'api_publica_tjba',
  TJCE:   'api_publica_tjce',
  TJDF:   'api_publica_tjdft',
  TJES:   'api_publica_tjes',
  TJGO:   'api_publica_tjgo',
  TJMA:   'api_publica_tjma',
  TJMG:   'api_publica_tjmg',
  TJMS:   'api_publica_tjms',
  TJMT:   'api_publica_tjmt',
  TJPA:   'api_publica_tjpa',
  TJPB:   'api_publica_tjpb',
  TJPE:   'api_publica_tjpe',
  TJPI:   'api_publica_tjpi',
  TJPR:   'api_publica_tjpr',
  TJRJ:   'api_publica_tjrj',
  TJRN:   'api_publica_tjrn',
  TJRO:   'api_publica_tjro',
  TJRR:   'api_publica_tjrr',
  TJRS:   'api_publica_tjrs',
  TJSC:   'api_publica_tjsc',
  TJSE:   'api_publica_tjse',
  TJSP:   'api_publica_tjsp',
  TJTO:   'api_publica_tjto',
  // Justiça do Trabalho
  TRT1:   'api_publica_trt1',
  TRT2:   'api_publica_trt2',
  TRT3:   'api_publica_trt3',
  TRT4:   'api_publica_trt4',
  TRT5:   'api_publica_trt5',
  TRT6:   'api_publica_trt6',
  TRT7:   'api_publica_trt7',
  TRT8:   'api_publica_trt8',
  TRT9:   'api_publica_trt9',
  TRT10:  'api_publica_trt10',
  TRT11:  'api_publica_trt11',
  TRT12:  'api_publica_trt12',
  TRT13:  'api_publica_trt13',
  TRT14:  'api_publica_trt14',
  TRT15:  'api_publica_trt15',
  TRT16:  'api_publica_trt16',
  TRT17:  'api_publica_trt17',
  TRT18:  'api_publica_trt18',
  TRT19:  'api_publica_trt19',
  TRT20:  'api_publica_trt20',
  TRT21:  'api_publica_trt21',
  TRT22:  'api_publica_trt22',
  TRT23:  'api_publica_trt23',
  TRT24:  'api_publica_trt24',
  // Justiça Eleitoral
  'TRE-AC': 'api_publica_tre-ac',
  'TRE-AL': 'api_publica_tre-al',
  'TRE-AM': 'api_publica_tre-am',
  'TRE-AP': 'api_publica_tre-ap',
  'TRE-BA': 'api_publica_tre-ba',
  'TRE-CE': 'api_publica_tre-ce',
  'TRE-DF': 'api_publica_tre-dft',
  'TRE-ES': 'api_publica_tre-es',
  'TRE-GO': 'api_publica_tre-go',
  'TRE-MA': 'api_publica_tre-ma',
  'TRE-MG': 'api_publica_tre-mg',
  'TRE-MS': 'api_publica_tre-ms',
  'TRE-MT': 'api_publica_tre-mt',
  'TRE-PA': 'api_publica_tre-pa',
  'TRE-PB': 'api_publica_tre-pb',
  'TRE-PE': 'api_publica_tre-pe',
  'TRE-PI': 'api_publica_tre-pi',
  'TRE-PR': 'api_publica_tre-pr',
  'TRE-RJ': 'api_publica_tre-rj',
  'TRE-RN': 'api_publica_tre-rn',
  'TRE-RO': 'api_publica_tre-ro',
  'TRE-RR': 'api_publica_tre-rr',
  'TRE-RS': 'api_publica_tre-rs',
  'TRE-SC': 'api_publica_tre-sc',
  'TRE-SE': 'api_publica_tre-se',
  'TRE-SP': 'api_publica_tre-sp',
  'TRE-TO': 'api_publica_tre-to',
  // Justiça Militar Estadual
  TJMMG:  'api_publica_tjmmg',
  TJMRS:  'api_publica_tjmrs',
  TJMSP:  'api_publica_tjmsp',
};

// ─── Service ──────────────────────────────────────────────────────────────────

// URL da wiki do CNJ onde a chave pública vigente é sempre publicada
const DATAJUD_WIKI_ACESSO = 'https://datajud-wiki.cnj.jus.br/api-publica/acesso/';
// Chave conhecida — usada como fallback enquanto a wiki não é consultada
const DATAJUD_KEY_FALLBACK = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

@Injectable()
export class DiarioOficialService implements OnModuleInit {
  private readonly logger = new Logger(DiarioOficialService.name);
  private readonly http: AxiosInstance;

  private apiKey: string;

  constructor() {
    // Inicia com a chave do env ou o fallback; onModuleInit busca a wiki
    this.apiKey = process.env.DATAJUD_API_KEY ?? DATAJUD_KEY_FALLBACK;
    this.http = axios.create({
      baseURL: 'https://api-publica.datajud.cnj.jus.br',
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Jurysone/2.0 (+https://jurysone.com.br)',
      },
    });
  }

  async onModuleInit() {
    await this.atualizarChaveDatajud();
  }

  /**
   * Busca a chave pública vigente na wiki do CNJ.
   * Roda na inicialização e todo dia às 3h (a chave pode mudar a qualquer momento).
   */
  @Cron('0 3 * * *', { name: 'datajud-key-refresh', timeZone: 'America/Sao_Paulo' })
  async atualizarChaveDatajud(): Promise<void> {
    // Se o env definir a chave explicitamente, respeita — não sobrescreve
    if (process.env.DATAJUD_API_KEY) {
      this.aplicarChave(process.env.DATAJUD_API_KEY);
      return;
    }
    try {
      const { data: html } = await axios.get(DATAJUD_WIKI_ACESSO, { timeout: 10_000 });
      // Extrai a chave do padrão: "Authorization: APIKey <chave>"
      const match = (html as string).match(/Authorization:\s*APIKey\s+([\w+/=]+)/i);
      if (match?.[1]) {
        this.aplicarChave(match[1]);
        this.logger.log(`🔑 Chave DataJud atualizada da wiki CNJ: ${match[1].slice(0, 12)}...`);
      } else {
        this.logger.warn('Wiki CNJ não retornou chave no formato esperado — mantendo chave atual.');
      }
    } catch (err: any) {
      this.logger.warn(`Falha ao buscar chave na wiki CNJ: ${err.message} — mantendo chave atual.`);
    }
  }

  private aplicarChave(chave: string): void {
    this.apiKey = chave;
    this.http.defaults.headers.common['Authorization'] = `ApiKey ${chave}`;
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /** Lista todos os tribunais suportados */
  getTribunaisSuportados() {
    return Object.entries(DATAJUD_INDEX).map(([sigla, indice]) => ({
      sigla,
      nome: TRIBUNAL_NOME[sigla] ?? sigla,
      indice,
      suportado: true,
    }));
  }

  // ── Busca por OAB via DataJud CNJ ────────────────────────────────────────

  /**
   * Busca processos e publicações pelo número OAB do advogado
   * Usa a API pública do DataJud (CNJ) — sem autenticação
   */
  async buscarPorOab(
    oabNumero: string,
    oabEstado: string,
    tribunal: string,
    page = 1,
  ): Promise<ResultadoBusca[]> {
    const indice = DATAJUD_INDEX[tribunal.toUpperCase()];
    if (!indice) {
      this.logger.warn(`Tribunal ${tribunal} não tem índice DataJud configurado`);
      return [];
    }

    try {
      // DataJud: advogados ficam nested em partes.advogados, campos numeroOAB e estadoOAB
      const body = {
        query: {
          bool: {
            must: [
              {
                nested: {
                  path: 'partes',
                  query: {
                    nested: {
                      path: 'partes.advogados',
                      query: {
                        bool: {
                          must: [
                            { match: { 'partes.advogados.numeroOAB': oabNumero } },
                            { match: { 'partes.advogados.estadoOAB': oabEstado.toUpperCase() } },
                          ],
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        sort: [{ dataHoraUltimaAtualizacao: { order: 'desc' } }],
        size: 20,
        from: (page - 1) * 20,
      };

      const { data } = await this.http.post(`/${indice}/_search`, body);
      return this.parseDatajudResponse(data, tribunal);
    } catch (err: any) {
      if (err?.response?.status === 401) {
        this.logger.error(`DataJud 401 — chave de API inválida ou expirada. Configure DATAJUD_API_KEY no Render.`);
      } else {
        this.logger.error(`Erro ao buscar OAB ${oabNumero}/${oabEstado} no ${tribunal}: ${err.message}`);
      }
      return [];
    }
  }

  /**
   * Busca processos por nome do advogado ou parte
   */
  async buscarPorNome(
    nome: string,
    tribunal: string,
    page = 1,
  ): Promise<ResultadoBusca[]> {
    const indice = DATAJUD_INDEX[tribunal.toUpperCase()];
    if (!indice) return [];

    try {
      const body = {
        query: {
          bool: {
            should: [
              // Busca no nome do advogado (nested em partes.advogados)
              {
                nested: {
                  path: 'partes',
                  query: {
                    nested: {
                      path: 'partes.advogados',
                      query: { match: { 'partes.advogados.nome': { query: nome, operator: 'and' } } },
                    },
                  },
                },
              },
              // Busca no nome das partes
              {
                nested: {
                  path: 'partes',
                  query: { match: { 'partes.nome': { query: nome, operator: 'and' } } },
                },
              },
            ],
            minimum_should_match: 1,
          },
        },
        sort: [{ dataHoraUltimaAtualizacao: { order: 'desc' } }],
        size: 20,
        from: (page - 1) * 20,
      };

      const { data } = await this.http.post(`/${indice}/_search`, body);

      return this.parseDatajudResponse(data, tribunal, [nome]);
    } catch (err: any) {
      this.logger.error(`Erro busca por nome ${nome} em ${tribunal}: ${err.message}`);
      return [];
    }
  }

  /**
   * Busca por número de processo específico (match exato CNJ)
   */
  async buscarPorNumeroProcesso(
    numeroProcesso: string,
    tribunal: string,
  ): Promise<ResultadoBusca[]> {
    const indice = DATAJUD_INDEX[tribunal.toUpperCase()];
    if (!indice) return [];

    try {
      // Normaliza para o formato CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
      const numeroLimpo = numeroProcesso.replace(/\D/g, '');
      const body = {
        query: {
          bool: {
            should: [
              { term: { 'numeroProcesso.keyword': numeroProcesso } },
              { match_phrase: { numeroProcesso } },
              // Fallback: número sem formatação
              ...(numeroLimpo !== numeroProcesso
                ? [{ match_phrase: { numeroProcesso: numeroLimpo } }]
                : []),
            ],
            minimum_should_match: 1,
          },
        },
        size: 10,
      };

      const { data } = await this.http.post(`/${indice}/_search`, body);
      return this.parseDatajudResponse(data, tribunal);
    } catch (err: any) {
      this.logger.error(`Erro busca processo ${numeroProcesso}: ${err.message}`);
      return [];
    }
  }

  /**
   * Busca processos por CPF ou CNPJ de parte
   */
  async buscarPorCpfCnpj(
    cpfCnpj: string,
    tribunal: string,
    page = 1,
  ): Promise<ResultadoBusca[]> {
    const indice = DATAJUD_INDEX[tribunal.toUpperCase()];
    if (!indice) return [];

    const doc = cpfCnpj.replace(/\D/g, '');

    try {
      const body = {
        query: {
          nested: {
            path: 'partes',
            query: {
              bool: {
                should: [
                  { term: { 'partes.cpfCnpj': doc } },
                  { match: { 'partes.cpfCnpj': doc } },
                ],
                minimum_should_match: 1,
              },
            },
          },
        },
        sort: [{ dataHoraUltimaAtualizacao: { order: 'desc' } }],
        size: 20,
        from: (page - 1) * 20,
      };

      const { data } = await this.http.post(`/${indice}/_search`, body);
      return this.parseDatajudResponse(data, tribunal, [cpfCnpj]);
    } catch (err: any) {
      this.logger.error(`Erro busca CPF/CNPJ ${cpfCnpj} em ${tribunal}: ${err.message}`);
      return [];
    }
  }

  /**
   * Busca movimentações recentes de um processo
   */
  async buscarMovimentacoesRecentes(
    numeroProcesso: string,
    tribunal: string,
    diasAtras = 7,
  ): Promise<ResultadoBusca[]> {
    const indice = DATAJUD_INDEX[tribunal.toUpperCase()];
    if (!indice) return [];

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasAtras);

    try {
      const body = {
        query: {
          bool: {
            must: [
              {
                bool: {
                  should: [
                    { term: { 'numeroProcesso.keyword': numeroProcesso } },
                    { match_phrase: { numeroProcesso } },
                  ],
                  minimum_should_match: 1,
                },
              },
              // Filtra por data de última atualização do processo
              {
                range: {
                  dataHoraUltimaAtualizacao: {
                    gte: dataInicio.toISOString(),
                  },
                },
              },
            ],
          },
        },
        sort: [{ dataHoraUltimaAtualizacao: { order: 'desc' } }],
        size: 10,
      };

      const { data } = await this.http.post(`/${indice}/_search`, body);
      return this.parseDatajudResponse(data, tribunal);
    } catch (err: any) {
      this.logger.error(`Erro movimentações ${numeroProcesso}: ${err.message}`);
      return [];
    }
  }

  // ── Busca em múltiplos tribunais ─────────────────────────────────────────

  /**
   * Executa busca em múltiplos tribunais em paralelo
   */
  async buscarEmTodos(config: ConfigBusca): Promise<ResultadoBusca[]> {
    const resultados: ResultadoBusca[] = [];
    const tribunais = config.tribunais.includes('TODOS')
      ? Object.keys(DATAJUD_INDEX)
      : config.tribunais;

    // Processa em lotes de 5 para não sobrecarregar
    const LOTE = 5;
    for (let i = 0; i < tribunais.length; i += LOTE) {
      const lote = tribunais.slice(i, i + LOTE);
      const promessas = lote.flatMap(tribunal =>
        config.termosBusca.map(termo => this.buscarPorTermoETribunal(termo, tribunal)),
      );
      const loteResultados = await Promise.allSettled(promessas);
      loteResultados.forEach(r => {
        if (r.status === 'fulfilled') resultados.push(...r.value);
      });

      // Rate limiting: aguarda 200ms entre lotes
      if (i + LOTE < tribunais.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return this.deduplicar(resultados);
  }

  // ── Detecção de prazo no texto ────────────────────────────────────────────

  /**
   * Extrai o prazo (em dias) mencionado no texto da publicação
   */
  extrairPrazo(texto: string): number | null {
    const padroes = [
      /prazo\s+de\s+(\d+)\s+(?:dias?\s+)?úteis?/i,
      /(\d+)\s+dias?\s+úteis?\s+(?:para|a\s+contar)/i,
      /prazo\s+de\s+(\d+)\s+dias/i,
      /(\d+)\s+dias?\s+(?:corridos?|para\s+manifestar)/i,
      /intimad[ao]s?\s+para[,\s]+no\s+prazo\s+de\s+(\d+)/i,
    ];

    for (const p of padroes) {
      const m = texto.match(p);
      if (m) return parseInt(m[1]);
    }
    return null;
  }

  /**
   * Extrai número de processo do texto da publicação
   */
  extrairNumeroProcesso(texto: string): string | null {
    const padrao = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
    const m = texto.match(padrao);
    return m ? m[0] : null;
  }

  // ── Helpers privados ─────────────────────────────────────────────────────

  private async buscarPorTermoETribunal(
    termo: string,
    tribunal: string,
  ): Promise<ResultadoBusca[]> {
    // OAB: "12345/SP" ou "12345 SP"
    const oabMatch = termo.match(/^(\d+)[\/\s]([A-Z]{2})$/i);
    if (oabMatch) {
      return this.buscarPorOab(oabMatch[1], oabMatch[2], tribunal);
    }

    // Número de processo CNJ: NNNNNNN-DD.AAAA.J.TT.OOOO
    if (/\d{7}-\d{2}\.\d{4}/.test(termo)) {
      return this.buscarPorNumeroProcesso(termo, tribunal);
    }

    // CPF (11 dígitos) ou CNPJ (14 dígitos) — com ou sem formatação
    const docLimpo = termo.replace(/\D/g, '');
    if (docLimpo.length === 11 || docLimpo.length === 14) {
      return this.buscarPorCpfCnpj(docLimpo, tribunal);
    }

    // Senão, busca por nome
    return this.buscarPorNome(termo, tribunal);
  }

  private parseDatajudResponse(
    data: any,
    tribunal: string,
    termosBusca: string[] = [],
  ): ResultadoBusca[] {
    const hits = data?.hits?.hits ?? [];
    return hits.map((hit: any) => {
      const src = hit._source ?? {};
      const movimentos: any[] = src.movimentos ?? [];
      const ultimoMov = movimentos.sort(
        (a: any, b: any) => new Date(b.dataHora ?? 0).getTime() - new Date(a.dataHora ?? 0).getTime(),
      )[0];

      const conteudo = [
        ultimoMov?.nome ?? '',
        ultimoMov?.complementosTabelados?.map((c: any) => c.nome).join('; ') ?? '',
        movimentos.slice(0, 5).map((m: any) => `${m.dataHora?.split('T')[0] ?? ''}: ${m.nome ?? ''}`).join('\n'),
      ].filter(Boolean).join('\n\n');

      const textoCompleto = JSON.stringify(src);

      return {
        tribunal,
        dataPublicacao: src.dataHoraUltimaAtualizacao ?? src['@timestamp'] ?? new Date().toISOString(),
        edicao:         src.numeroProcesso ?? '',
        titulo:         `Processo ${src.numeroProcesso ?? ''} — ${src.classe?.nome ?? 'Sem classe'}`,
        conteudo:       conteudo || textoCompleto.slice(0, 500),
        caderno:        src.orgaoJulgador?.nome ?? 'Não informado',
        pagina:         '',
        urlOrigem:      `https://api-publica.datajud.cnj.jus.br/${DATAJUD_INDEX[tribunal] ?? tribunal}/_doc/${hit._id}`,
        nomesEncontrados: termosBusca,
        numeroProcesso:   src.numeroProcesso ?? this.extrairNumeroProcesso(textoCompleto),
        prazoIdentificado: this.extrairPrazo(conteudo),
      } as ResultadoBusca;
    });
  }

  private deduplicar(resultados: ResultadoBusca[]): ResultadoBusca[] {
    const vistos = new Set<string>();
    return resultados.filter(r => {
      const chave = `${r.tribunal}:${r.edicao}:${r.titulo}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }
}
