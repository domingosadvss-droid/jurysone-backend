import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../../database/prisma.service';
import { cifrar, criptografiaConfigurada, decifrar } from '../../common/cripto';

const CHAVE_DB = 'api_keys';

/** Chaves que o sistema conhece (as demais continuam aceitas, mas sem nome amigável) */
export const CHAVES_CONHECIDAS: Record<string, string> = {
  anthropic: 'Claude (Anthropic)',
  zapsign: 'ZapSign',
  asaas: 'Asaas',
  clicksign: 'ClickSign',
  gemini: 'Gemini',
  whatsapp: 'WhatsApp (API antiga)',
  resend: 'Resend',
  pje: 'PJe',
  supabase: 'Supabase',
  google_calendar: 'Google Calendar',
  datajud: 'DataJud',
};

export interface SituacaoChave {
  id: string;
  nome: string;
  configurada: boolean;
  /** SERVIDOR = variável de ambiente (tem precedência); ESCRITORIO = salva pela tela */
  origem: 'SERVIDOR' | 'ESCRITORIO' | null;
  /** Só os 4 últimos caracteres, para o usuário reconhecer qual chave está salva */
  final: string | null;
}

/**
 * Chaves de API por escritório.
 * Gravadas CIFRADAS (AES-256-GCM, CHAVE_CRIPTOGRAFIA) na tabela settings, chave "api_keys".
 * Valores antigos em texto aberto são lidos normalmente e recifrados na primeira leitura.
 * Nenhuma rota devolve o valor de uma chave: a tela recebe só a situação (configurada, origem, final).
 */
@Injectable()
export class ChavesService {
  private readonly logger = new Logger(ChavesService.name);

  constructor(private readonly prisma: PrismaService) {}

  private envDe(id: string): string | undefined {
    const envMap: Record<string, string | undefined> = {
      clicksign:       process.env.CLICKSIGN_API_TOKEN,
      zapsign:         process.env.ZAPSIGN_API_TOKEN,
      asaas:           process.env.ASAAS_API_KEY,
      gemini:          process.env.GEMINI_API_KEY,
      anthropic:       process.env.ANTHROPIC_API_KEY,
      whatsapp:        process.env.WHATSAPP_API_KEY,
      resend:          process.env.RESEND_API_KEY,
      pje:             process.env.PJE_API_KEY,
      supabase:        process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
                         ? `${process.env.SUPABASE_URL}:${process.env.SUPABASE_SERVICE_KEY}`
                         : undefined,
      google_calendar: process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
                         ? `${process.env.GOOGLE_CLIENT_ID}:${process.env.GOOGLE_CLIENT_SECRET}`
                         : undefined,
    };
    return envMap[id] || undefined;
  }

  private async lerBruto(escritorioId: string): Promise<Record<string, string>> {
    const row = await this.prisma.configuracao.findFirst({ where: { escritorioId, chave: CHAVE_DB } });
    return (row?.valor as Record<string, string>) ?? {};
  }

  private async gravarBruto(escritorioId: string, valor: Record<string, string>) {
    await this.prisma.configuracao.upsert({
      where: { escritorioId_chave: { escritorioId, chave: CHAVE_DB } },
      create: { id: `${escritorioId}_${CHAVE_DB}`, escritorioId, chave: CHAVE_DB, valor, tipo: 'api_keys' },
      update: { valor },
    });
  }

  /** Salva/atualiza uma chave de API do escritório (sempre cifrada). Valor vazio remove a chave. */
  async salvar(escritorioId: string, id: string, chave: string) {
    const nome = String(id ?? '').trim();
    if (!/^[a-z0-9_]{2,40}$/.test(nome)) throw new BadRequestException('Identificador de chave inválido.');
    const valor = String(chave ?? '').trim();
    if (!valor) return this.remover(escritorioId, nome);
    if (!criptografiaConfigurada()) {
      throw new BadRequestException('O servidor está sem CHAVE_CRIPTOGRAFIA: a chave não pode ser guardada com segurança.');
    }
    const atual = await this.lerBruto(escritorioId);
    await this.gravarBruto(escritorioId, { ...atual, [nome]: cifrar(valor) });
    return { ok: true, situacao: await this.situacaoDe(escritorioId, nome) };
  }

