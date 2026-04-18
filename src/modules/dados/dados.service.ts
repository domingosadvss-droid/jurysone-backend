import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const CHAVE = 'dashboard_dados';

@Injectable()
export class DadosService {
  constructor(private readonly prisma: PrismaService) {}

  async carregar(escritorioId: string) {
    const row = await this.prisma.configuracao.findFirst({
      where: { escritorioId, chave: CHAVE },
    });

    if (!row) {
      return { ok: true, dados: {}, total: 0 };
    }

    const dados = row.valor as Record<string, any>;
    return { ok: true, dados, total: Object.keys(dados).length };
  }

  async salvar(escritorioId: string, payload: Record<string, any>) {
    await this.prisma.configuracao.upsert({
      where: {
        escritorioId_chave: { escritorioId, chave: CHAVE },
      },
      create: {
        id: `${escritorioId}_${CHAVE}`,
        escritorioId,
        chave: CHAVE,
        valor: payload,
        tipo: 'dashboard',
      },
      update: {
        valor: payload,
      },
    });

    return { ok: true, chaves_salvas: Object.keys(payload).length };
  }
}
