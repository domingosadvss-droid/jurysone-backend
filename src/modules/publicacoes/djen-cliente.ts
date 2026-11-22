/**
 * JURYSONE — Cliente da API pública do DJEN (Comunica PJe / CNJ)
 *
 * Particularidades tratadas (conhecidas de produção):
 *   • 403 para IP fora do Brasil: o servidor precisa estar no Brasil ou usar DJEN_API_URL
 *     apontando para um repasse (proxy) hospedado no Brasil.
 *   • itensPorPagina máximo 50 (acima disso volta vazio, sem erro).
 *   • Página vazia no meio da paginação é transitória: repete a mesma página.
 *   • A OAB é comparada por texto exato e cada tribunal grava com um sufixo: consulta as variantes.
 *   • Resultado limitado a ~10.000 por consulta: janelas de no máximo 31 dias.
 *   • Deduplicação pelo campo `id`.
 */
import axios, { AxiosInstance } from 'axios';
import { somarDias } from './calendario';

export const SUFIXOS_OAB = ['', '-O', '-A', '-N', '-B', '-S', '-E'];
const POR_PAGINA = 50;
const MAX_PAGINAS = 200;
const TENTATIVAS_PAGINA = 2;

// ── Limite de consultas do DJEN ──────────────────────────────────────────────
// A API informa X-RateLimit-Limit (20) e X-RateLimit-Remaining por janela de tempo.
// Controle compartilhado por todo o servidor (busca na tela, captura diária e sincronização):
// quando as consultas restantes acabam, espera a janela liberar em vez de levar 429.
const ESPERA_LIMITE_MS = 30_000;
const TENTATIVAS_LIMITE = 3;
const INTERVALO_MINIMO_MS = 150;
let liberadoEm = 0;
let fila: Promise<void> = Promise.resolve();

function bloquearAte(instante: number) {
  liberadoEm = Math.max(liberadoEm, instante);
}

function registrarLimite(headers: any) {
  const restantes = Number(headers?.['x-ratelimit-remaining']);
  if (Number.isFinite(restantes) && restantes <= 1) bloquearAte(Date.now() + ESPERA_LIMITE_MS);
}

/** Uma consulta por vez, respeitando o intervalo mínimo e eventuais bloqueios pelo limite */
function aguardarVez(): Promise<void> {
  const vez = fila.then(async () => {
    const espera = Math.max(liberadoEm - Date.now(), 0);
    if (espera) await new Promise((r) => setTimeout(r, espera));
    liberadoEm = Date.now() + INTERVALO_MINIMO_MS;
  });
  fila = vez.catch(() => undefined);
  return vez;
}

export interface ComunicacaoDjen {
  id: string;
  hash: string | null;
  numeroProcesso: string; // 20 dígitos
  numeroComMascara: string | null;
  tribunal: string;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  orgao: string | null;
  classe: string | null;
  dataDisponibilizacao: string; // AAAA-MM-DD
  texto: string;
  link: string | null;
  motivoCancelamento: string | null;
  destinatarios: { nome: string; polo: string | null }[];
  advogados: { nome: string; oab: string; uf: string }[];
}

export class ErroDjen extends Error {
  constructor(msg: string, readonly status?: number) {
    super(msg);
  }
}

function normalizar(item: any): ComunicacaoDjen | null {
  if (!item || item.id === undefined || item.id === null) return null;
  const numero = String(item.numero_processo ?? item.numeroProcesso ?? '').replace(/\D/g, '');
  if (!numero) return null;
  const texto = String(item.texto ?? '');
  return {
    id: String(item.id),
    hash: item.hash ?? null,
    numeroProcesso: numero,
    numeroComMascara: item.numeroprocessocommascara ?? null,
    tribunal: String(item.siglaTribunal ?? item.sigla_tribunal ?? '').toUpperCase(),
    tipoComunicacao: item.tipoComunicacao ?? null,
    tipoDocumento: item.tipoDocumento ?? null,
    orgao: item.nomeOrgao ?? null,
    classe: item.nomeClasse ?? null,
    dataDisponibilizacao: String(item.data_disponibilizacao ?? item.datadisponibilizacao ?? '').slice(0, 10),
    // Teto de 200 mil caracteres preservando o início (onde está o comando da intimação)
    texto: texto.length > 200_000 ? texto.slice(0, 200_000) + '\n[texto truncado — ver link]' : texto,
    link: item.link ?? null,
    motivoCancelamento: item.motivo_cancelamento ?? null,
    destinatarios: (Array.isArray(item.destinatarios) ? item.destinatarios : []).map((d: any) => ({
      nome: String(d?.nome ?? '').trim(), polo: d?.polo ?? null,
    })).filter((d: any) => d.nome),
    advogados: (Array.isArray(item.destinatarioadvogados) ? item.destinatarioadvogados : []).map((a: any) => {
      const adv = a?.advogado ?? a ?? {};
      return { nome: String(adv.nome ?? '').trim(), oab: String(adv.numero_oab ?? '').replace(/\D/g, ''), uf: String(adv.uf_oab ?? '').toUpperCase() };
    }).filter((a: any) => a.oab),
  };
}