  async remover(escritorioId: string, id: string) {
    const atual = await this.lerBruto(escritorioId);
    if (id in atual) {
      delete atual[id];
      await this.gravarBruto(escritorioId, atual);
    }
    return { ok: true, situacao: await this.situacaoDe(escritorioId, id) };
  }

  /**
   * Lê todas as chaves do escritório JÁ DECIFRADAS — uso interno do servidor, nunca devolver em rota.
   * Valores antigos em texto aberto são recifrados aqui.
   */
  async carregar(escritorioId: string): Promise<Record<string, string>> {
    const bruto = await this.lerBruto(escritorioId);
    const saida: Record<string, string> = {};
    let migrar = false;
    for (const [id, v] of Object.entries(bruto)) {
      if (!v) continue;
      if (String(v).startsWith('v1:')) {
        try { saida[id] = decifrar(String(v)); } catch { this.logger.warn(`Chave "${id}" não pôde ser decifrada (CHAVE_CRIPTOGRAFIA mudou?).`); }
      } else {
        saida[id] = String(v);
        migrar = true;
      }
    }
    if (migrar && criptografiaConfigurada()) {
      const novo: Record<string, string> = {};
      for (const [id, v] of Object.entries(bruto)) {
        if (!v) continue;
        novo[id] = String(v).startsWith('v1:') ? String(v) : cifrar(String(v));
      }
      await this.gravarBruto(escritorioId, novo);
      this.logger.log(`Chaves antigas em texto aberto do escritório ${escritorioId} foram cifradas.`);
    }
    return saida;
  }

  /** Retorna o valor de uma chave específica (variável de ambiente do servidor tem precedência) */
  async getChave(escritorioId: string, id: string): Promise<string | null> {
    const env = this.envDe(id);
    if (env) return env;
    const chaves = await this.carregar(escritorioId);
    return chaves[id] ?? null;
  }

  private async situacaoDe(escritorioId: string, id: string, chaves?: Record<string, string>): Promise<SituacaoChave> {
    const env = this.envDe(id);
    const doBanco = (chaves ?? (await this.carregar(escritorioId)))[id];
    const valor = env || doBanco || null;
    return {
      id,
      nome: CHAVES_CONHECIDAS[id] ?? id,
      configurada: !!valor,
      origem: env ? 'SERVIDOR' : doBanco ? 'ESCRITORIO' : null,
      final: valor && valor.length >= 12 ? valor.slice(-4) : valor ? '••••' : null,
    };
  }

  /** Situação de todas as chaves, SEM os valores (para a tela de Integrações) */
  async resumo(escritorioId: string): Promise<SituacaoChave[]> {
    const chaves = await this.carregar(escritorioId);
    const ids = Array.from(new Set([...Object.keys(CHAVES_CONHECIDAS), ...Object.keys(chaves)]));
    return Promise.all(ids.map((id) => this.situacaoDe(escritorioId, id, chaves)));
  }

  /** Testa a chave de verdade quando há um teste barato disponível (hoje: Claude, pela lista de modelos) */
  async verificar(escritorioId: string, id: string): Promise<{ ok: boolean | null; mensagem: string }> {
    const valor = await this.getChave(escritorioId, id);
    if (!valor) return { ok: false, mensagem: 'Nenhuma chave salva para esta integração.' };
    if (id !== 'anthropic') {
      return { ok: null, mensagem: 'A chave está salva. A verificação automática desta integração ainda não está disponível.' };
    }
    try {
      const cli = new Anthropic({ apiKey: valor, maxRetries: 0, timeout: 15_000 });
      const pagina = await cli.models.list({ limit: 1 });
      return { ok: true, mensagem: pagina.data?.length ? 'Chave do Claude aceita pela Anthropic.' : 'Chave aceita.' };
    } catch (e: any) {
      const status = e?.status;
      if (status === 401 || status === 403) return { ok: false, mensagem: 'A Anthropic recusou a chave (inválida ou sem permissão).' };
      return { ok: false, mensagem: `Não foi possível falar com a Anthropic agora${status ? ` (erro ${status})` : ''}.` };
    }
  }
}
