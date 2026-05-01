import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const CHAVE_DB = 'api_keys';

@Injectable()
export class ChavesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Salva/atualiza uma chave de API para o escritório */
  async salvar(escritorioId: string, id: string, chave: string) {
    // Carrega objeto existente
    const row = await this.prisma.configuracao.findFirst({
      where: { escritorioId, chave: CHAVE_DB },
    });
    const atual = (row?.valor as Record<string, string>) ?? {};
    const atualizado = { ...atual, [id]: chave };

    await this.prisma.configuracao.upsert({
      where: { escritorioId_chave: { escritorioId, chave: CHAVE_DB } },
      create: {
        id: `${escritorioId}_${CHAVE_DB}`,
        escritorioId,
        chave: CHAVE_DB,
        valor: atualizado,
        tipo: 'api_keys',
      },
      update: { valor: atualizado },
    });
    return { ok: true };
  }

  /** Lê todas as chaves de API do escritório */
  async carregar(escritorioId: string): Promise<Record<string, string>> {
    const row = await this.prisma.configuracao.findFirst({
      where: { escritorioId, chave: CHAVE_DB },
    });
    return (row?.valor as Record<string, string>) ?? {};
  }

  /** Retorna o valor de uma chave específica (env var tem precedência) */
  async getChave(escritorioId: string, id: string): Promise<string | null> {
    // 1. Env var tem precedência (configuração do servidor)
    const envMap: Record<string, string> = {
      clicksign:       process.env.CLICKSIGN_API_TOKEN,
      zapsign:         process.env.ZAPSIGN_TOKEN,
      asaas:           process.env.ASAAS_API_KEY,
      gemini:          process.env.GEMINI_API_KEY,
      datajud:         process.env.DATAJUD_API_KEY,
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
    if (envMap[id]) return envMap[id];

    // 2. Banco de dados (configurado pelo usuário na aba Integrações)
    const chaves = await this.carregar(escritorioId);
    return chaves[id] ?? null;
  }
}
