/**
 * JURYSONE — Base de conhecimento do escritório (etapa 3 da análise de 22/11/2026).
 *
 *   • Guarda modelos de peça, peças já feitas, FAQ, orientações e legislação, em texto colado
 *     ou arquivo (PDF/DOCX/TXT). Arquivos passam pela varredura de prompt injection: com achados,
 *     o documento fica guardado mas BLOQUEADO para a IA.
 *   • O texto vira trechos de ~1.200 caracteres com busca em português do próprio Postgres
 *     (tsvector + GIN), sem serviço pago de "embeddings". A busca usa OU entre as palavras e
 *     ordena por relevância, então funciona com frases naturais ("quanto tempo demora o processo").
 *   • Quem usa: a tela de busca; a IA do WhatsApp (só documentos marcados "usoAtendimento");
 *     os rascunhos de peça do Opus (modelos e peças do escritório como referência de estilo).
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS_GESTAO, temPerfil } from '../../common/perfis';
import { varrerDocumento } from '../../common/varredura-documento';
import { dividirEmTrechos, extrairTexto } from '../../common/extrair-texto';

export const TIPOS_CONHECIMENTO = ['FAQ', 'ORIENTACAO', 'MODELO_PECA', 'PECA', 'LEGISLACAO', 'OUTRO'];
const TEXTO_MAXIMO = 400_000;

export interface TrechoEncontrado {
  id: string; documentoId: string; titulo: string; tipo: string; texto: string; destaque: string; relevancia: number;
}

@Injectable()
export class ConhecimentoService {
  private readonly logger = new Logger(ConhecimentoService.name);

  constructor(private readonly prisma: PrismaService) {}

  private gestao(user: any) {
    if (!temPerfil(user, PERFIS_GESTAO)) throw new ForbiddenException('Só advogados de gestão alteram a base de conhecimento.');
  }

  private campos(dto: any, parcial = false) {
    const d: Record<string, any> = {};
    if (!parcial || dto?.titulo !== undefined) {
      const titulo = String(dto?.titulo ?? '').trim();
      if (titulo.length < 3) throw new BadRequestException('Informe um título.');
      d.titulo = titulo.slice(0, 200);
    }
    if (!parcial || dto?.tipo !== undefined) {
      const tipo = String(dto?.tipo ?? '').toUpperCase();
      if (!TIPOS_CONHECIMENTO.includes(tipo)) throw new BadRequestException(`Tipo inválido. Use: ${TIPOS_CONHECIMENTO.join(', ')}`);
      d.tipo = tipo;
    }
    if (dto?.area !== undefined) d.area = dto.area ? String(dto.area).toUpperCase().slice(0, 40) : null;
    if (dto?.usoAtendimento !== undefined) d.usoAtendimento = dto.usoAtendimento === true || dto.usoAtendimento === 'true';
    if (dto?.ativo !== undefined) d.ativo = dto.ativo === true || dto.ativo === 'true';
    return d;
  }

  /** Grava o documento e os trechos (substitui os trechos se já existir) */
  private async gravar(escritorioId: string, dados: any, texto: string) {
    const limpo = texto.trim().slice(0, TEXTO_MAXIMO);
    if (limpo.length < 20) throw new BadRequestException('Texto muito curto (ou arquivo sem texto legível — PDF escaneado não é lido).');
    const trechos = dividirEmTrechos(limpo);
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.conhecimentoDocumento.create({ data: { ...dados, escritorioId, texto: limpo } });
      await tx.conhecimentoTrecho.createMany({
        data: trechos.map((t, ordem) => ({ id: randomUUID(), escritorioId, documentoId: doc.id, ordem, texto: t })),
      });
      return { ...doc, trechos: trechos.length };
    });
  }

  async criarTexto(user: any, dto: any) {
    this.gestao(user);
    const dados = this.campos(dto);
    return this.gravar(user.officeId, { ...dados, origem: 'TEXTO', varredura: 'TEXTO', criadoPorId: user.id }, String(dto?.texto ?? ''));
  }

  async criarArquivo(user: any, arquivo: Express.Multer.File, dto: any) {
    this.gestao(user);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo no campo "arquivo".');
    const dados = this.campos(dto);
    const nome = arquivo.originalname || 'arquivo';
    const v = await varrerDocumento(arquivo.buffer, nome, arquivo.mimetype);
    let texto: string;
    try { texto = await extrairTexto(arquivo.buffer, nome, arquivo.mimetype); }
    catch (e: any) { throw new BadRequestException(e?.message ?? 'Não foi possível ler o arquivo.'); }
    const bloqueado = v.resultado === 'ACHADOS';
    const doc = await this.gravar(user.officeId, {
      ...dados, origem: 'ARQUIVO', nomeArquivo: nome.slice(0, 200), varredura: v.resultado, bloqueado,
      usoAtendimento: bloqueado ? false : !!dados.usoAtendimento, criadoPorId: user.id,
    }, texto);
    return {
      ...doc,
      aviso: bloqueado
        ? `A varredura encontrou ${v.achados.length} possível(is) instrução(ões) escondida(s) para IA (ex.: ${v.achados[0]?.camada}, ${v.achados[0]?.local}: "${v.achados[0]?.trecho?.slice(0, 160)}"). O documento foi guardado, mas a IA NÃO vai usá-lo.`
        : v.resultado === 'INCONCLUSIVO' ? `Varredura inconclusiva: ${v.observacoes.join(' ')}` : null,
    };
  }

  async listar(user: any, q: any = {}) {
    const where: any = { escritorioId: user.officeId };
    if (q?.tipo) where.tipo = String(q.tipo).toUpperCase();
    if (q?.ativo !== 'todos') where.ativo = true;
    const lista = await this.prisma.conhecimentoDocumento.findMany({
      where, orderBy: { updatedAt: 'desc' }, take: 500,
      select: { id: true, titulo: true, tipo: true, area: true, origem: true, nomeArquivo: true, usoAtendimento: true, varredura: true, bloqueado: true, ativo: true, createdAt: true, updatedAt: true, _count: { select: { trechos: true } } },
    });
    return lista.map(({ _count, ...d }) => ({ ...d, trechos: _count.trechos }));
  }

  async detalhe(user: any, id: string) {
    const d = await this.prisma.conhecimentoDocumento.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!d) throw new NotFoundException('Documento não encontrado.');
    return d;
  }

  async alterar(user: any, id: string, dto: any) {
    this.gestao(user);
    const d = await this.detalhe(user, id);
    const dados = this.campos(dto, true);
    if (d.bloqueado && dados.usoAtendimento) throw new BadRequestException('Documento bloqueado pela varredura: a IA não pode usá-lo.');
    return this.prisma.conhecimentoDocumento.update({ where: { id }, data: dados });
  }

  async remover(user: any, id: string) {
    this.gestao(user);
    await this.detalhe(user, id);
    await this.prisma.conhecimentoDocumento.delete({ where: { id } });
    return { removido: true };
  }

  /**
   * Busca em português. As palavras da consulta entram com OU (frase natural funciona) e o
   * resultado vem por relevância. Documentos bloqueados ou inativos nunca aparecem.
   */
  async buscar(escritorioId: string, consulta: string, opcoes: { tipos?: string[]; soAtendimento?: boolean; limite?: number; relevanciaMinima?: number } = {}): Promise<TrechoEncontrado[]> {
    const texto = String(consulta ?? '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (texto.length < 3) return [];
    const limite = Math.min(50, Math.max(1, opcoes.limite ?? 10));
    const filtroTipo = opcoes.tipos?.length ? Prisma.sql`AND d.tipo = ANY(${opcoes.tipos})` : Prisma.empty;
    const filtroAtend = opcoes.soAtendimento ? Prisma.sql`AND d."usoAtendimento" = true` : Prisma.empty;
    const linhas = await this.prisma.$queryRaw<any[]>`
      WITH q AS (
        SELECT NULLIF(replace(plainto_tsquery('portuguese', ${texto})::text, ' & ', ' | '), '') AS s
      )
      SELECT t.id, t."documentoId", d.titulo, d.tipo, t.texto,
             ts_rank(t.busca, q.s::tsquery) AS relevancia,
             ts_headline('portuguese', t.texto, q.s::tsquery, 'MaxWords=35, MinWords=12, MaxFragments=2, StartSel=«, StopSel=»') AS destaque
      FROM conhecimento_trechos t
      JOIN conhecimento_documentos d ON d.id = t."documentoId"
      CROSS JOIN q
      WHERE q.s IS NOT NULL AND t."escritorioId" = ${escritorioId} AND d.ativo AND NOT d.bloqueado
        AND t.busca @@ q.s::tsquery ${filtroTipo} ${filtroAtend}
      ORDER BY relevancia DESC
      LIMIT ${limite}`;
    const minimo = opcoes.relevanciaMinima ?? 0;
    return linhas
      .map((l) => ({ id: l.id, documentoId: l.documentoId, titulo: l.titulo, tipo: l.tipo, texto: l.texto, destaque: l.destaque, relevancia: Number(l.relevancia) }))
      .filter((l) => l.relevancia >= minimo);
  }

  buscarApi(user: any, q: any) {
    const tipos = q?.tipo ? String(q.tipo).toUpperCase().split(',').filter((t) => TIPOS_CONHECIMENTO.includes(t)) : undefined;
    return this.buscar(user.officeId, String(q?.q ?? ''), { tipos, limite: Number(q?.limite) || 15 });
  }

  /** Para a IA do WhatsApp: trechos genéricos (marcados para o atendimento) sobre a dúvida do cliente */
  async paraAtendimento(escritorioId: string, consulta: string) {
    return this.buscar(escritorioId, consulta, { soAtendimento: true, limite: 3, relevanciaMinima: 0.02 });
  }

  /** Para rascunhos de peça: modelos e peças do escritório parecidos com o pedido */
  async paraRascunho(escritorioId: string, consulta: string) {
    return this.buscar(escritorioId, consulta, { tipos: ['MODELO_PECA', 'PECA'], limite: 4, relevanciaMinima: 0.01 });
  }
}