export class DjenCliente {
  private readonly http: AxiosInstance;

  constructor(baseUrl = process.env.DJEN_API_URL || 'https://comunicaapi.pje.jus.br', private readonly esperaMs = 1000) {
    this.http = axios.create({ baseURL: baseUrl.replace(/\/$/, ''), timeout: 20_000, headers: { Accept: 'application/json' } });
  }

  private async pagina(params: Record<string, string>, pagina: number): Promise<{ count: number; items: any[] }> {
    for (let tentativa = 0; ; tentativa++) {
      await aguardarVez();
      try {
        const resp = await this.http.get('/api/v1/comunicacao', { params: { ...params, pagina, itensPorPagina: POR_PAGINA } });
        registrarLimite(resp.headers);
        const data = resp.data;
        return { count: Number(data?.count ?? 0), items: Array.isArray(data?.items) ? data.items : [] };
      } catch (e: any) {
        const status = e?.response?.status;
        if (status === 429 && tentativa < TENTATIVAS_LIMITE) {
          // Limite de consultas do DJEN: espera a janela liberar e repete a mesma página
          const retry = Number(e?.response?.headers?.['retry-after']);
          bloquearAte(Date.now() + (retry > 0 ? retry * 1000 : ESPERA_LIMITE_MS * (tentativa + 1)));
          continue;
        }
        if (status === 403) throw new ErroDjen('DJEN recusou o acesso (403). A API só atende IPs do Brasil: hospede o servidor no Brasil ou configure DJEN_API_URL com um repasse no Brasil.', 403);
        if (status === 429) throw new ErroDjen('O DJEN está limitando as consultas (muitas em sequência). Aguarde um minuto e tente de novo, ou diminua o período.', 429);
        throw new ErroDjen(`Falha ao consultar o DJEN${status ? ` (HTTP ${status})` : ''}: ${e?.message ?? e}`, status);
      }
    }
  }

  /** Consulta com paginação tolerante; devolve itens normalizados e se a consulta foi completa */
  async consultar(params: Record<string, string>): Promise<{ itens: ComunicacaoDjen[]; completo: boolean }> {
    const brutos: any[] = [];
    let total: number | null = null;
    let tentativas = 0;
    for (let p = 1; p <= MAX_PAGINAS; p++) {
      const { count, items } = await this.pagina(params, p);
      if (total === null) total = count;
      if (items.length === 0) {
        if (brutos.length >= (total ?? 0)) break;
        if (tentativas >= TENTATIVAS_PAGINA) return { itens: this.unicos(brutos), completo: false };
        tentativas++;
        p--;
        await new Promise((r) => setTimeout(r, this.esperaMs * tentativas));
        continue;
      }
      tentativas = 0;
      brutos.push(...items);
      if (brutos.length >= (total ?? 0)) break;
    }
    return { itens: this.unicos(brutos), completo: true };
  }

  private unicos(brutos: any[]): ComunicacaoDjen[] {
    const vistos = new Map<string, ComunicacaoDjen>();
    for (const b of brutos) {
      const n = normalizar(b);
      if (!n) continue;
      // se veio duas vezes, a versão cancelada prevalece
      if (!vistos.has(n.id) || n.motivoCancelamento) vistos.set(n.id, n);
    }
    return [...vistos.values()];
  }

  /** Publicações de uma OAB em um período, varrendo as variantes de sufixo e em janelas de 31 dias */
  async porOab(oab: string, uf: string, inicio: string, fim: string): Promise<{ itens: ComunicacaoDjen[]; completo: boolean }> {
    const numero = String(oab).replace(/\D/g, '');
    const todos = new Map<string, ComunicacaoDjen>();
    let completo = true;
    for (let ini = inicio; ini <= fim; ini = somarDias(ini, 31)) {
      const fimJanela = somarDias(ini, 30) < fim ? somarDias(ini, 30) : fim;
      for (const suf of SUFIXOS_OAB) {
        const r = await this.consultar({
          numeroOab: numero + suf, ufOab: uf.toUpperCase(),
          dataDisponibilizacaoInicio: ini, dataDisponibilizacaoFim: fimJanela,
        });
        completo = completo && r.completo;
        for (const i of r.itens) if (!todos.has(i.id) || i.motivoCancelamento) todos.set(i.id, i);
      }
    }
    return { itens: [...todos.values()], completo };
  }

  async porProcesso(numeroProcesso: string): Promise<ComunicacaoDjen[]> {
    const r = await this.consultar({ numeroProcesso: String(numeroProcesso).replace(/\D/g, '') });
    return r.itens;
  }

