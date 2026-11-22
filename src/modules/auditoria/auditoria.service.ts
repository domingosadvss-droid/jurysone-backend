import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * JURYSONE — Auditoria
 *
 * Tudo o que acontece no sistema fica registrado em `audit_logs`: quem, o quê, quando (data e
 * hora), de qual IP e com qual navegador/aparelho. Os registros só são gravados — não há rota
 * para alterar nem apagar. Senhas, tokens e chaves são retirados antes de gravar.
 */

export type AcaoAuditoria =
  | 'LOGIN' | 'LOGIN_GOOGLE' | 'LOGIN_FALHOU' | 'LOGOUT'
  | 'PEDIDO_NOVA_SENHA' | 'SENHA_REDEFINIDA'
  | 'INCLUSAO' | 'ALTERACAO' | 'EXCLUSAO' | 'ACAO' | 'VISUALIZACAO';

export interface ContextoRequisicao {
  ip?: string | null;
  userAgent?: string | null;
}

/** IP real do cliente: Cloudflare → X-Forwarded-For (trust proxy) → conexão */
export function ipDaRequisicao(req: any): string | null {
  const cf = req?.headers?.['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const ip = req?.ips?.length ? req.ips[0] : req?.ip ?? req?.socket?.remoteAddress ?? null;
  return ip ? String(ip).replace(/^::ffff:/, '') : null;
}

export function contextoDa(req: any): ContextoRequisicao {
  return { ip: ipDaRequisicao(req), userAgent: String(req?.headers?.['user-agent'] ?? '').slice(0, 500) || null };
}

const CHAVE_SENSIVEL = /senha|password|passwd|token|secret|segredo|apikey|api_key|chave|authorization|cookie|refresh/i;
const LIMITE_TEXTO = 500;
const LIMITE_JSON = 8000;

/** Copia o corpo da requisição sem segredos e com textos longos (arquivos, base64) cortados */
export function limparPayload(valor: any, profundidade = 0): any {
  if (valor === null || valor === undefined) return valor;
  if (profundidade > 6) return '[…]';
  if (typeof valor === 'string') return valor.length > LIMITE_TEXTO ? `${valor.slice(0, LIMITE_TEXTO)}… (${valor.length} caracteres)` : valor;
  if (typeof valor !== 'object') return valor;
  if (Buffer.isBuffer(valor)) return `[arquivo ${valor.length} bytes]`;
  if (Array.isArray(valor)) {
    const itens = valor.slice(0, 50).map((v) => limparPayload(v, profundidade + 1));
    return valor.length > 50 ? [...itens, `… +${valor.length - 50} itens`] : itens;
  }
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(valor)) {
    out[k] = CHAVE_SENSIVEL.test(k) ? '[oculto]' : limparPayload(v, profundidade + 1);
  }
  return out;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Grava um registro. Nunca lança erro: falha de auditoria não pode derrubar a operação. */
  async registrar(r: {
    escritorioId: string | null | undefined;
    usuarioId?: string | null;
    acao: AcaoAuditoria;
    tipoEntidade?: string | null;
    idEntidade?: string | null;
    ctx?: ContextoRequisicao;
    detalhes?: Record<string, any>;
  }): Promise<void> {
    if (!r.escritorioId) return;
    try {
      let payload: any = r.detalhes ? limparPayload(r.detalhes) : undefined;
      if (payload !== undefined && JSON.stringify(payload).length > LIMITE_JSON) {
        payload = { resumo: JSON.stringify(payload).slice(0, LIMITE_JSON), cortado: true };
      }
      await this.prisma.logAuditoria.create({
        data: {
          escritorioId: r.escritorioId,
          usuarioId: r.usuarioId ?? null,
          acao: r.acao,
          tipoEntidade: r.tipoEntidade ?? null,
          idEntidade: r.idEntidade ? String(r.idEntidade).slice(0, 100) : null,
          ipAddress: r.ctx?.ip ?? null,
          userAgent: r.ctx?.userAgent ?? null,
          payload,
        },
      });
    } catch (e: any) {
      this.logger.error(`Falha ao gravar auditoria (${r.acao}): ${e?.message ?? e}`);
    }
  }

  /** Lista para a tela (só administrador), mais recentes primeiro */
  async listar(escritorioId: string, f: {
    usuarioId?: string; acao?: string; tipoEntidade?: string; de?: string; ate?: string; busca?: string;
    page?: number; limit?: number;
  }) {
    const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 500);
    const page = Math.max(Number(f.page) || 1, 1);
    const where: any = { escritorioId };
    if (f.usuarioId) where.usuarioId = f.usuarioId;
    if (f.acao) where.acao = f.acao;
    if (f.tipoEntidade) where.tipoEntidade = f.tipoEntidade;
    if (f.de || f.ate) {
      where.createdAt = {
        ...(f.de ? { gte: new Date(`${f.de}T00:00:00-03:00`) } : {}),
        ...(f.ate ? { lte: new Date(`${f.ate}T23:59:59.999-03:00`) } : {}),
      };
    }
    if (f.busca) {
      where.OR = [
        { idEntidade: { contains: f.busca, mode: 'insensitive' } },
        { ipAddress: { contains: f.busca } },
        { tipoEntidade: { contains: f.busca, mode: 'insensitive' } },
      ];
    }
    const [linhas, total] = await Promise.all([
      this.prisma.logAuditoria.findMany({
        where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: { usuario: { select: { id: true, nome: true, email: true, roles: true } } },
      }),
      this.prisma.logAuditoria.count({ where }),
    ]);
    return {
      total, page, pages: Math.ceil(total / limit),
      data: linhas.map((l) => ({ ...l, id: l.id.toString() })),
    };
  }

  /** Contadores do dia (Brasília) para os cartões da tela */
  async resumoHoje(escritorioId: string) {
    const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const desde = new Date(`${hoje}T00:00:00-03:00`);
    const grupos = await this.prisma.logAuditoria.groupBy({
      by: ['acao'], where: { escritorioId, createdAt: { gte: desde } }, _count: { _all: true },
    });
    const n = (acoes: string[]) => grupos.filter((g) => acoes.includes(g.acao)).reduce((s, g) => s + g._count._all, 0);
    return {
      eventosHoje: grupos.reduce((s, g) => s + g._count._all, 0),
      loginsHoje: n(['LOGIN', 'LOGIN_GOOGLE']),
      alteracoesHoje: n(['INCLUSAO', 'ALTERACAO', 'EXCLUSAO', 'ACAO']),
      alertasHoje: n(['LOGIN_FALHOU']),
    };
  }
}
