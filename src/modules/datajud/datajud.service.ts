/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — DataJud Service
 * Integração com a API Pública do CNJ (DataJud)
 * Documentação: https://datajud-wiki.cnj.jus.br/api-publica/acesso
 * ═══════════════════════════════════════════════════════════════
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import axios, { AxiosInstance } from 'axios';

// ── Mapeamento de tribunais → índice DataJud ─────────────────────────────────

const TRIBUNAL_INDEX: Record<string, string> = {
  // Tribunais Estaduais
  TJAC: 'api_publica-tjac',
  TJAL: 'api_publica-tjal',
  TJAM: 'api_publica-tjam',
  TJAP: 'api_publica-tjap',
  TJBA: 'api_publica-tjba',
  TJCE: 'api_publica-tjce',
  TJDF: 'api_publica-tjdft',
  TJES: 'api_publica-tjes',
  TJGO: 'api_publica-tjgo',
  TJMA: 'api_publica-tjma',
  TJMG: 'api_publica-tjmg',
  TJMS: 'api_publica-tjms',
  TJMT: 'api_publica-tjmt',
  TJPA: 'api_publica-tjpa',
  TJPB: 'api_publica-tjpb',
  TJPE: 'api_publica-tjpe',
  TJPI: 'api_publica-tjpi',
  TJPR: 'api_publica-tjpr',
  TJRJ: 'api_publica-tjrj',
  TJRN: 'api_publica-tjrn',
  TJRO: 'api_publica-tjro',
  TJRR: 'api_publica-tjrr',
  TJRS: 'api_publica-tjrs',
  TJSC: 'api_publica-tjsc',
  TJSE: 'api_publica-tjse',
  TJSP: 'api_publica-tjsp',
  TJTO: 'api_publica-tjto',
  // Tribunais Superiores
  STF: 'api_publica-stf',
  STJ: 'api_publica-stj',
  TST: 'api_publica-tst',
  TSE: 'api_publica-tse',
  STM: 'api_publica-stm',
  // Tribunais Regionais Federais
  TRF1: 'api_publica-trf1',
  TRF2: 'api_publica-trf2',
  TRF3: 'api_publica-trf3',
  TRF4: 'api_publica-trf4',
  TRF5: 'api_publica-trf5',
  TRF6: 'api_publica-trf6',
  // Tribunais Regionais do Trabalho
  TRT1:  'api_publica-trt1',
  TRT2:  'api_publica-trt2',
  TRT3:  'api_publica-trt3',
  TRT4:  'api_publica-trt4',
  TRT5:  'api_publica-trt5',
  TRT6:  'api_publica-trt6',
  TRT7:  'api_publica-trt7',
  TRT8:  'api_publica-trt8',
  TRT9:  'api_publica-trt9',
  TRT10: 'api_publica-trt10',
  TRT11: 'api_publica-trt11',
  TRT12: 'api_publica-trt12',
  TRT13: 'api_publica-trt13',
  TRT14: 'api_publica-trt14',
  TRT15: 'api_publica-trt15',
  TRT16: 'api_publica-trt16',
  TRT17: 'api_publica-trt17',
  TRT18: 'api_publica-trt18',
  TRT19: 'api_publica-trt19',
  TRT20: 'api_publica-trt20',
  TRT21: 'api_publica-trt21',
  TRT22: 'api_publica-trt22',
  TRT23: 'api_publica-trt23',
  TRT24: 'api_publica-trt24',
  // Tribunal Superior Militar
  CJF: 'api_publica-cjf',
};

