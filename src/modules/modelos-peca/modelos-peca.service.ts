import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ModelosPecaService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: any, officeId: string) {
    const where: any = { escritorioId: officeId, ativo: true };
    if (query.area)     where.area     = query.area;
    if (query.tipoPeca) where.tipoPeca = query.tipoPeca;
    if (query.search) {
      where.OR = [
        { titulo: { contains: query.search, mode: 'insensitive' } },
        { conteudo: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.modeloPeca.findMany({
      where,
      select: {
        id: true, area: true, tipoPeca: true, titulo: true,
        variaveis: true, usos: true, createdAt: true,
      },
      orderBy: [{ usos: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string, officeId: string) {
    const modelo = await this.prisma.modeloPeca.findFirst({
      where: { id, escritorioId: officeId },
    });
    if (!modelo) throw new NotFoundException(`Modelo de peça ${id} não encontrado`);
    return modelo;
  }

  async create(body: any, userId: string, officeId: string) {
    return this.prisma.modeloPeca.create({
      data: {
        escritorioId: officeId,
        criadoPorId:  userId,
        area:         body.area,
        tipoPeca:     body.tipoPeca ?? body.tipo_peca ?? 'outro',
        titulo:       body.titulo,
        conteudo:     body.conteudo,
        variaveis:    body.variaveis ?? null,
        ativo:        true,
      },
    });
  }

  async update(id: string, body: any, officeId: string) {
    const modelo = await this.prisma.modeloPeca.findFirst({ where: { id, escritorioId: officeId } });
    if (!modelo) throw new NotFoundException(`Modelo de peça ${id} não encontrado`);

    const data: any = {};
    if (body.titulo)   data.titulo   = body.titulo;
    if (body.conteudo) data.conteudo = body.conteudo;
    if (body.area)     data.area     = body.area;
    if (body.tipoPeca ?? body.tipo_peca) data.tipoPeca = body.tipoPeca ?? body.tipo_peca;
    if (body.variaveis !== undefined)    data.variaveis = body.variaveis;
    if (body.ativo     !== undefined)    data.ativo     = body.ativo;

    return this.prisma.modeloPeca.update({ where: { id }, data });
  }

  async remove(id: string, officeId: string) {
    const modelo = await this.prisma.modeloPeca.findFirst({ where: { id, escritorioId: officeId } });
    if (!modelo) throw new NotFoundException(`Modelo de peça ${id} não encontrado`);
    await this.prisma.modeloPeca.update({ where: { id }, data: { ativo: false } });
    return { message: 'Modelo arquivado' };
  }

  async usarModelo(id: string, variaveis: Record<string, string>, officeId: string) {
    const modelo = await this.findOne(id, officeId);

    // Incrementar contador de usos
    await this.prisma.modeloPeca.update({ where: { id }, data: { usos: { increment: 1 } } });

    // Substituir variáveis no conteúdo
    let conteudo = modelo.conteudo;
    if (variaveis && typeof variaveis === 'object') {
      for (const [chave, valor] of Object.entries(variaveis)) {
        const regex = new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, 'g');
        conteudo = conteudo.replace(regex, valor ?? '');
      }
    }

    return { ...modelo, conteudo };
  }

  // Tipos de peças suportados (para o frontend popular selects)
  getTipos() {
    return {
      areas: [
        { id: 'trabalhista',    nome: 'Trabalhista' },
        { id: 'civil',          nome: 'Cível' },
        { id: 'previdenciario', nome: 'Previdenciário' },
        { id: 'tributario',     nome: 'Tributário' },
        { id: 'empresarial',    nome: 'Empresarial' },
        { id: 'criminal',       nome: 'Criminal' },
        { id: 'familia',        nome: 'Família' },
      ],
      tiposPeca: [
        { id: 'peticao_inicial',  nome: 'Petição Inicial' },
        { id: 'contestacao',      nome: 'Contestação' },
        { id: 'recurso',          nome: 'Recurso' },
        { id: 'memoriais',        nome: 'Memoriais' },
        { id: 'contrarrazoes',    nome: 'Contrarrazões' },
        { id: 'habeas_corpus',    nome: 'Habeas Corpus' },
        { id: 'mandado_seguranca',nome: 'Mandado de Segurança' },
        { id: 'embargos',         nome: 'Embargos' },
        { id: 'impugnacao',       nome: 'Impugnação' },
        { id: 'outro',            nome: 'Outro' },
      ],
    };
  }
}