  /**
   * Busca livre no DJEN (fonte única de consulta processual do JurysOne).
   * Filtros aceitos pela API: número do processo, OAB (+UF), nome da parte, nome do advogado e tribunal.
   * Sem número de processo, o período é obrigatório e é varrido em janelas de 31 dias
   * (limitado a MAX_DIAS_BUSCA para não sobrecarregar a API).
   */
  async buscar(f: BuscaDjen): Promise<{ itens: ComunicacaoDjen[]; completo: boolean; inicio?: string; fim?: string }> {
    const numero = String(f.numeroProcesso ?? '').replace(/\D/g, '');
    if (numero) return { itens: await this.porProcesso(numero), completo: true };
    const base: Record<string, string> = {};
    if (f.siglaTribunal) base.siglaTribunal = String(f.siglaTribunal).toUpperCase();
    if (f.nomeParte) base.nomeParte = String(f.nomeParte).trim();
    if (f.nomeAdvogado) base.nomeAdvogado = String(f.nomeAdvogado).trim();
    const oab = String(f.numeroOab ?? '').replace(/\D/g, '');
    if (oab && !f.ufOab) throw new ErroDjen('Informe a UF da OAB.');
    if (!oab && !base.nomeParte && !base.nomeAdvogado) {
      throw new ErroDjen('Informe o número do processo, a OAB (com UF), o nome da parte ou o nome do advogado.');
    }
    const fim = f.fim ?? new Date().toISOString().slice(0, 10);
    let inicio = f.inicio ?? somarDias(fim, -30);
    if (somarDias(inicio, MAX_DIAS_BUSCA) < fim) inicio = somarDias(fim, -MAX_DIAS_BUSCA);
    if (oab) {
      const r = await this.porOab(oab, String(f.ufOab), inicio, fim);
      const itens = base.siglaTribunal ? r.itens.filter((i) => i.tribunal === base.siglaTribunal) : r.itens;
      return { itens, completo: r.completo, inicio, fim };
    }
    const todos = new Map<string, ComunicacaoDjen>();
    let completo = true;
    for (let ini = inicio; ini <= fim; ini = somarDias(ini, 31)) {
      const fimJanela = somarDias(ini, 30) < fim ? somarDias(ini, 30) : fim;
      const r = await this.consultar({ ...base, dataDisponibilizacaoInicio: ini, dataDisponibilizacaoFim: fimJanela });
      completo = completo && r.completo;
      for (const i of r.itens) if (!todos.has(i.id) || i.motivoCancelamento) todos.set(i.id, i);
    }
    return { itens: [...todos.values()], completo, inicio, fim };
  }
}

/** Período máximo de uma busca livre (sem número de processo) */
export const MAX_DIAS_BUSCA = 365;

export interface BuscaDjen {
  numeroProcesso?: string;
  numeroOab?: string;
  ufOab?: string;
  nomeParte?: string;
  nomeAdvogado?: string;
  siglaTribunal?: string;
  inicio?: string; // AAAA-MM-DD
  fim?: string;    // AAAA-MM-DD
}

/** Texto legível de uma comunicação: algumas vêm como página HTML inteira */
export function textoSemHtml(s: string): string {
  return String(s ?? '')
    .replace(/<(head|style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!DOCTYPE[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Agrupa comunicações por processo, do mais recente para o mais antigo (formato da tela de consulta) */
export function agruparPorProcesso(itens: ComunicacaoDjen[]) {
  const grupos = new Map<string, ComunicacaoDjen[]>();
  for (const c of itens) {
    const l = grupos.get(c.numeroProcesso) ?? [];
    l.push(c);
    grupos.set(c.numeroProcesso, l);
  }
  return [...grupos.entries()].map(([numero, lista]) => {
    lista.sort((a, b) => (a.dataDisponibilizacao < b.dataDisponibilizacao ? 1 : -1));
    const ultima = lista[0];
    const partes = new Map<string, { nome: string; polo: string | null }>();
    const advogados = new Map<string, { nome: string; oab: string; uf: string }>();
    for (const c of lista) {
      for (const d of c.destinatarios) if (!partes.has(d.nome)) partes.set(d.nome, d);
      for (const a of c.advogados) advogados.set(`${a.oab}/${a.uf}`, a);
    }
    return {
      numeroProcesso: ultima.numeroComMascara ?? numero,
      tribunal: ultima.tribunal,
      classe: ultima.classe,
      orgao: ultima.orgao,
      ultimaPublicacao: ultima.dataDisponibilizacao,
      partes: [...partes.values()],
      advogados: [...advogados.values()],
      comunicacoes: lista.map((c) => ({
        id: c.id, data: c.dataDisponibilizacao, tipo: c.tipoComunicacao, documento: c.tipoDocumento,
        cancelada: !!c.motivoCancelamento, resumo: textoSemHtml(c.texto).slice(0, 400), link: c.link,
      })),
    };
  }).sort((a, b) => (a.ultimaPublicacao < b.ultimaPublicacao ? 1 : -1));
}
