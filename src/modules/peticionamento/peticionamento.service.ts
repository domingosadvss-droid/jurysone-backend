/**
 * Peticionamento Eletrônico — JurysOne
 *
 * Gerencia o ciclo de vida de petições eletrônicas:
 *   1. Recebe PDF do advogado (via URL no Supabase Storage)
 *   2. Tenta protocolo via PJe (API PCP/CNJ) quando o tribunal suporta
 *   3. Registra status e número de protocolo no banco (tabela protocolos)
 *   4. Outros tribunais (e-SAJ, PROJUDI) → status "requer_automacao"
 *
 * IMPORTANTE: A tabela `protocolos` é criada pela migration
 *   src/database/migrations/20260430000001_add_protocolos/migration.sql
 * Após aplicar a migration rode `npx prisma generate` para o Prisma reconhecer
 * o novo model via `prisma.protocolo.*`.
 *
 * Enquanto o Prisma client não for regenerado, este service usa $queryRaw / $executeRaw.
 *
 * Variáveis de ambiente:
 *   PJE_API_BASE_URL — base da API PCP (default: https://comunicaapi.pje.jus.br/api/v1)
 *   PJE_API_KEY      — chave de acesso à API PCP (opcional)
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import axios, { AxiosInstance } from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Tribunais com suporte à API PCP do CNJ (PJe)
const TRIBUNAIS_PJE = new Set([
  'TRF1', 'TRF2', 'TRF3', 'TRF4', 'TRF5', 'TRF6',
  'TRT1', 'TRT2', 'TRT3', 'TRT4', 'TRT5', 'TRT6',
  'TRT7', 'TRT8', 'TRT15',
  'TJBA', 'TJCE', 'TJMA', 'TJMG', 'TJPA', 'TJPB',
  'TJPE', 'TJPI', 'TJRN', 'TJRO', 'TJSE', 'TJTO',
]);

@Injectable()
export class PeticionamentoService {
  private readonly logger = new Logger(PeticionamentoService.name);
  private readonly pjeHttp: AxiosInstance;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const pjeBase = this.config.get<string>('PJE_API_BASE_URL', 'https://comunicaapi.pje.jus.br/api/v1');
    const pjeKey  = this.config.get<string>('PJE_API_KEY', '');

    this.pjeHttp = axios.create({
      baseURL: pjeBase,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        ...(pjeKey ? { Authorization: `Bearer ${pjeKey}` } : {}),
      },
    });
  }

  // ── Helpers RAW ──────────────────────────────────────────────────────────────

  /** Executa INSERT e retorna o protocolo criado */
  private async insertProtocolo(data: {
    id: string;
    escritorioId: string;
    processoId: string | null;
    advogadoId: string;
    tribunal: string;
    tipoPeticao: string;
    arquivoUrl: string | null;
    status: string;
  }): Promise<any> {
    await this.prisma.$executeRaw`
      INSERT INTO "protocolos"
        ("id","escritorioId","processoId","advogadoId","tribunal","tipoPeticao","arquivoUrl","status","updatedAt")
      VALUES
        (${data.id},${data.escritorioId},${data.processoId},${data.advogadoId},
         ${data.tribunal},${data.tipoPeticao},${data.arquivoUrl},${data.status},NOW())
    `;
    return this.findRawById(data.id);
  }

  private async findRawById(id: string): Promise<any> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT p.*,
             pr."numero" AS "processoNumero",
             pr."titulo" AS "processoTitulo"
      FROM "protocolos" p
      LEFT JOIN "processes" pr ON pr.id = p."processoId"
      WHERE p.id = ${id}
        AND p."deletedAt" IS NULL
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async updateProtocolo(id: string, fields: Record<string, any>): Promise<void> {
    const sets  = Object.entries(fields)
      .map(([k]) => `"${k}" = $${k}`)
      .join(', ');
    // Usa executeRawUnsafe para montar update dinâmico com segurança (sem interpolação de user data)
    const keys   = Object.keys(fields);
    const values = Object.values(fields);

    // Constrói a query parametrizada via tagged template não é possível dinamicamente,
    // por isso usamos uma abordagem com Prisma.sql
    let query = Prisma.sql`UPDATE "protocolos" SET "updatedAt" = NOW()`;
    for (let i = 0; i < keys.length; i++) {
      query = Prisma.sql`${query}, ${Prisma.raw(`"${keys[i]}"`)}) = ${values[i]}`;
    }

    // Forma segura via prisma.$executeRaw com Prisma.sql
    const setClauses = keys.map((k, i) => Prisma.sql`${Prisma.raw(`"${k}"`)} = ${values[i]}`);
    const setClause  = Prisma.join(setClauses, ', ');

    await this.prisma.$executeRaw`
      UPDATE "protocolos"
      SET ${setClause}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;
  }

  // ── API pública ──────────────────────────────────────────────────────────────

  async findAll(escritorioId: string, query: any) {
    const page   = Math.max(1, Number(query.page ?? 1));
    const limit  = Math.min(100, Number(query.limit ?? 20));
    const offset = (page - 1) * limit;

    let whereExtra = Prisma.sql``;
    if (query.status)     whereExtra = Prisma.sql`${whereExtra} AND p.status = ${query.status}`;
    if (query.tribunal)   whereExtra = Prisma.sql`${whereExtra} AND p.tribunal = ${(query.tribunal as string).toUpperCase()}`;
    if (query.processoId) whereExtra = Prisma.sql`${whereExtra} AND p."processoId" = ${query.processoId}`;

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT p.*,
             pr.numero AS "processoNumero",
             pr.titulo AS "processoTitulo"
      FROM "protocolos" p
      LEFT JOIN "processes" pr ON pr.id = p."processoId"
      WHERE p."escritorioId" = ${escritorioId}
        AND p."deletedAt" IS NULL
        ${whereExtra}
      ORDER BY p."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "protocolos"
      WHERE "escritorioId" = ${escritorioId} AND "deletedAt" IS NULL
    `;
    const total = Number(countRows[0]?.count ?? 0);

    return { data: rows, total, page, pages: Math.ceil(total / limit) };
  }

  async findById(id: string, escritorioId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT p.*,
             pr.numero AS "processoNumero",
             u.nome AS "advogadoNome", u.email AS "advogadoEmail"
      FROM "protocolos" p
      LEFT JOIN "processes" pr ON pr.id = p."processoId"
      LEFT JOIN "users"     u  ON u.id  = p."advogadoId"
      WHERE p.id = ${id}
        AND p."escritorioId" = ${escritorioId}
        AND p."deletedAt" IS NULL
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Protocolo não encontrado');
    return rows[0];
  }

  async protocolar(user: any, dto: any) {
    const { processo_id, tribunal, tipo_peticao, arquivo_url } = dto;

    if (!tribunal || !tipo_peticao || !arquivo_url) {
      throw new BadRequestException('tribunal, tipo_peticao e arquivo_url são obrigatórios');
    }

    const tribunalUpper = (tribunal as string).toUpperCase();
    let processoNumero: string | null = null;

    if (processo_id) {
      const proc = await this.prisma.processo.findFirst({
        where: { id: processo_id, escritorioId: user.officeId, deletedAt: null },
      });
      if (!proc) throw new NotFoundException('Processo não encontrado');
      processoNumero = proc.numero;
    }

    const id = uuidv4();
    await this.insertProtocolo({
      id,
      escritorioId:  user.officeId,
      processoId:    processo_id ?? null,
      advogadoId:    user.id,
      tribunal:      tribunalUpper,
      tipoPeticao:   tipo_peticao,
      arquivoUrl:    arquivo_url,
      status:        'pendente',
    });

    this.logger.log(`Protocolo ${id} criado — tribunal: ${tribunalUpper}`);

    if (TRIBUNAIS_PJE.has(tribunalUpper)) {
      // Dispara envio PJe em background
      this.enviarViaPJe(id, processoNumero ?? '', arquivo_url, tribunalUpper).catch(
        (err) => this.logger.error(`Erro PJe [${id}]: ${err.message}`),
      );
    } else {
      await this.prisma.$executeRaw`
        UPDATE "protocolos"
        SET status = 'requer_automacao',
            "respostaTribunal" = ${JSON.stringify({
              mensagem: `${tribunalUpper} não possui API pública. Protocolo via automação pendente.`,
              tribunalSuportado: false,
            })}::jsonb,
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;
    }

    return this.findRawById(id);
  }

  private async enviarViaPJe(
    protocoloId: string,
    numeroProcesso: string,
    arquivoUrl: string,
    tribunal: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE "protocolos" SET status = 'enviado', "updatedAt" = NOW() WHERE id = ${protocoloId}
      `;

      const { data: resposta } = await this.pjeHttp.post('/protocolo', {
        numeroProcesso,
        urlDocumento: arquivoUrl,
        tribunal,
      });

      const numeroProtocolo = resposta?.numeroProtocolo ?? resposta?.id ?? null;
      const respostaJson    = JSON.stringify(resposta ?? {});

      await this.prisma.$executeRaw`
        UPDATE "protocolos"
        SET status           = 'protocolado',
            "numeroProtocolo" = ${numeroProtocolo},
            "dataProtocolo"   = NOW(),
            "respostaTribunal"= ${respostaJson}::jsonb,
            "updatedAt"       = NOW()
        WHERE id = ${protocoloId}
      `;

      this.logger.log(`Protocolo ${protocoloId} efetivado — nº ${numeroProtocolo}`);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg    = err?.response?.data?.message ?? err.message;
      const erroJson = JSON.stringify(err?.response?.data ?? {});

      await this.prisma.$executeRaw`
        UPDATE "protocolos"
        SET status           = 'erro',
            "erroMensagem"   = ${`HTTP ${status ?? '?'}: ${msg}`},
            "respostaTribunal"= ${erroJson}::jsonb,
            "updatedAt"       = NOW()
        WHERE id = ${protocoloId}
      `;
    }
  }

  async getComprovante(id: string, escritorioId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM "protocolos"
      WHERE id = ${id} AND "escritorioId" = ${escritorioId} AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Protocolo não encontrado');
    const p = rows[0];

    if (p.status !== 'protocolado' || !p.numeroProtocolo) {
      return {
        disponivel: false,
        status:     p.status,
        mensagem:   'Comprovante disponível apenas após protocolo confirmado pelo tribunal.',
      };
    }

    return {
      disponivel:       true,
      numeroProtocolo:  p.numeroProtocolo,
      dataProtocolo:    p.dataProtocolo,
      tribunal:         p.tribunal,
      tipoPeticao:      p.tipoPeticao,
      arquivoUrl:       p.arquivoUrl,
      respostaTribunal: p.respostaTribunal,
    };
  }

  async remove(id: string, escritorioId: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT id FROM "protocolos" WHERE id = ${id} AND "escritorioId" = ${escritorioId} LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException('Protocolo não encontrado');

    await this.prisma.$executeRaw`
      UPDATE "protocolos" SET "deletedAt" = NOW(), "updatedAt" = NOW() WHERE id = ${id}
    `;
    return { removed: true, id };
  }
}