const TRIBUNAIS_INFO = [
  { sigla: 'TJSP', nome: 'Tribunal de Justiça de São Paulo',            uf: 'SP', segmento: 'Estadual' },
  { sigla: 'TJRJ', nome: 'Tribunal de Justiça do Rio de Janeiro',       uf: 'RJ', segmento: 'Estadual' },
  { sigla: 'TJMG', nome: 'Tribunal de Justiça de Minas Gerais',         uf: 'MG', segmento: 'Estadual' },
  { sigla: 'TJRS', nome: 'Tribunal de Justiça do Rio Grande do Sul',    uf: 'RS', segmento: 'Estadual' },
  { sigla: 'TJPR', nome: 'Tribunal de Justiça do Paraná',               uf: 'PR', segmento: 'Estadual' },
  { sigla: 'TJSC', nome: 'Tribunal de Justiça de Santa Catarina',       uf: 'SC', segmento: 'Estadual' },
  { sigla: 'TJBA', nome: 'Tribunal de Justiça da Bahia',                uf: 'BA', segmento: 'Estadual' },
  { sigla: 'TJGO', nome: 'Tribunal de Justiça de Goiás',                uf: 'GO', segmento: 'Estadual' },
  { sigla: 'TJDF', nome: 'Tribunal de Justiça do Distrito Federal',     uf: 'DF', segmento: 'Estadual' },
  { sigla: 'TJPE', nome: 'Tribunal de Justiça de Pernambuco',           uf: 'PE', segmento: 'Estadual' },
  { sigla: 'TJCE', nome: 'Tribunal de Justiça do Ceará',                uf: 'CE', segmento: 'Estadual' },
  { sigla: 'TJMA', nome: 'Tribunal de Justiça do Maranhão',             uf: 'MA', segmento: 'Estadual' },
  { sigla: 'TJPA', nome: 'Tribunal de Justiça do Pará',                 uf: 'PA', segmento: 'Estadual' },
  { sigla: 'TJAM', nome: 'Tribunal de Justiça do Amazonas',             uf: 'AM', segmento: 'Estadual' },
  { sigla: 'TJPB', nome: 'Tribunal de Justiça da Paraíba',              uf: 'PB', segmento: 'Estadual' },
  { sigla: 'TJRN', nome: 'Tribunal de Justiça do Rio Grande do Norte',  uf: 'RN', segmento: 'Estadual' },
  { sigla: 'TJAL', nome: 'Tribunal de Justiça de Alagoas',              uf: 'AL', segmento: 'Estadual' },
  { sigla: 'TJSE', nome: 'Tribunal de Justiça de Sergipe',              uf: 'SE', segmento: 'Estadual' },
  { sigla: 'TJPI', nome: 'Tribunal de Justiça do Piauí',                uf: 'PI', segmento: 'Estadual' },
  { sigla: 'TJES', nome: 'Tribunal de Justiça do Espírito Santo',       uf: 'ES', segmento: 'Estadual' },
  { sigla: 'TJMT', nome: 'Tribunal de Justiça do Mato Grosso',          uf: 'MT', segmento: 'Estadual' },
  { sigla: 'TJMS', nome: 'Tribunal de Justiça do Mato Grosso do Sul',   uf: 'MS', segmento: 'Estadual' },
  { sigla: 'TJRO', nome: 'Tribunal de Justiça de Rondônia',             uf: 'RO', segmento: 'Estadual' },
  { sigla: 'TJTO', nome: 'Tribunal de Justiça do Tocantins',            uf: 'TO', segmento: 'Estadual' },
  { sigla: 'TJAC', nome: 'Tribunal de Justiça do Acre',                 uf: 'AC', segmento: 'Estadual' },
  { sigla: 'TJRR', nome: 'Tribunal de Justiça de Roraima',              uf: 'RR', segmento: 'Estadual' },
  { sigla: 'TJAP', nome: 'Tribunal de Justiça do Amapá',                uf: 'AP', segmento: 'Estadual' },
  // Superiores
  { sigla: 'STF',  nome: 'Supremo Tribunal Federal',                    uf: null, segmento: 'Superior' },
  { sigla: 'STJ',  nome: 'Superior Tribunal de Justiça',                uf: null, segmento: 'Superior' },
  { sigla: 'TST',  nome: 'Tribunal Superior do Trabalho',               uf: null, segmento: 'Superior' },
  { sigla: 'TSE',  nome: 'Tribunal Superior Eleitoral',                 uf: null, segmento: 'Superior' },
  { sigla: 'STM',  nome: 'Superior Tribunal Militar',                   uf: null, segmento: 'Superior' },
  // Federais
  { sigla: 'TRF1', nome: 'Tribunal Regional Federal da 1ª Região',      uf: null, segmento: 'Federal' },
  { sigla: 'TRF2', nome: 'Tribunal Regional Federal da 2ª Região',      uf: null, segmento: 'Federal' },
  { sigla: 'TRF3', nome: 'Tribunal Regional Federal da 3ª Região',      uf: null, segmento: 'Federal' },
  { sigla: 'TRF4', nome: 'Tribunal Regional Federal da 4ª Região',      uf: null, segmento: 'Federal' },
  { sigla: 'TRF5', nome: 'Tribunal Regional Federal da 5ª Região',      uf: null, segmento: 'Federal' },
  { sigla: 'TRF6', nome: 'Tribunal Regional Federal da 6ª Região',      uf: null, segmento: 'Federal' },
  // Trabalho
  { sigla: 'TRT1',  nome: 'Tribunal Regional do Trabalho — 1ª Região',  uf: 'RJ', segmento: 'Trabalhista' },
  { sigla: 'TRT2',  nome: 'Tribunal Regional do Trabalho — 2ª Região',  uf: 'SP', segmento: 'Trabalhista' },
  { sigla: 'TRT3',  nome: 'Tribunal Regional do Trabalho — 3ª Região',  uf: 'MG', segmento: 'Trabalhista' },
  { sigla: 'TRT4',  nome: 'Tribunal Regional do Trabalho — 4ª Região',  uf: 'RS', segmento: 'Trabalhista' },
  { sigla: 'TRT5',  nome: 'Tribunal Regional do Trabalho — 5ª Região',  uf: 'BA', segmento: 'Trabalhista' },
  { sigla: 'TRT6',  nome: 'Tribunal Regional do Trabalho — 6ª Região',  uf: 'PE', segmento: 'Trabalhista' },
  { sigla: 'TRT7',  nome: 'Tribunal Regional do Trabalho — 7ª Região',  uf: 'CE', segmento: 'Trabalhista' },
  { sigla: 'TRT8',  nome: 'Tribunal Regional do Trabalho — 8ª Região',  uf: 'PA', segmento: 'Trabalhista' },
  { sigla: 'TRT15', nome: 'Tribunal Regional do Trabalho — 15ª Região', uf: 'SP', segmento: 'Trabalhista' },
];

