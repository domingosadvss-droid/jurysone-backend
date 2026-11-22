/**
 * JURYSONE — Calculadoras (etapa 5): cálculos guardados no caso, versões, atualização mensal,
 * saídas (Excel, Word, PDF), leitura de pagamentos por IA e chat de ajuste.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import * as z from 'zod/v4';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS, perfisDo } from '../../common/perfis';
import { varrerDocumento } from '../../common/varredura-documento';
import { IaIndisponivel } from '../../common/ia-claude';
import { IaUsoService } from '../ia-uso/ia-uso.service';
import { ArquivosService } from '../arquivos/arquivos.service';
import { ChavesService } from '../chaves/chaves.service';
import { AvisosService } from '../publicacoes/avisos.service';
import { CALCULADORAS, Calculadora, dataMaisAntiga, seriesNecessarias, validarParametros } from './calculadoras';
import { IndicesService } from './indices.service';
import { Resultado, hojeIso, moeda, novoContexto, somarMesesIso } from './nucleo';
import { gerarExcel } from './saidas/excel';
import { gerarMemoriaDocx, gerarMemoriaPdf } from './saidas/memoria';
import { aplicarAlteracoes, extrairPagamentos, interpretarAjuste } from './ia-calculos';

const VEEM_TUDO = [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO];
const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};
const LIMIAR_AVISO = 0.05;

@Injectable()
export class CalculosService {
  private readonly logger = new Logger(CalculosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly indices: IndicesService,
    private readonly arquivos: ArquivosService,
    private readonly chaves: ChavesService,
    private readonly avisos: AvisosService,
    private readonly iaUso: IaUsoService,
  ) {}

  // ═══════════════════════ CATÁLOGO E CÁLCULO ═════════════════════════════

  catalogo() {
    return Object.values(CALCULADORAS).map((c) => ({ tipo: c.tipo, nome: c.nome, parametros: z.toJSONSchema(c.schema, { io: 'input', unrepresentable: 'any' }) }));
  }

  private calc(tipo: string): Calculadora {
    const c = CALCULADORAS[String(tipo ?? '').toUpperCase()];
    if (!c) throw new BadRequestException(`Tipo de cálculo inválido. Use: ${Object.keys(CALCULADORAS).join(', ')}`);
    return c;
  }

  /** Executa a calculadora com os índices do BCB (cache + consulta) */
  async executar(escritorioId: string, calc: Calculadora, params: any): Promise<{ dados: any; resultado: Resultado; indices: any }> {
    const v = validarParametros(calc, params);
    if (!v.ok) throw new BadRequestException({ message: 'Parâmetros inválidos', erros: (v as any).erros });
    const dados = (v as any).dados;
    const avisosBcb: string[] = [];
    // 13 meses antes da data mais antiga: cobre reajustes anuais e períodos acumulados de 12 meses
    const indices = await this.indices.carregar(seriesNecessarias(calc, dados), somarMesesIso(dataMaisAntiga(dados), -13), avisosBcb);
    const extras: any = {};
    if (calc.tipo === 'VALOR_CAUSA') {
      const faixas = await this.prisma.custasFaixa.findMany({ where: { escritorioId, tribunal: dados.tribunal ?? 'TJSC', ato: dados.ato ?? 'INICIAL' } });
      extras.custas = faixas.map((f) => ({
        valorDe: Number(f.valorDe), valorAte: f.valorAte == null ? null : Number(f.valorAte), valorFixo: f.valorFixo == null ? null : Number(f.valorFixo),
        percentual: f.percentual == null ? null : Number(f.percentual), minimo: f.minimo == null ? null : Number(f.minimo), maximo: f.maximo == null ? null : Number(f.maximo),
        vigenciaDe: f.vigenciaDe.toISOString().slice(0, 10), fonte: f.fonte,
      }));
    }
    const resultado = calc.calcular(novoContexto(indices), dados, extras);
    resultado.avisos.unshift(...avisosBcb);
    return { dados, resultado, indices };
  }

  async simular(user: any, dto: any) {
    const calc = this.calc(dto?.tipo);
    const { resultado } = await this.executar(user.officeId, calc, dto?.parametros);
    return resultado;
  }

  // ═══════════════════════ ACESSO ═════════════════════════════════════════

  private async calculo(user: any, id: string) {
    const c = await this.prisma.calculo.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!c) throw new NotFoundException('Cálculo não encontrado');
    if (perfisDo(user).some((p) => VEEM_TUDO.includes(p as any))) return c;
    if (c.criadoPorId === user.id || c.responsavelId === user.id) return c;
    if (c.processoId) {
      const proc = await this.prisma.processo.findFirst({ where: { id: c.processoId, escritorioId: user.officeId }, select: { responsavelId: true } });
      if (proc?.responsavelId === user.id) return c;
    }
    throw new ForbiddenException('Cálculo de outro advogado.');
  }

  private async conferirProcesso(user: any, processoId?: string | null) {
    if (!processoId) return null;
    const p = await this.prisma.processo.findFirst({ where: { id: processoId, escritorioId: user.officeId, deletedAt: null }, select: { id: true, numero: true, clienteId: true, responsavelId: true } });
    if (!p) throw new NotFoundException('Processo não encontrado');
    return p;
  }

  // ═══════════════════════ CRUD E VERSÕES ═════════════════════════════════

  async criar(user: any, dto: any) {
    const calc = this.calc(dto?.tipo);
    const proc = await this.conferirProcesso(user, dto?.processoId);
    const params = { ...(dto?.parametros ?? {}) };
    if (dto?.extracaoId) {
      const ex = await this.prisma.extracaoPagamentos.findFirst({ where: { id: dto.extracaoId, escritorioId: user.officeId } });
      if (!ex) throw new NotFoundException('Leitura de pagamentos não encontrada');
      if (ex.status !== 'CONFERIDA') throw new BadRequestException('A tabela de pagamentos lida pela IA ainda não foi conferida pelo advogado (decisão 133).');
      const campo = calc.tipo === 'ATRASO_OBRA' ? null : 'pagamentos';
      if (!campo) throw new BadRequestException('Esta calculadora não recebe tabela de pagamentos.');
      if (!params[campo]?.length) params[campo] = ((ex.pagamentos as any[]) ?? []).map((p) => ({ data: p.data, valor: p.valor, descricao: p.descricao, ...(calc.tipo === 'DISTRATO' ? { tipo: p.tipo ?? 'PARCELA' } : {}) }));
    }
    const { dados, resultado } = await this.executar(user.officeId, calc, params);
    return this.prisma.$transaction(async (tx) => {
    const c = await tx.calculo.create({
      data: {
        escritorioId: user.officeId, processoId: proc?.id ?? null, clienteId: dto?.clienteId ?? proc?.clienteId ?? null,
        tipo: calc.tipo, titulo: String(dto?.titulo ?? resultado.titulo).slice(0, 200), criadoPorId: user.id,
        responsavelId: dto?.responsavelId ?? proc?.responsavelId ?? user.id, versaoAtual: 1,
        atualizarAuto: dto?.atualizarAuto !== false, ultimaAtualizacaoEm: new Date(),
      },
    });
    const versao = await this.novaVersao(c.id, 1, 'CRIACAO', dados, resultado, user.id, {}, tx);
    return { calculo: c, versao: this.versaoPublica(versao) };
    });
  }

  private async novaVersao(calculoId: string, numero: number, origem: string, dados: any, r: Resultado, por: string | null, extra: any = {}, db: any = this.prisma) {
    return db.calculoVersao.create({
      data: {
        calculoId, numero, origem, parametros: dados, resultado: r as any, totalPrincipal: r.totalPrincipal,
        dataBase: new Date(`${r.dataBase}T12:00:00Z`), indicesAte: r.indicesAte ?? null, criadoPorId: por, ...extra,
      },
    });
  }

  private versaoPublica(v: any) {
    return {
      id: v.id, numero: v.numero, origem: v.origem, parametros: v.parametros, resultado: v.resultado,
      totalPrincipal: v.totalPrincipal == null ? null : Number(v.totalPrincipal), dataBase: v.dataBase?.toISOString().slice(0, 10),
      indicesAte: v.indicesAte, juntada: v.juntada, juntadaEm: v.juntadaEm, documentosIds: v.documentosIds,
      mensagemChat: v.mensagemChat, explicacaoIa: v.explicacaoIa, createdAt: v.createdAt,
    };
  }

  async listar(user: any, q: any = {}) {
    const where: any = { escritorioId: user.officeId, arquivado: q?.arquivados === 'true' ? undefined : false };
    if (q?.processoId) where.processoId = String(q.processoId);
    if (q?.tipo) where.tipo = String(q.tipo).toUpperCase();
    if (!perfisDo(user).some((p) => VEEM_TUDO.includes(p as any))) {
      const procs = await this.prisma.processo.findMany({ where: { escritorioId: user.officeId, responsavelId: user.id }, select: { id: true } });
      where.OR = [{ criadoPorId: user.id }, { responsavelId: user.id }, { processoId: { in: procs.map((p) => p.id) } }];
    }
    const itens = await this.prisma.calculo.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 200 });
    if (!itens.length) return [];
    const atuais = await this.prisma.calculoVersao.findMany({
      where: { OR: itens.map((c) => ({ calculoId: c.id, numero: c.versaoAtual })) }, select: { calculoId: true, totalPrincipal: true, dataBase: true, juntada: true },
    });
    const porId = new Map(atuais.map((v) => [v.calculoId, v]));
    return itens.map((c) => ({ ...c, totalPrincipal: porId.get(c.id)?.totalPrincipal == null ? null : Number(porId.get(c.id)!.totalPrincipal), dataBase: porId.get(c.id)?.dataBase?.toISOString().slice(0, 10) }));
  }

  async obter(user: any, id: string) {
    const c = await this.calculo(user, id);
    const versoes = await this.prisma.calculoVersao.findMany({ where: { calculoId: c.id }, orderBy: { numero: 'asc' } });
    const atual = versoes.find((v) => v.numero === c.versaoAtual);
    return {
      calculo: c, atual: atual ? this.versaoPublica(atual) : null,
      versoes: versoes.map((v) => ({ numero: v.numero, origem: v.origem, totalPrincipal: v.totalPrincipal == null ? null : Number(v.totalPrincipal), dataBase: v.dataBase.toISOString().slice(0, 10), indicesAte: v.indicesAte, juntada: v.juntada, createdAt: v.createdAt })),
    };
  }

  async obterVersao(user: any, id: string, numero: number) {
    const c = await this.calculo(user, id);
    const v = await this.prisma.calculoVersao.findUnique({ where: { calculoId_numero: { calculoId: c.id, numero } } });
    if (!v) throw new NotFoundException('Versão não encontrada');
    return this.versaoPublica(v);
  }

  private async versaoAtual(c: any) {
    const v = await this.prisma.calculoVersao.findUnique({ where: { calculoId_numero: { calculoId: c.id, numero: c.versaoAtual } } });
    if (!v) throw new NotFoundException('Versão atual não encontrada');
    return v;
  }

  /** Gera nova versão a partir de novos parâmetros (as versões anteriores, juntadas ou não, nunca mudam) */
  private async registrarNova(c: any, origem: string, params: any, por: string | null, extra: any = {}) {
    const calc = this.calc(c.tipo);
    const { dados, resultado } = await this.executar(c.escritorioId, calc, params);
    const numero = c.versaoAtual + 1;
    return this.prisma.$transaction(async (tx) => {
      const v = await this.novaVersao(c.id, numero, origem, dados, resultado, por, extra, tx);
      await tx.calculo.update({ where: { id: c.id }, data: { versaoAtual: numero, ultimaAtualizacaoEm: new Date() } });
      return v;
    });
  }

  async ajustarManual(user: any, id: string, dto: any) {
    const c = await this.calculo(user, id);
    const atual = await this.versaoAtual(c);
    let params: any = atual.parametros;
    if (dto?.parametros && typeof dto.parametros === 'object') params = dto.parametros;
    if (Array.isArray(dto?.alteracoes)) {
      const { novo, erros } = aplicarAlteracoes(params, dto.alteracoes.map((a: any) => ({ caminho: String(a.caminho), valorJson: JSON.stringify(a.valor ?? null) })));
      if (erros.length) throw new BadRequestException({ message: 'Alterações inválidas', erros });
      params = novo;
    }
    const v = await this.registrarNova(c, 'AJUSTE_MANUAL', params, user.id);
    return this.versaoPublica(v);
  }

  /** Chat de ajuste (144): a IA só devolve alterações; o sistema valida e refaz a conta */
  async ajustarChat(user: any, id: string, dto: any) {
    const c = await this.calculo(user, id);
    const mensagem = String(dto?.mensagem ?? '').trim();
    if (!mensagem) throw new BadRequestException('Escreva o ajuste desejado em "mensagem".');
    const atual = await this.versaoAtual(c);
    const calc = this.calc(c.tipo);
    let ia;
    try {
      ia = await this.iaUso.executar(
        { escritorioId: c.escritorioId, tarefa: 'calculo_ajuste', categoria: 'PESADA', processoId: (c as any).processoId ?? null, usuarioId: user.id },
        (chave, aoUsar) => interpretarAjuste(chave, {
          tipo: calc.tipo, nomeCalculadora: calc.nome, parametros: atual.parametros, mensagem,
          esquema: z.toJSONSchema(calc.schema, { io: 'input', unrepresentable: 'any' }),
        }, aoUsar),
      );
    } catch (e: any) {
      if (e instanceof IaIndisponivel) throw new BadRequestException(e.message);
      throw new BadRequestException(`Não foi possível interpretar o ajuste: ${e?.message ?? e}`);
    }
    if (!ia.dados.entendeu || !ia.dados.alteracoes.length) return { aplicado: false, explicacao: ia.dados.explicacao, erros: [] };
    const { novo, erros } = aplicarAlteracoes(atual.parametros, ia.dados.alteracoes);
    const val = validarParametros(calc, novo);
    if (erros.length || !val.ok) return { aplicado: false, explicacao: ia.dados.explicacao, alteracoes: ia.dados.alteracoes, erros: [...erros, ...(((val as any).erros) ?? [])] };
    const v = await this.registrarNova(c, 'AJUSTE_CHAT', novo, user.id, { mensagemChat: mensagem.slice(0, 4000), explicacaoIa: ia.dados.explicacao.slice(0, 2000) });
    return { aplicado: true, explicacao: ia.dados.explicacao, alteracoes: ia.dados.alteracoes, versao: this.versaoPublica(v) };
  }

  async arquivar(user: any, id: string) {
    const c = await this.calculo(user, id);
    return this.prisma.calculo.update({ where: { id: c.id }, data: { arquivado: true } });
  }

  // ═══════════════════════ SAÍDAS ═════════════════════════════════════════

  async arquivo(user: any, id: string, numero: number | null, formato: string) {
    const c = await this.calculo(user, id);
    const v = await this.prisma.calculoVersao.findUnique({ where: { calculoId_numero: { calculoId: c.id, numero: numero ?? c.versaoAtual } } });
    if (!v) throw new NotFoundException('Versão não encontrada');
    return this.gerarArquivo(c, v, formato);
  }

  private async gerarArquivo(c: any, v: any, formato: string) {
    const f = String(formato ?? '').toLowerCase();
    if (!['xlsx', 'docx', 'pdf'].includes(f)) throw new BadRequestException('Formato: xlsx, docx ou pdf');
    const r = v.resultado as Resultado;
    const esc = await this.prisma.escritorio.findUnique({ where: { id: c.escritorioId }, select: { nome: true } });
    const proc = c.processoId ? await this.prisma.processo.findUnique({ where: { id: c.processoId }, select: { numero: true, cliente: { select: { nome: true } } } }) : null;
    const meta = { escritorio: esc?.nome, versao: v.numero, processo: proc?.numero ?? null, cliente: proc?.cliente?.nome ?? null };
    let buf: Buffer;
    if (f === 'xlsx') {
      const calc = this.calc(c.tipo);
      const indices = await this.indices.carregar(seriesNecessarias(calc, v.parametros), somarMesesIso(dataMaisAntiga(v.parametros), -13));
      buf = await gerarExcel(r, indices, meta);
    } else if (f === 'docx') buf = await gerarMemoriaDocx(r, meta);
    else buf = await gerarMemoriaPdf(r, meta);
    const base = `Calculo_${c.tipo}_v${v.numero}_${r.dataBase}`;
    return { buffer: buf, nome: f === 'xlsx' ? `${base}.xlsx` : `Memoria_${base}.${f}`, mime: (MIME as any)[f] };
  }

  /** Marca a versão como juntada aos autos (nunca mais muda) e guarda os três arquivos no processo */
  async juntar(user: any, id: string, numero: number) {
    const c = await this.calculo(user, id);
    const v = await this.prisma.calculoVersao.findUnique({ where: { calculoId_numero: { calculoId: c.id, numero } } });
    if (!v) throw new NotFoundException('Versão não encontrada');
    if (v.juntada) return this.versaoPublica(v);
    const docs: string[] = [];
    if (c.processoId) {
      for (const f of ['pdf', 'docx', 'xlsx']) {
        const a = await this.gerarArquivo(c, v, f);
        const d = await this.arquivos.salvarNoProcesso(c.escritorioId, c.processoId, {
          nome: a.nome, mimeType: a.mime, conteudo: a.buffer, categoria: 'PECAS', origem: 'GERADO', enviadoPorId: user.id, tipo: 'calculo',
        });
        docs.push(d.id);
      }
    }
    const nv = await this.prisma.calculoVersao.update({ where: { id: v.id }, data: { juntada: true, juntadaEm: new Date(), juntadaPorId: user.id, documentosIds: docs } });
    return this.versaoPublica(nv);
  }

  // ═══════════════════════ ATUALIZAÇÃO MENSAL (143) ═══════════════════════

  @Cron('0 6 16 * *', { timeZone: 'America/Sao_Paulo' })
  async cronMensal() {
    if (process.env.CALCULOS_ATUALIZACAO_DESLIGADA === 'true') return;
    const escs = await this.prisma.calculo.findMany({ where: { atualizarAuto: true, arquivado: false }, select: { escritorioId: true }, distinct: ['escritorioId'] });
    for (const e of escs) await this.atualizarEscritorio(e.escritorioId).catch((err) => this.logger.error(`Atualização mensal ${e.escritorioId}: ${err?.message}`));
  }

  async atualizarEscritorio(escritorioId: string, dataBase?: string) {
    const lista = await this.prisma.calculo.findMany({ where: { escritorioId, atualizarAuto: true, arquivado: false } });
    const res: any[] = [];
    const hoje = dataBase ?? hojeIso();
    for (const c of lista) {
      try {
        const atual = await this.versaoAtual(c);
        const params = { ...(atual.parametros as any), dataCalculo: hoje };
        const calc = this.calc(c.tipo);
        const { dados, resultado } = await this.executar(escritorioId, calc, params);
        const antes = Number(atual.totalPrincipal ?? 0);
        const depois = resultado.totalPrincipal;
        if (Math.abs(depois - antes) < 0.005 && resultado.indicesAte === atual.indicesAte) { res.push({ id: c.id, mudou: false }); continue; }
        const numero = c.versaoAtual + 1;
        await this.prisma.$transaction(async (tx) => {
          await this.novaVersao(c.id, numero, 'ATUALIZACAO_MENSAL', dados, resultado, null, {}, tx);
          await tx.calculo.update({ where: { id: c.id }, data: { versaoAtual: numero, ultimaAtualizacaoEm: new Date() } });
        });
        const variacao = antes ? (depois - antes) / Math.abs(antes) : depois ? 1 : 0;
        if (Math.abs(variacao) > LIMIAR_AVISO) {
          await this.avisos.sino(escritorioId, c.responsavelId ?? c.criadoPorId, 'CALCULO_VARIACAO', `Cálculo mudou ${(variacao * 100).toFixed(1).replace('.', ',')}%`,
            `"${c.titulo}" passou de ${moeda(antes)} para ${moeda(depois)} com os índices novos (versão ${numero}). A versão juntada aos autos não foi alterada.`, `/calculos/${c.id}`, 'alta');
        }
        res.push({ id: c.id, mudou: true, versao: numero, variacao });
      } catch (e: any) {
        this.logger.warn(`Cálculo ${c.id}: ${e?.message}`);
        res.push({ id: c.id, erro: String(e?.message ?? e) });
      }
    }
    return res;
  }

  // ═══════════════════════ LEITURA DE PAGAMENTOS POR IA (133) ═════════════

  async enviarParaLeitura(user: any, arquivo: any, dto: any = {}) {
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o PDF no campo "arquivo".');
    const ehPdf = arquivo.mimetype === 'application/pdf' || String(arquivo.originalname ?? '').toLowerCase().endsWith('.pdf');
    if (!ehPdf) throw new BadRequestException('Envie o contrato, extrato ou comprovantes em PDF.');
    if (arquivo.buffer.length > 32 * 1024 * 1024) throw new BadRequestException('PDF acima de 32 MB.');
    const proc = await this.conferirProcesso(user, dto?.processoId);
    const nome = String(arquivo.originalname || 'documento.pdf').slice(0, 160);
    const v = await varrerDocumento(arquivo.buffer, nome, 'application/pdf');
    const varredura = await this.prisma.varreduraDocumento.create({
      data: {
        escritorioId: user.officeId, processoId: proc?.id ?? null, nomeArquivo: nome, hashSha256: createHash('sha256').update(arquivo.buffer).digest('hex'),
        resultado: v.resultado, achados: v.achados as any, resumo: v.observacoes.join(' ') || null, decisao: v.resultado === 'ACHADOS' ? 'PENDENTE' : null,
      },
    });
    const ex = await this.prisma.extracaoPagamentos.create({
      data: {
        escritorioId: user.officeId, processoId: proc?.id ?? null, usuarioId: user.id, nomeArquivo: nome, varreduraId: varredura.id,
        status: v.resultado === 'ACHADOS' ? 'AGUARDANDO_LIBERACAO' : 'PROCESSANDO', arquivo: arquivo.buffer,
        observacoes: dto?.finalidade ? `Finalidade: ${String(dto.finalidade).slice(0, 200)}` : null,
      },
    });
    if (v.resultado === 'ACHADOS') {
      const a = v.achados[0];
      await this.avisos.sino(user.officeId, user.id, 'VARREDURA_ACHADOS', 'Documento com possível instrução escondida para IA',
        `A leitura dos pagamentos foi suspensa. ${v.achados.length} achado(s); o primeiro: ${a.camada}, ${a.local} — ${a.descricao}. Trecho: "${a.trecho.slice(0, 300)}". Decida se libera ou descarta.`, `/calculos/extracoes/${ex.id}`, 'alta');
    } else this.lerEmSegundoPlano(ex.id, dto?.finalidade);
    return { id: ex.id, status: ex.status, varredura: { id: varredura.id, resultado: v.resultado, achados: v.achados, observacoes: v.observacoes } };
  }

  private lerEmSegundoPlano(id: string, finalidade?: string) {
    setImmediate(() => this.ler(id, finalidade).catch((e) => this.logger.error(`Leitura ${id}: ${e?.message ?? e}`)));
  }

  private async ler(id: string, finalidade?: string) {
    const ex = await this.prisma.extracaoPagamentos.findUnique({ where: { id } });
    if (!ex?.arquivo) return;
    try {
      const { dados, modelo } = await this.iaUso.executar(
        { escritorioId: ex.escritorioId, tarefa: 'calculo_pagamentos', categoria: 'PESADA', processoId: (ex as any).processoId ?? null, usuarioId: ex.usuarioId },
        (chave, aoUsar) => extrairPagamentos(chave, Buffer.from(ex.arquivo!), finalidade || 'cálculo de restituição de valores pagos', aoUsar),
      );
      await this.prisma.extracaoPagamentos.update({
        where: { id }, data: { status: 'AGUARDANDO_CONFERENCIA', pagamentos: dados.pagamentos as any, observacoes: [ex.observacoes, dados.observacoes].filter(Boolean).join('\n'), modelo },
      });
      await this.avisos.sino(ex.escritorioId, ex.usuarioId, 'PAGAMENTOS_LIDOS', 'Tabela de pagamentos pronta para conferência',
        `A IA leu ${dados.pagamentos.length} pagamento(s) em "${ex.nomeArquivo}". Confira antes de usar no cálculo.`, `/calculos/extracoes/${id}`);
    } catch (e: any) {
      await this.prisma.extracaoPagamentos.update({ where: { id }, data: { status: e instanceof IaIndisponivel ? 'SEM_IA' : 'ERRO', erro: String(e?.message ?? e).slice(0, 500) } });
    }
  }

  private async extracao(user: any, id: string) {
    const ex = await this.prisma.extracaoPagamentos.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!ex) throw new NotFoundException('Leitura não encontrada');
    if (ex.usuarioId !== user.id && !perfisDo(user).some((p) => VEEM_TUDO.includes(p as any))) throw new ForbiddenException('Leitura de outro advogado.');
    return ex;
  }

  async obterExtracao(user: any, id: string) {
    const { arquivo, ...ex } = await this.extracao(user, id);
    return ex;
  }

  async decidirExtracao(user: any, id: string, dto: any) {
    const ex = await this.extracao(user, id);
    if (ex.status !== 'AGUARDANDO_LIBERACAO') throw new BadRequestException('Esta leitura não está aguardando decisão.');
    const decisao = String(dto?.decisao ?? '').toUpperCase();
    if (!['LIBERADO', 'DESCARTADO'].includes(decisao)) throw new BadRequestException('decisao: LIBERADO ou DESCARTADO');
    if (ex.varreduraId) await this.prisma.varreduraDocumento.update({ where: { id: ex.varreduraId }, data: { decisao, decididoPorId: user.id, decididoEm: new Date() } });
    if (decisao === 'DESCARTADO') {
      await this.prisma.extracaoPagamentos.update({ where: { id }, data: { status: 'DESCARTADA', arquivo: null } });
      return { status: 'DESCARTADA' };
    }
    await this.prisma.extracaoPagamentos.update({ where: { id }, data: { status: 'PROCESSANDO' } });
    this.lerEmSegundoPlano(id);
    return { status: 'PROCESSANDO' };
  }

  /** O advogado confere (e pode corrigir) a tabela antes de ela entrar no cálculo */
  async conferirExtracao(user: any, id: string, dto: any) {
    const ex = await this.extracao(user, id);
    if (ex.status !== 'AGUARDANDO_CONFERENCIA' && ex.status !== 'CONFERIDA') throw new BadRequestException('A tabela ainda não está pronta para conferência.');
    const Lista = z.array(z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), valor: z.number().positive(), descricao: z.string().nullable().optional(), tipo: z.enum(['PARCELA', 'SINAL', 'CORRETAGEM', 'OUTRO']).default('PARCELA') }));
    const lista = Lista.safeParse(dto?.pagamentos ?? ex.pagamentos ?? []);
    if (!lista.success) throw new BadRequestException({ message: 'Tabela inválida', erros: lista.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    const { arquivo, ...atual } = await this.prisma.extracaoPagamentos.update({
      where: { id }, data: { status: 'CONFERIDA', pagamentos: lista.data as any, conferidaPorId: user.id, conferidaEm: new Date(), arquivo: null },
    });
    return atual;
  }

  // ═══════════════════════ TABELA DE CUSTAS ═══════════════════════════════

  async listarCustas(user: any, q: any = {}) {
    return this.prisma.custasFaixa.findMany({ where: { escritorioId: user.officeId, ...(q?.tribunal ? { tribunal: String(q.tribunal) } : {}) }, orderBy: [{ tribunal: 'asc' }, { ato: 'asc' }, { vigenciaDe: 'desc' }, { valorDe: 'asc' }] });
  }

  async cadastrarCustas(user: any, dto: any) {
    const F = z.object({
      tribunal: z.string().default('TJSC'), ato: z.enum(['INICIAL', 'RECURSO', 'OUTRA']).default('INICIAL'),
      vigenciaDe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), fonte: z.string().nullable().optional(),
      faixas: z.array(z.object({
        valorDe: z.number().min(0), valorAte: z.number().nullable().optional(), valorFixo: z.number().nullable().optional(),
        percentual: z.number().nullable().optional(), minimo: z.number().nullable().optional(), maximo: z.number().nullable().optional(),
      })).min(1),
    });
    const r = F.safeParse(dto ?? {});
    if (!r.success) throw new BadRequestException({ message: 'Tabela inválida', erros: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    const d = r.data;
    await this.prisma.custasFaixa.deleteMany({ where: { escritorioId: user.officeId, tribunal: d.tribunal, ato: d.ato, vigenciaDe: new Date(`${d.vigenciaDe}T00:00:00Z`) } });
    await this.prisma.custasFaixa.createMany({
      data: d.faixas.map((f) => ({
        escritorioId: user.officeId, tribunal: d.tribunal, ato: d.ato, vigenciaDe: new Date(`${d.vigenciaDe}T00:00:00Z`), fonte: d.fonte ?? null,
        valorDe: f.valorDe, valorAte: f.valorAte ?? null, valorFixo: f.valorFixo ?? null, percentual: f.percentual ?? null, minimo: f.minimo ?? null, maximo: f.maximo ?? null,
      })),
    });
    return this.listarCustas(user, { tribunal: d.tribunal });
  }
}
