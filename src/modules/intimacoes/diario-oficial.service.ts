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

import { Injectable, Logger } from '@nestjs/common';
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

// ─── Configurações dos tribunais ──────────────────────────────────────────────

const TRIBUNAIS_CONFIG: Record<string, {
  nome:    string;
  tipo:    'api_datajud' | 'esaj' | 'pje' | 'portal';
  baseUrl: string;
  sigla:   string;
}> = {
  TJSP: {
    nome: 'Tribunal de Justiça de São Paulo',
    tipo: 'esaj',
    baseUrl: 'https://esaj.tjsp.jus.br',
    sigla: 'TJSP',
  },
  TJRJ: {
    nome: 'Tribunal de Justiça do Rio de Janeiro',
    tipo: 'portal',
    baseUrl: 'https://www.tjrj.jus.br',
    sigla: 'TJRJ',
  },
  TJMG: {
    nome: 'Tribunal de Justiça de Minas Gerais',
    tipo: 'portal',
    baseUrl: 'https://www.tjmg.jus.br',
    sigla: 'TJMG',
  },
  TRF1: {
    nome: 'Tribunal Regional Federal da 1ª Região',
    tipo: 'api_datajud',
    baseUrl: 'https://api-publica.datajud.cnj.jus.br',
    sigla: 'TRF1',
  },
  TRF3: {
    nome: 'Tribunal Regional Federal da 3ª Região',
    tipo: 'api_datajud',
    baseUrl: 'https://api-publica.datajud.cnj.jus.br',
    sigla: 'TRF3',
  },
  STJ: {
    nome: 'Superior Tribunal de Justiça',
    tipo: 'api_datajud',
    baseUrl: 'https://api-publica.datajud.cnj.jus.br',
    sigla: 'STJ',
  },
  STF: {
    nome: 'Supremo Tribunal Federal',
    tipo: 'api_datajud',
    baseUrl: 'https://api-publica.datajud.cnj.jus.br',
    sigla: 'STF',
  },
  CNJ: {
    nome: 'Conselho Nacional de Justiça',
    tipo: 'api_datajud',
    baseUrl: 'https://api-publica.datajud.cnj.jus.br',
    sigla: 'CNJ',
  },
};

