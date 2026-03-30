/**
 * JURYSONE — ParceirosService
 * Gerencia parceiros e advogados correspondentes do escritório
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ParceirosService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Listar ──────────────────────────────────────────────────────────────────

  async findAll(query: any, officeId: string) {
    const where: any = { escritorioId: officeId };

    if (query.ativo !== undefined) where.ativo = query.ativo === 'true';
    if (query.areaAtuacao) where.areaAtuacao = { contains: query.areaAtuacao, mode: 'insensitive' };
    if (query.estado) where.estado = query.estado;
    if (query.search) {
      where.OR = [
        { nome:       { contains: query.search, mode: 'insensitive' } },
        { email:      { contains: query.search, mode: 'insensitive' } },
        { oabNumero:  { contains: query.search, mode: 'insensitive' } },
        { cpfCnpj:    { contains: query.search, mode: 'insensitive' } },
        { cidade:     { contains: query.search, mode: 'insensitive' } },
        { areaAtuacao:{ contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page    = parseInt(query.page    ?? '1');
    const perPage = parseInt(query.per_page ?? '20');

    const [total, data] = await Promise.all([
      this.prisma.parceiro.count({ where }),
      this.prisma.parceiro.findMany({
        where,
        orderBy: { nome: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return { data, total, page, perPage, totalPages: Math.ceil(total / perPage) };
  }

  async findOne(id: string, officeId: string) {
    const item = await this.prisma.parceiro.findFirst({ where: { id, escritorioId: officeId } });
    if (!item) throw new NotFoundException(`Parceiro ${id} não encontrado`);
    return item;
  }

  // ── Criar ────────────────────────────────────────────────────────────────────

  async create(body: any, userId: string, officeId: string) {
    return this.prisma.parceiro.create({
      data: {
        escritorioId: officeId,
        criadoPorId: userId,
        nome:                body.nome,
        cpfCnpj:             body.cpfCnpj             ?? null,
        oabNumero:           body.oabNumero           ?? null,
        oabEstado:           body.oabEstado           ?? null,
        areaAtuacao:         body.areaAtuacao         ?? null,
        percentualHonorarios:body.percentualHonorarios != null
                               ? parseFloat(body.percentualHonorarios)
                               : null,
        email:               body.email               ?? null,
        telefone:            body.telefone            ?? null,
        whatsapp:            body.whatsapp            ?? null,
        endereco:            body.endereco            ?? null,
        cidade:              body.cidade              ?? null,
        estado:              body.estado              ?? null,
        cep:                 body.cep                 ?? null,
        banco:               body.banco               ?? null,
        agencia:             body.agencia             ?? null,
        conta:               body.conta               ?? null,
        pixChave:            body.pixChave            ?? null,
        observacoes:         body.observacoes         ?? null,
        ativo:               body.ativo               ?? true,
      },
    });
  }

  // ── Atualizar ────────────────────────────────────────────────────────────────

  async update(id: string, body: any, officeId: string) {
    await this.findOne(id, officeId);

    const data: any = {};
    const fields = [
      'nome','cpfCnpj','oabNumero','oabEstado','areaAtuacao',
      'email','telefone','whatsapp','endereco','cidade','estado','cep',
      'banco','agencia','conta','pixChave','observacoes','ativo',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = body[f];
    }
    if (body.percentualHonorarios !== undefined) {
      data.percentualHonorarios = body.percentualHonorarios != null
        ? parseFloat(body.percentualHonorarios)
        : null;
    }

    return this.prisma.parceiro.update({ where: { id }, data });
  }

  // ── Remover ──────────────────────────────────────────────────────────────────

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    await this.prisma.parceiro.delete({ where: { id } });
    return { success: true };
  }

  // ── Estatísticas ─────────────────────────────────────────────────────────────

  async getEstatisticas(officeId: string) {
    const [total, ativos, porArea] = await Promise.all([
      this.prisma.parceiro.count({ where: { escritorioId: officeId } }),
      this.prisma.parceiro.count({ where: { escritorioId: officeId, ativo: true } }),
      this.prisma.parceiro.groupBy({
        by: ['areaAtuacao'],
        where: { escritorioId: officeId } as any,
        _count: true,
        orderBy: { _count: { areaAtuacao: 'desc' } },
      }),
    ]);

    return {
      total,
      ativos,
      inativos: total - ativos,
      porArea: porArea.map(a => ({ area: a.areaAtuacao ?? 'Não informado', total: a._count })),
    };
  }
}