@Injectable()
export class DatajudService {
  private readonly logger = new Logger(DatajudService.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('DATAJUD_BASE_URL', 'https://api-publica.datajud.cnj.jus.br');
    const apiKey  = this.config.get<string>('DATAJUD_API_KEY', 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==');

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `ApiKey ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    this.logger.log(`DataJud configurado: ${this.baseUrl}`);
  }

  // ── Helpers internos ────────────────────────────────────────────────────────

  /** Resolve o índice DataJud a partir da sigla do tribunal */
  private resolverIndice(tribunal: string): string {
    const sigla = tribunal.toUpperCase().trim();
    const indice = TRIBUNAL_INDEX[sigla];
    if (!indice) {
      throw new NotFoundException(`Tribunal "${sigla}" não reconhecido. Use siglas como TJSP, STJ, TRF1...`);
    }
    return indice;
  }

  /** Executa uma busca Elasticsearch na API DataJud */
  private async buscarNaApi(indice: string, query: object, size = 10): Promise<any[]> {
    try {
      const { data } = await this.http.post(`/${indice}/_search`, {
        size,
        query,
      });
      const hits = data?.hits?.hits ?? [];
      return hits.map((hit: any) => hit._source);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = err?.response?.data?.error?.reason ?? err.message;
      this.logger.error(`Erro DataJud [${indice}] — HTTP ${status}: ${msg}`);
      throw new Error(`Falha ao consultar DataJud (${indice}): ${msg}`);
    }
  }

  // ── MÉTODOS PRINCIPAIS ──────────────────────────────────────────────────────

  /**
   * Busca processo pelo número único (CNJ).
   * Formato: NNNNNNN-DD.AAAA.J.TT.OOOO (ex: 0001234-56.2024.8.26.0100)
   */
  async buscarPorNumero(numeroProcesso: string, tribunal: string): Promise<any> {
    const indice    = this.resolverIndice(tribunal);
    const numero    = numeroProcesso.trim();

    this.logger.log(`Buscando processo ${numero} no ${tribunal.toUpperCase()}`);

    const resultados = await this.buscarNaApi(indice, {
      match: { numeroProcesso: numero },
    }, 1);

    if (!resultados.length) {
      return {
        encontrado: false,
        numeroProcesso: numero,
        tribunal: tribunal.toUpperCase(),
        mensagem: 'Processo não encontrado no DataJud para o tribunal informado.',
      };
    }

    const processo = resultados[0];
    return {
      encontrado: true,
      tribunal:   tribunal.toUpperCase(),
      dados:      this.formatarProcesso(processo),
    };
  }

  /**
   * Busca processos por nome de parte (autor, réu, etc.).
   */
  async buscarPorParte(nomeParte: string, tribunal: string, pagina = 1, porPagina = 10): Promise<any> {
    const indice = this.resolverIndice(tribunal);
    const from   = (pagina - 1) * porPagina;

    this.logger.log(`Buscando processos de "${nomeParte}" no ${tribunal.toUpperCase()}`);

    try {
      const { data } = await this.http.post(`/${indice}/_search`, {
        from,
        size: porPagina,
        query: {
          nested: {
            path: 'partes',
            query: {
              match: {
                'partes.nome': {
                  query:    nomeParte,
                  operator: 'and',
                },
              },
            },
          },
        },
        sort: [{ dataHoraUltimaAtualizacao: { order: 'desc' } }],
      });

      const total    = data?.hits?.total?.value ?? 0;
      const hits     = data?.hits?.hits ?? [];
      const processos = hits.map((h: any) => this.formatarProcesso(h._source));

      return {
        tribunal: tribunal.toUpperCase(),
        parte:    nomeParte,
        total,
        pagina,
        porPagina,
        processos,
      };
    } catch (err: any) {
      const msg = err?.response?.data?.error?.reason ?? err.message;
      this.logger.error(`Erro buscarPorParte: ${msg}`);
      throw new Error(`Falha ao buscar processos por parte: ${msg}`);
    }
  }

  /**
   * Lista todos os tribunais suportados pelo DataJud.
   */
  listarTribunais(): any {
    const tribunais = TRIBUNAIS_INFO.map((t) => ({
      ...t,
      suportado: !!TRIBUNAL_INDEX[t.sigla],
      indice:    TRIBUNAL_INDEX[t.sigla] ?? null,
    }));

    return {
      total: tribunais.length,
      segmentos: {
        Estadual:    tribunais.filter((t) => t.segmento === 'Estadual').length,
        Superior:    tribunais.filter((t) => t.segmento === 'Superior').length,
        Federal:     tribunais.filter((t) => t.segmento === 'Federal').length,
        Trabalhista: tribunais.filter((t) => t.segmento === 'Trabalhista').length,
      },
      tribunais,
    };
  }

  /**
   * Sincroniza as movimentações de um processo com o DataJud.
   * Busca as movimentações mais recentes e salva no banco.
   */
  async sincronizarProcesso(processoId: string): Promise<any> {
    const processo = await this.prisma.processo.findUnique({
      where: { id: processoId },
      include: {
        monitoramentosDatajud: true,
        movimentacoes: {
          orderBy: { data: 'desc' },
          take: 1,
        },
      },
    });

    if (!processo) {
      throw new NotFoundException(`Processo ${processoId} não encontrado no banco.`);
    }

    if (!processo.tribunal) {
      this.logger.warn(`Processo ${processoId} sem tribunal definido — pulando sync.`);
      return { sincronizado: false, motivo: 'Tribunal não definido no processo.' };
    }

    this.logger.log(`Sincronizando processo ${processo.numero} (${processo.tribunal})`);

    let indice: string;
    try {
      indice = this.resolverIndice(processo.tribunal);
    } catch {
      return { sincronizado: false, motivo: `Tribunal "${processo.tribunal}" não suportado.` };
    }

    // Busca no DataJud
    const resultados = await this.buscarNaApi(indice, {
      match: { numeroProcesso: processo.numero },
    }, 1);

    if (!resultados.length) {
      this.logger.warn(`Processo ${processo.numero} não encontrado no DataJud.`);
      return { sincronizado: false, motivo: 'Processo não localizado no DataJud.' };
    }

    const dadosApi   = resultados[0];
    const movimentos = (dadosApi.movimentos ?? []) as any[];

    // Determina data da última movimentação salva
    const ultimaMovData = processo.movimentacoes[0]?.data ?? new Date(0);

    // Filtra movimentos mais recentes que a última sync
    const novos = movimentos.filter((m) => {
      const dataMovimento = new Date(m.dataHora);
      return dataMovimento > ultimaMovData;
    });

    let criados = 0;
    for (const mov of novos) {
      try {
        await this.prisma.movimentacao.create({
          data: {
            processoId: processo.id,
            data:       new Date(mov.dataHora),
            descricao:  mov.nome ?? 'Movimentação importada do DataJud',
            fonte:      'datajud',
          },
        });
        criados++;
      } catch (err: any) {
        this.logger.warn(`Movimentação duplicada ignorada: ${mov.nome} — ${err.message}`);
      }
    }

    // Atualiza o registro de monitoramento
    if (processo.monitoramentosDatajud.length > 0) {
      const monitoramento = processo.monitoramentosDatajud[0];
      await this.prisma.datajudMonitoramento.update({
        where: { id: monitoramento.id },
        data: {
          ultimaSync:      new Date(),
          totalAndamentos: { increment: criados },
        },
      });
    }

    this.logger.log(`Processo ${processo.numero} sincronizado — ${criados} novos andamentos.`);

    return {
      sincronizado:       true,
      processo:           processo.numero,
      tribunal:           processo.tribunal,
      novosAndamentos:    criados,
      totalMovimentacoes: movimentos.length,
      ultimaSync:         new Date(),
    };
  }

  // ── CRON — Sincronização automática a cada 6 horas ─────────────────────────

  /**
   * Executa automaticamente a cada 6 horas.
   * Sincroniza todos os processos com monitoramento ativo.
   */
  @Cron('0 */6 * * *', { name: 'datajud-sync-automatico', timeZone: 'America/Sao_Paulo' })
  async sincronizarProcessosAtivos(): Promise<void> {
    this.logger.log('⏰ CRON DataJud — Iniciando sincronização automática de processos ativos...');

    const monitoramentos = await this.prisma.datajudMonitoramento.findMany({
      where: { ativo: true },
      include: {
        processo: { select: { id: true, numero: true, tribunal: true, status: true } },
      },
    });

    const ativos = monitoramentos.filter(
      (m) => m.processo.status === 'ATIVO',
    );

    this.logger.log(`📋 ${ativos.length} processos para sincronizar.`);

    let sucesso = 0;
    let erros   = 0;

    for (const monitoramento of ativos) {
      try {
        await this.sincronizarProcesso(monitoramento.processoId);
        sucesso++;
        // Pequena pausa para não sobrecarregar a API
        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        erros++;
        this.logger.error(
          `Erro ao sincronizar processo ${monitoramento.processo.numero}: ${err.message}`,
        );
      }
    }

    this.logger.log(`✅ CRON DataJud finalizado — sucesso: ${sucesso}, erros: ${erros}`);
  }

  // ── MÉTODOS LEGADOS (mantidos para compatibilidade) ─────────────────────────

  findAll(query: any, officeId: string) {
    return { message: 'Datajud', officeId, query };
  }

  findOne(id: string, officeId: string) {
    return { message: 'Datajud detail', id, officeId };
  }

  create(body: any, officeId: string) {
    return { message: 'Datajud created', body, officeId };
  }

  update(id: string, body: any, officeId: string) {
    return { message: 'Datajud updated', id, body, officeId };
  }

  remove(id: string, officeId: string) {
    return { message: 'Datajud removed', id, officeId };
  }

  sync(body: any, officeId: string) {
    return { message: 'Datajud sync', body, officeId };
  }

  /** Wrapper para o controller existente — delega ao novo método */
  buscarProcesso(numero: string) {
    // Tenta inferir tribunal pelo código CNJ (posição 15-16 do número formatado)
    const partes = numero.replace(/\D/g, '');
    const codigoTribunal = partes.slice(13, 15);
    const codigoOrgao    = partes.slice(15);

    // Segmento 8 = Estadual; tenta mapear pelo código do tribunal
    let tribunal = this.inferirTribunalPorCodigo(codigoTribunal, codigoOrgao);
    if (!tribunal) {
      return {
        mensagem: 'Informe o tribunal explicitamente via GET /datajud/buscar?numero_processo=...&tribunal=TJSP',
        numero,
      };
    }
    return this.buscarPorNumero(numero, tribunal);
  }

  buscarPorOab(query: any) {
    return {
      mensagem: 'Busca por OAB em desenvolvimento — use buscarPorParte com nome completo por enquanto.',
      query,
    };
  }

  buscarPorCpfCnpj(query: any) {
    return {
      mensagem: 'Busca por CPF/CNPJ em desenvolvimento — use buscarPorParte com nome completo.',
      query,
    };
  }

  importarProcesso(user: any, dto: any) {
    return { message: 'Processo importado', dto };
  }

  importarLote(user: any, dto: any) {
    return { message: 'Lote importado', dto };
  }

  importarPorOab(user: any, dto: any) {
    return { message: 'OAB importado', dto };
  }

  getJobStatus(officeId: string, id: string) {
    return { status: 'pending', id, officeId };
  }

  listMonitoramentos(officeId: string, query: any) {
    return this.prisma.datajudMonitoramento.findMany({
      where: { escritorioId: officeId, ativo: query.ativo !== 'false' },
      include: { processo: { select: { id: true, numero: true, tribunal: true, status: true } } },
    });
  }

  async ativarMonitoramento(officeId: string, dto: any) {
    return this.prisma.datajudMonitoramento.upsert({
      where: { escritorioId_processoId: { escritorioId: officeId, processoId: dto.processo_id } },
      create: {
        escritorioId:        officeId,
        processoId:          dto.processo_id,
        alertarMovimentacao: dto.alertar_movimentacao ?? true,
        alertarPrazo:        dto.alertar_prazo ?? true,
        usuariosAlertar:     dto.usuarios_alertar ?? [],
      },
      update: {
        ativo:               true,
        alertarMovimentacao: dto.alertar_movimentacao ?? true,
        alertarPrazo:        dto.alertar_prazo ?? true,
        usuariosAlertar:     dto.usuarios_alertar ?? [],
      },
    });
  }

  async updateMonitoramento(officeId: string, id: string, dto: any) {
    return this.prisma.datajudMonitoramento.update({
      where: { id },
      data:  dto,
    });
  }

  async syncManual(user: any, id: string) {
    // id é o ID do monitoramento
    const monitor = await this.prisma.datajudMonitoramento.findUnique({ where: { id } });
    if (!monitor) throw new NotFoundException('Monitoramento não encontrado.');
    return this.sincronizarProcesso(monitor.processoId);
  }

  async getAndamentos(officeId: string, query: any) {
    const where: any = {
      processo: { escritorioId: officeId },
      fonte:    'datajud',
    };
    if (query.data_inicio) where.data = { gte: new Date(query.data_inicio) };
    if (query.data_fim)    where.data = { ...where.data, lte: new Date(query.data_fim) };

    return this.prisma.movimentacao.findMany({
      where,
      orderBy: { data: 'desc' },
      take:    parseInt(query.page ?? '1') * 50,
    });
  }

  getAndamentosNaoVinculados(officeId: string) {
    return { data: [], officeId };
  }

  getTribunais() {
    return this.listarTribunais();
  }

  async getTribunalStatus(sigla: string) {
    const indice = TRIBUNAL_INDEX[sigla.toUpperCase()];
    if (!indice) {
      return { sigla, status: 'nao_suportado', suportado: false };
    }

    try {
      await this.http.get(`/${indice}/_count`);
      return { sigla, status: 'online', suportado: true };
    } catch {
      return { sigla, status: 'offline_ou_degradado', suportado: true };
    }
  }

  getConfig(officeId: string) {
    return {
      officeId,
      config: {
        baseUrl:             this.baseUrl,
        apiKeyConfigurada:   !!this.config.get('DATAJUD_API_KEY'),
        frequenciaSyncHoras: 6,
        tribunaisSuportados: Object.keys(TRIBUNAL_INDEX).length,
      },
    };
  }

  updateConfig(officeId: string, dto: any) {
    return { message: 'Config updated', officeId, dto };
  }

  // ── Utilidades ──────────────────────────────────────────────────────────────

  /** Formata os dados brutos da API para exibição padronizada */
  private formatarProcesso(dados: any): any {
    return {
      numeroProcesso:     dados.numeroProcesso,
      classe:             dados.classe?.nome ?? null,
      assuntos:           (dados.assuntos ?? []).map((a: any) => a.nome),
      tribunal:           dados.tribunal,
      grau:               dados.grau,
      sistema:            dados.sistema?.nome ?? null,
      formato:            dados.formato?.nome ?? null,
      dataAjuizamento:    dados.dataAjuizamento ?? null,
      ultimaAtualizacao:  dados.dataHoraUltimaAtualizacao ?? null,
      partes:             (dados.partes ?? []).map((p: any) => ({
        polo:       p.polo,
        nome:       p.nome,
        tipo:       p.tipo,
        advogados:  (p.advogados ?? []).map((adv: any) => ({
          nome:        adv.nome,
          oab:         adv.numeroOAB,
          estado:      adv.estadoOAB,
        })),
      })),
      movimentos: (dados.movimentos ?? [])
        .sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime())
        .slice(0, 20)
        .map((m: any) => ({
          data:      m.dataHora,
          descricao: m.nome,
        })),
    };
  }

  /** Infere o tribunal a partir dos dígitos do número CNJ (heurística simplificada) */
  private inferirTribunalPorCodigo(codigoJustica: string, codigoOrgao: string): string | null {
    // Código de justiça: 8 = Estadual, 5 = TRF, 4 = TRT, 3 = STJ, 1 = STF
    const cod = parseInt(codigoJustica, 10);
    if (cod === 1) return 'STF';
    if (cod === 3) return 'STJ';
    if (cod === 5) {
      const orgao = parseInt(codigoOrgao, 10);
      if (orgao <= 9)  return `TRF${orgao}`;
    }
    // Estadual: não podemos inferir sem o código do tribunal — retorna null
    return null;
  }
}