// Mapeamento tribunal → índice DataJud
const DATAJUD_INDEX: Record<string, string> = {
  STF:   'api_publica_stf',
  STJ:   'api_publica_stj',
  TST:   'api_publica_tst',
  TSE:   'api_publica_tse',
  STM:   'api_publica_stm',
  TRF1:  'api_publica_trf1',
  TRF2:  'api_publica_trf2',
  TRF3:  'api_publica_trf3',
  TRF4:  'api_publica_trf4',
  TRF5:  'api_publica_trf5',
  TRF6:  'api_publica_trf6',
  TJSP:  'api_publica_tjsp',
  TJRJ:  'api_publica_tjrj',
  TJMG:  'api_publica_tjmg',
  TJRS:  'api_publica_tjrs',
  TJPR:  'api_publica_tjpr',
  TJSC:  'api_publica_tjsc',
  TJBA:  'api_publica_tjba',
  TJGO:  'api_publica_tjgo',
  TJPE:  'api_publica_tjpe',
  TJCE:  'api_publica_tjce',
  TJMT:  'api_publica_tjmt',
  TJMS:  'api_publica_tjms',
  TJMA:  'api_publica_tjma',
  TJPA:  'api_publica_tjpa',
  TJAM:  'api_publica_tjam',
  TJRN:  'api_publica_tjrn',
  TJPB:  'api_publica_tjpb',
  TJAL:  'api_publica_tjal',
  TJSE:  'api_publica_tjse',
  TJPI:  'api_publica_tjpi',
  TJTO:  'api_publica_tjto',
  TJRO:  'api_publica_tjro',
  TJAC:  'api_publica_tjac',
  TJAR:  'api_publica_tjar',
  TJAP:  'api_publica_tjap',
  TJRR:  'api_publica_tjrr',
  TJDF:  'api_publica_tjdft',
  TRT1:  'api_publica_trt1',
  TRT2:  'api_publica_trt2',
  TRT3:  'api_publica_trt3',
  TRT4:  'api_publica_trt4',
  TRT5:  'api_publica_trt5',
  TRT15: 'api_publica_trt15',
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class DiarioOficialService {
  private readonly logger = new Logger(DiarioOficialService.name);
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      timeout: 30_000,
      headers: {
        'User-Agent': 'Jurysone/2.0 (+https://jurysone.com.br)',
        Accept: 'application/json',
      },
    });
  }

  // ── API pública ──────────────────────────────────────────────────────────

  /** Lista todos os tribunais suportados */
  getTribunaisSuportados() {
    return Object.entries(DATAJUD_INDEX).map(([sigla, indice]) => ({
      sigla,
      nome: TRIBUNAIS_CONFIG[sigla]?.nome ?? sigla,
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
      const body = {
        query: {
          bool: {
            must: [
              {
                nested: {
                  path: 'advogados',
                  query: {
                    bool: {
                      must: [
                        { match: { 'advogados.OabNumero': oabNumero } },
                        { match: { 'advogados.OabEstado': oabEstado.toUpperCase() } },
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
        sort: [{ '@timestamp': { order: 'desc' } }],
        size: 20,
        from: (page - 1) * 20,
      };

      const { data } = await this.http.post(
        `https://api-publica.datajud.cnj.jus.br/${indice}/_search`,
        body,
        { headers: { 'Content-Type': 'application/json' } },
      );

      return this.parseDatajudResponse(data, tribunal);
    } catch (err: any) {
      this.logger.error(`Erro ao buscar OAB ${oabNumero}/${oabEstado} no ${tribunal}: ${err.message}`);
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
              // Busca no nome do advogado
              {
                nested: {
                  path: 'advogados',
                  query: { match: { 'advogados.nome': { query: nome, operator: 'and' } } },
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
        sort: [{ '@timestamp': { order: 'desc' } }],
        size: 20,
        from: (page - 1) * 20,
      };

      const { data } = await this.http.post(
        `https://api-publica.datajud.cnj.jus.br/${indice}/_search`,
        body,
        { headers: { 'Content-Type': 'application/json' } },
      );

      return this.parseDatajudResponse(data, tribunal, [nome]);
    } catch (err: any) {
      this.logger.error(`Erro busca por nome ${nome} em ${tribunal}: ${err.message}`);
      return [];
    }
  }

  /**
   * Busca por número de processo específico
   */
  async buscarPorNumeroProcesso(
    numeroProcesso: string,
    tribunal: string,
  ): Promise<ResultadoBusca[]> {
    const indice = DATAJUD_INDEX[tribunal.toUpperCase()];
    if (!indice) return [];

    try {
      // Remove formatação e busca pelo número limpo
      const numeroLimpo = numeroProcesso.replace(/\D/g, '');
      const body = {
        query: {
          bool: {
            should: [
              { match: { numeroProcesso: numeroProcesso } },
              { match: { numeroProcesso: numeroLimpo } },
            ],
          },
        },
        size: 10,
      };

      const { data } = await this.http.post(
        `https://api-publica.datajud.cnj.jus.br/${indice}/_search`,
        body,
        { headers: { 'Content-Type': 'application/json' } },
      );

      return this.parseDatajudResponse(data, tribunal);
    } catch (err: any) {
      this.logger.error(`Erro busca processo ${numeroProcesso}: ${err.message}`);
      return [];
    }
  }

  /**
   * Busca movimentações recentes de um processo (andamentos = intimações)
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
              { match: { numeroProcesso } },
              {
                nested: {
                  path: 'movimentos',
                  query: {
                    range: {
                      'movimentos.dataHora': {
                        gte: dataInicio.toISOString(),
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        size: 10,
      };

      const { data } = await this.http.post(
        `https://api-publica.datajud.cnj.jus.br/${indice}/_search`,
        body,
        { headers: { 'Content-Type': 'application/json' } },
      );

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
    // Detecta se é OAB (ex: "12345/SP" ou "12345 SP")
    const oabMatch = termo.match(/^(\d+)[\/\s]([A-Z]{2})$/i);
    if (oabMatch) {
      return this.buscarPorOab(oabMatch[1], oabMatch[2], tribunal);
    }

    // Detecta se é número de processo (tem traços e pontos no padrão CNJ)
    if (/\d{7}-\d{2}\.\d{4}/.test(termo)) {
      return this.buscarPorNumeroProcesso(termo, tribunal);
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
