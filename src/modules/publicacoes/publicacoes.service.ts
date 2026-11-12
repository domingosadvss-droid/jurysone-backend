/**
 * JURYSONE — Publicações do DJEN (etapa 4)
 *
 * Decisões do escritório aplicadas aqui:
 *   95  cada advogado recebe as publicações da própria OAB, no próprio login;
 *   96  titular e sócia veem as de todos; associada e parceiros só as próprias;
 *   97  publicação com prazo: calcula e lança direto na agenda;
 *   98  sem prazo explícito: provisório de 5 dias "conferir" + alerta;
 *   99  aviso de publicação nova só no sistema (sino);
 *   112 parceiros recebem também as publicações dos processos particulares deles;
 *   113 cruzamento das partes desses processos com clientes, leads e partes contrárias;
 *   114 coincidência: alerta e visibilidade só para o titular (ADMIN);
 *   116 vários advogados intimados: prazo de todos;
 *   119 audiência: agenda + aviso automático ao cliente;
 *   120 marcos: rascunho de mensagem ao cliente, com aprovação;
 *   126 sem vínculo: fila do intimado com sugestões, prazo já na agenda;
 *   127 falha de captura: nova tentativa, recuperação do período e alerta após 24 h.
 */
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS, ehParceiro, perfisDo } from '../../common/perfis';
import { normalizarNome } from '../conflitos/conflitos.service';
import { AgendaPrazosService } from './agenda-prazos.service';
import { AvisosService } from './avisos.service';
import { DativaService } from '../dativa/dativa.service';
import { filtroPublicacoes } from './visibilidade';
import { ComunicacaoDjen, DjenCliente, ErroDjen } from './djen-cliente';
import { diaLocal } from './agenda-prazos.service';
import { contarPrazo, somarDias } from './calendario';
import {
  MARCOS, comarcaDoOrgao, detectarMarcos, ehNomeacaoDativa, ehPenal, extrairAudiencia, extrairPrazo,
  iniciais, iniciaisDeTexto, iniciaisVariantes, mascararCnj, mencionaReuPreso, numeroCnj, textoPlano,
} from './analise';

export interface UsuarioOab { id: string; nome: string; parceiro: boolean; admin: boolean }

interface Contexto {
  escritorioId: string;
  porOab: Map<string, UsuarioOab>;
  processos: Map<string, { id: string; clienteId: string; responsavelId: string | null; numero: string }>;
  adminId: string;
}

const chaveOab = (oab: string, uf: string) => `${String(oab).replace(/\D/g, '')}/${String(uf).toUpperCase()}`;

@Injectable()
export class PublicacoesService {
  private readonly logger = new Logger(PublicacoesService.name);
  djen = new DjenCliente();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaPrazosService,
    private readonly avisos: AvisosService,
    @Inject(forwardRef(() => DativaService)) private readonly dativa: DativaService,
  ) {}

  // ═══════════════════════ VISIBILIDADE ═══════════════════════════════════

  ehGestao(user: any) {
    const p = perfisDo(user);
    return p.some((x) => [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO].includes(x as any));
  }

  filtro(user: any): Prisma.IntimacaoWhereInput {
    return filtroPublicacoes(user);
  }

  async listar(user: any, q: any = {}) {
    const where: Prisma.IntimacaoWhereInput = { AND: [this.filtro(user), { fonte: 'DJEN' }] };
    const and = where.AND as Prisma.IntimacaoWhereInput[];
    if (q.semVinculo === 'true') and.push({ semVinculo: true, intimadosIds: { has: user.id } });
    if (q.coincidencias === 'true') and.push({ particular: true });
    if (q.status) and.push({ status: q.status });
    if (q.processoId) and.push({ processoId: q.processoId });
    if (q.categoria) and.push({ categorias: { has: String(q.categoria).toUpperCase() } });
    if (q.minhas === 'true') and.push({ intimadosIds: { has: user.id } });
    const page = Math.max(1, Number(q.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(q.per_page ?? 20)));
    const [total, data] = await Promise.all([
      this.prisma.intimacao.count({ where }),
      this.prisma.intimacao.findMany({
        where, orderBy: { dataPublicacao: 'desc' }, skip: (page - 1) * perPage, take: perPage,
        include: { processo: { select: { id: true, numero: true, titulo: true } }, cliente: { select: { id: true, nome: true } } },
      }),
    ]);
    return { data, total, page, perPage };
  }

  async obter(user: any, id: string) {
    const item = await this.prisma.intimacao.findFirst({ where: { AND: [this.filtro(user), { id }] } });
    if (!item) throw new NotFoundException('Publicação não encontrada');
    const prazos = await this.prisma.prazo.findMany({ where: { escritorioId: user.officeId, intimacaoId: id, deletedAt: null } });
    return { ...item, prazos };
  }

  /** Vincula a publicação a um processo (fila "sem vínculo"); prazo e agenda vão junto */
  async vincular(user: any, id: string, processoId: string) {
    const item = await this.prisma.intimacao.findFirst({ where: { AND: [this.filtro(user), { id }] } });
    if (!item) throw new NotFoundException('Publicação não encontrada');
    if (item.particular) throw new BadRequestException('Publicação de processo particular do parceiro não se vincula a processo do escritório.');
    if (!this.ehGestao(user) && !item.intimadosIds.includes(user.id)) throw new ForbiddenException('Só o advogado intimado vincula esta publicação.');
    const proc = await this.prisma.processo.findFirst({ where: { id: processoId, escritorioId: user.officeId, deletedAt: null } });
    if (!proc) throw new NotFoundException('Processo não encontrado');
    await this.prisma.intimacao.update({ where: { id }, data: { processoId: proc.id, clienteId: proc.clienteId, semVinculo: false, sugestoesVinculo: Prisma.DbNull } });
    const prazos = await this.prisma.prazo.findMany({ where: { escritorioId: user.officeId, intimacaoId: id } });
    await this.prisma.prazo.updateMany({ where: { escritorioId: user.officeId, intimacaoId: id }, data: { processoId: proc.id } });
    const eventos = prazos.map((p) => p.eventoId).filter(Boolean) as string[];
    if (eventos.length) await this.prisma.evento.updateMany({ where: { id: { in: eventos } }, data: { processoId: proc.id, clienteId: proc.clienteId } });
    // Se o número do processo ainda não estava cadastrado, guarda para as próximas
    if (!numeroCnj(proc.numero) && item.numeroProcesso) {
      await this.prisma.processo.update({ where: { id: proc.id }, data: { numero: item.numeroProcesso } });
    }
    return this.obter(user, id);
  }

  /** Coincidências do cruzamento de parceiros (só o titular) */
  async coincidencias(user: any) {
    if (!perfisDo(user).includes(PERFIS.ADMIN)) throw new ForbiddenException('Somente o titular vê as coincidências.');
    return this.prisma.intimacao.findMany({
      where: { escritorioId: user.officeId, NOT: { coincidencias: { equals: Prisma.DbNull } } },
      orderBy: { dataPublicacao: 'desc' },
    });
  }

  // ═══════════════════════ CAPTURA ════════════════════════════════════════

  private async contexto(escritorioId: string): Promise<Contexto> {
    const [usuarios, processos] = await Promise.all([
      this.prisma.usuario.findMany({ where: { escritorioId, ativo: true }, select: { id: true, nome: true, roles: true, oabNumero: true, oabEstado: true } }),
      this.prisma.processo.findMany({ where: { escritorioId, deletedAt: null }, select: { id: true, numero: true, clienteId: true, responsavelId: true } }),
    ]);
    const porOab = new Map<string, UsuarioOab>();
    for (const u of usuarios) {
      if (!u.oabNumero || !u.oabEstado) continue;
      porOab.set(chaveOab(u.oabNumero, u.oabEstado), { id: u.id, nome: u.nome, parceiro: ehParceiro(u), admin: perfisDo(u).includes(PERFIS.ADMIN) });
    }
    const mapa = new Map<string, any>();
    for (const p of processos) {
      const n = numeroCnj(p.numero);
      if (n) mapa.set(n, p);
    }
    const admin = usuarios.find((u) => perfisDo(u).includes(PERFIS.ADMIN)) ?? usuarios[0];
    return { escritorioId, porOab, processos: mapa, adminId: admin?.id };
  }

  /** Captura de todos os escritórios (agendada) */
  async capturarTodos() {
    const escritorios = await this.prisma.usuario.findMany({
      where: { ativo: true, oabNumero: { not: null }, oabEstado: { not: null } },
      select: { escritorioId: true }, distinct: ['escritorioId'],
    });
    for (const e of escritorios) {
      await this.capturarEscritorio(e.escritorioId).catch((err) => this.logger.error(`Captura ${e.escritorioId}: ${err.message}`));
    }
  }

  /** Captura de cada OAB do escritório, do último dia coberto (com sobreposição) até hoje */
  async capturarEscritorio(escritorioId: string, opts: { inicio?: string; fim?: string; usuarioId?: string } = {}) {
    const ctx = await this.contexto(escritorioId);
    const usuarios = await this.prisma.usuario.findMany({
      where: { escritorioId, ativo: true, oabNumero: { not: null }, oabEstado: { not: null }, ...(opts.usuarioId ? { id: opts.usuarioId } : {}) },
      select: { id: true, oabNumero: true, oabEstado: true },
    });
    const hoje = diaLocal(new Date());
    const resumo: any[] = [];
    for (const u of usuarios) {
      const oab = String(u.oabNumero).replace(/\D/g, '');
      const uf = String(u.oabEstado).toUpperCase();
      const estado = await this.prisma.estadoCapturaDjen.upsert({
        where: { escritorioId_usuarioId: { escritorioId, usuarioId: u.id } },
        create: { escritorioId, usuarioId: u.id, oab, uf },
        update: { oab, uf },
      });
      const fim = opts.fim ?? hoje;
      // Janela sobreposta (dia anterior ao último coberto) para tolerar atrasos de disponibilização
      const inicio = opts.inicio ?? (estado.coberturaAte ? somarDias(diaLocal(estado.coberturaAte), -1) : somarDias(fim, -3));
      const t0 = Date.now();
      try {
        const { itens, completo } = await this.djen.porOab(oab, uf, inicio, fim);
        let novas = 0;
        for (const c of itens) if (await this.processar(ctx, c)) novas++;
        await this.prisma.estadoCapturaDjen.update({
          where: { id: estado.id },
          data: {
            ultimaTentativaEm: new Date(),
            ...(completo
              ? { coberturaAte: new Date(`${fim}T00:00:00Z`), ultimoSucessoEm: new Date(), ultimoErro: null, falhaDesde: null, alertaEnviadoEm: null }
              : { ultimoErro: 'Consulta incompleta (páginas vazias no DJEN); será repetida.', falhaDesde: estado.falhaDesde ?? new Date() }),
          },
        });
        await this.prisma.diarioExecucaoLog.create({
          data: { escritorioId, tribunal: `DJEN ${oab}/${uf}`, dataEdicao: new Date(), status: completo ? 'sucesso' : 'parcial', totalEncontrado: novas, duracaoMs: Date.now() - t0 },
        });
        resumo.push({ usuarioId: u.id, oab: `${oab}/${uf}`, inicio, fim, encontradas: itens.length, novas, completo });
      } catch (e: any) {
        const msg = e instanceof ErroDjen ? e.message : `Erro: ${e?.message ?? e}`;
        await this.prisma.estadoCapturaDjen.update({
          where: { id: estado.id },
          data: { ultimaTentativaEm: new Date(), ultimoErro: msg.slice(0, 500), falhaDesde: estado.falhaDesde ?? new Date() },
        });
        await this.prisma.diarioExecucaoLog.create({
          data: { escritorioId, tribunal: `DJEN ${oab}/${uf}`, dataEdicao: new Date(), status: 'erro', erroMsg: msg, duracaoMs: Date.now() - t0 },
        });
        resumo.push({ usuarioId: u.id, oab: `${oab}/${uf}`, inicio, fim, erro: msg });
      }
    }
    return { capturas: resumo };
  }

  async saude(escritorioId: string) {
    const estados = await this.prisma.estadoCapturaDjen.findMany({ where: { escritorioId } });
    return estados.map((e) => ({
      usuarioId: e.usuarioId, oab: `${e.oab}/${e.uf}`, coberturaAte: e.coberturaAte, ultimoSucessoEm: e.ultimoSucessoEm,
      ultimoErro: e.ultimoErro, falhaDesde: e.falhaDesde, alertaEnviadoEm: e.alertaEnviadoEm,
    }));
  }

  // ═══════════════════════ PROCESSAMENTO DE CADA PUBLICAÇÃO ══════════════

  /** Grava a publicação e dispara prazo, agenda, avisos e dativa. Devolve true se for nova. */
  async processar(ctx: Contexto, c: ComunicacaoDjen): Promise<boolean> {
    const { escritorioId } = ctx;
    const intimados = c.advogados.map((a) => ctx.porOab.get(chaveOab(a.oab, a.uf))).filter(Boolean) as UsuarioOab[];
    const intimadosIds = [...new Set(intimados.map((u) => u.id))];
    const existente = await this.prisma.intimacao.findUnique({ where: { escritorioId_djenId: { escritorioId, djenId: c.id } } });

    if (existente) {
      const unidos = [...new Set([...existente.intimadosIds, ...intimadosIds])];
      const data: Prisma.IntimacaoUpdateInput = {};
      if (unidos.length !== existente.intimadosIds.length) data.intimadosIds = unidos;
      if (c.motivoCancelamento && !existente.cancelada) {
        Object.assign(data, { cancelada: true, motivoCancelamento: c.motivoCancelamento, status: 'ARQUIVADA' });
        const prazos = await this.prisma.prazo.findMany({ where: { escritorioId, intimacaoId: existente.id, status: 'pendente' } });
        for (const p of prazos) {
          await this.prisma.prazo.update({ where: { id: p.id }, data: { status: 'cancelado', memoriaCalculo: [...(((p.memoriaCalculo as any) ?? []) as string[]), `Publicação cancelada pelo tribunal: ${c.motivoCancelamento}`] as any } });
          if (p.eventoId) await this.prisma.evento.updateMany({ where: { id: p.eventoId }, data: { status: 'CANCELADO' } });
        }
        for (const uid of unidos) {
          await this.avisos.sino(escritorioId, uid, 'PUBLICACAO_CANCELADA', 'Publicação cancelada pelo tribunal',
            `A publicação do processo ${c.numeroComMascara ?? mascararCnj(c.numeroProcesso)} foi cancelada (${c.motivoCancelamento}). O prazo lançado foi cancelado.`, `/publicacoes/${existente.id}`, 'alta');
        }
      }
      if (Object.keys(data).length) await this.prisma.intimacao.update({ where: { id: existente.id }, data });
      return false;
    }
    if (c.motivoCancelamento) return false; // já chegou cancelada: nada a lançar

    const texto = textoPlano(c.texto);
    const numeroMascara = c.numeroComMascara ?? mascararCnj(c.numeroProcesso);
    let processo = ctx.processos.get(c.numeroProcesso) ?? null;
    const internos = intimados.filter((u) => !u.parceiro);
    const parceiros = intimados.filter((u) => u.parceiro);
    const particular = !processo && internos.length === 0 && parceiros.length > 0;
    const categorias = new Set<string>();
    const marcos = detectarMarcos(texto, c.tipoDocumento);
    marcos.forEach((m) => categorias.add(m));
    const audiencia = extrairAudiencia(texto);
    if (audiencia) categorias.add('AUDIENCIA');
    const nomeacao = !processo && internos.length > 0 && ehNomeacaoDativa(texto);
    if (nomeacao) categorias.add('NOMEACAO_DATIVA');

    const prazoTxt = extrairPrazo(texto);
    const penal = ehPenal(c.classe, c.orgao);
    const comarca = comarcaDoOrgao(c.orgao);

    const intimacao = await this.prisma.intimacao.create({
      data: {
        escritorioId, fonte: 'DJEN', tribunal: c.tribunal || 'DJEN', diarioNome: 'DJEN',
        dataPublicacao: new Date(`${c.dataDisponibilizacao}T12:00:00-03:00`),
        titulo: [c.tipoComunicacao, c.tipoDocumento, numeroMascara].filter(Boolean).join(' — ').slice(0, 250),
        conteudo: texto, urlOrigem: c.link, numeroProcesso: numeroMascara,
        nomesEncontrados: c.destinatarios.map((d) => d.nome) as any,
        djenId: c.id, djenHash: c.hash, tipoComunicacao: c.tipoComunicacao, tipoDocumento: c.tipoDocumento,
        orgao: c.orgao, classe: c.classe, destinatarios: c.destinatarios as any, advogados: c.advogados as any,
        intimadosIds, categorias: [...categorias], particular,
        processoId: processo?.id ?? null, clienteId: processo?.clienteId ?? null,
        semVinculo: !processo && !particular && !nomeacao,
        prazoIdentificado: prazoTxt.dias,
      },
    });

    // ── Processo particular de parceiro: sigiloso; cruzamento com a base do escritório ──
    if (particular) {
      await this.cruzarParticular(ctx, intimacao.id, c);
      const ano = Number(c.dataDisponibilizacao.slice(0, 4));
      const cal = await this.agenda.calendario(escritorioId, { tribunal: c.tribunal, comarca }, [ano, ano + 1]);
      const r = contarPrazo({ disponibilizacao: c.dataDisponibilizacao, dias: prazoTxt.dias ?? 5, contagem: penal ? 'CORRIDOS' : 'UTEIS', calendario: cal, penal, reuPreso: mencionaReuPreso(texto) });
      await this.prisma.intimacao.update({ where: { id: intimacao.id }, data: { prazoFatal: new Date(`${r.vencimento}T23:59:00-03:00`), status: 'PRAZO_CRIADO', conteudoResumo: r.memoria.join('\n') } });
      for (const p of parceiros) {
        await this.avisos.sino(escritorioId, p.id, 'PUBLICACAO_NOVA', 'Nova publicação (processo particular)',
          `${numeroMascara} — vence em ${r.vencimento.split('-').reverse().join('/')}${prazoTxt.dias === null ? ' (prazo provisório, conferir)' : ''}.`, `/publicacoes/${intimacao.id}`);
      }
      return true;
    }

    // Parceiro e membro do escritório juntos num processo que o escritório não cadastrou
    if (!processo && internos.length && parceiros.length) {
      await this.registrarCoincidencias(ctx, intimacao.id, c, [{ tipo: 'MEMBRO_NAO_REGISTRADO', detalhe: `Parceiro(s) ${parceiros.map((p) => p.nome).join(', ')} atuando com ${internos.map((p) => p.nome).join(', ')} em processo não cadastrado no escritório.` }]);
    }

    // ── Nomeação dativa: o sistema cria o caso sozinho ──
    let casoDativa: any = null;
    if (nomeacao) {
      const advogado = internos[0];
      const criado = await this.dativa.criarDaNomeacao({
        escritorioId, advogadoId: advogado.id, fonte: 'DJEN', origemRef: intimacao.id,
        numeroProcesso: numeroMascara, tribunal: c.tribunal, orgao: c.orgao, classe: c.classe,
        nomeadoEm: c.dataDisponibilizacao, texto, destinatarios: c.destinatarios, telefone: null,
      });
      processo = { id: criado.processoId, clienteId: criado.clienteId, responsavelId: advogado.id, numero: numeroMascara };
      ctx.processos.set(c.numeroProcesso, processo);
      casoDativa = criado.caso;
      await this.prisma.intimacao.update({ where: { id: intimacao.id }, data: { processoId: processo.id, clienteId: processo.clienteId, semVinculo: false } });
    } else if (processo) {
      casoDativa = await this.prisma.casoDativa.findUnique({ where: { processoId: processo.id } });
    }

    const reuPreso = !!casoDativa?.reuPreso || mencionaReuPreso(texto);
    const responsaveis = intimadosIds.length ? intimadosIds : [processo?.responsavelId ?? ctx.adminId].filter(Boolean) as string[];

    // ── Prazo (97/98/116) ──
    const prazo = await this.agenda.lancarPrazoDaPublicacao({
      escritorioId, intimacaoId: intimacao.id, processoId: processo?.id ?? null, clienteId: processo?.clienteId ?? null,
      responsaveisIds: responsaveis, disponibilizacao: c.dataDisponibilizacao, dias: prazoTxt.dias, duvidoso: prazoTxt.duvidoso,
      contagem: penal ? 'CORRIDOS' : 'UTEIS', penal, reuPreso, tribunal: c.tribunal, comarca,
      descricao: `${c.tipoDocumento ?? c.tipoComunicacao ?? 'Publicação'} — ${numeroMascara}`,
      origem: 'DJEN', criadoPorId: responsaveis[0] ?? ctx.adminId,
    });
    await this.prisma.intimacao.update({ where: { id: intimacao.id }, data: { status: 'PRAZO_CRIADO', prazoFatal: prazo.dataPrazo } });

    // ── Audiência (119) ──
    if (audiencia && audiencia.data >= diaLocal(new Date())) {
      const evento = await this.agenda.criarAudiencia({
        escritorioId, processoId: processo?.id ?? null, clienteId: processo?.clienteId ?? null, responsaveisIds: responsaveis,
        data: audiencia.data, hora: audiencia.hora, virtual: audiencia.virtual,
        descricao: `Processo ${numeroMascara}\n\nTrecho da publicação:\n${audiencia.trecho}`, criadoPorId: responsaveis[0] ?? ctx.adminId,
      });
      if (processo) await this.avisos.agendarAvisosAudiencia(escritorioId, evento.id, processo.id, processo.clienteId, audiencia, numeroMascara);
    }

    // ── Marcos para o cliente (120) e fim da dativa (105) ──
    if (processo && marcos.length) {
      await this.avisos.rascunhoMarco(escritorioId, { intimacaoId: intimacao.id, processoId: processo.id, clienteId: processo.clienteId, marcos, texto, numero: numeroMascara, responsavelId: responsaveis[0] });
      if (casoDativa && (marcos.includes('MARCO_SENTENCA') || marcos.includes('MARCO_ACORDAO'))) {
        await this.dativa.registrarSentenca(escritorioId, casoDativa.id, c.dataDisponibilizacao, texto);
      }
    }

    // ── Sugestões de vínculo (126) ──
    if (!processo) {
      const sugestoes = await this.sugerirVinculo(escritorioId, c);
      await this.prisma.intimacao.update({ where: { id: intimacao.id }, data: { sugestoesVinculo: sugestoes as any } });
    }

    // ── Aviso no sino (99), com alerta de "conferir" (98) ──
    const venc = diaLocal(prazo.dataPrazo).split('-').reverse().join('/');
    for (const uid of responsaveis) {
      const extra = [
        prazo.conferir ? 'PRAZO PROVISÓRIO — conferir' : `prazo até ${venc}`,
        !processo ? 'sem vínculo: escolha o processo' : null,
        nomeacao ? 'nomeação dativa: caso criado' : null,
        audiencia ? 'audiência na agenda' : null,
      ].filter(Boolean).join(' · ');
      await this.avisos.sino(escritorioId, uid, prazo.conferir ? 'PRAZO_CONFERIR' : 'PUBLICACAO_NOVA',
        prazo.conferir ? 'Publicação com prazo a conferir' : 'Nova publicação',
        `${numeroMascara} — ${extra}${prazo.conferir ? ` (provisório até ${venc})` : ''}.`, `/publicacoes/${intimacao.id}`, prazo.conferir ? 'alta' : 'normal');
    }
    return true;
  }

  // ═══════════════════════ SUGESTÕES E CRUZAMENTO ═════════════════════════

  private async sugerirVinculo(escritorioId: string, c: ComunicacaoDjen) {
    const processos = await this.prisma.processo.findMany({
      where: { escritorioId, deletedAt: null },
      select: { id: true, numero: true, tribunal: true, titulo: true, cliente: { select: { id: true, nome: true } } },
      take: 2000,
    });
    const iniDest = c.destinatarios.map((d) => iniciaisDeTexto(d.nome)).filter((i) => i.length >= 2);
    const nomesDest = c.destinatarios.map((d) => normalizarNome(d.nome)).filter((n) => n.length >= 5);
    const pontuados = processos.map((p) => {
      const motivos: string[] = [];
      let pontos = 0;
      const nomeCli = normalizarNome(p.cliente?.nome);
      if (nomeCli && nomesDest.includes(nomeCli)) { pontos += 5; motivos.push('nome do cliente igual ao destinatário'); }
      else if (iniciaisVariantes(p.cliente?.nome).some((i) => iniDest.includes(i))) { pontos += 3; motivos.push('iniciais do cliente batem'); }
      if (!numeroCnj(p.numero)) { pontos += 1; motivos.push('processo sem número cadastrado'); }
      if (p.tribunal && c.tribunal && p.tribunal.toUpperCase() === c.tribunal) { pontos += 1; motivos.push('mesmo tribunal'); }
      return { processoId: p.id, numero: p.numero, titulo: p.titulo, cliente: p.cliente?.nome, pontos, motivos };
    });
    return pontuados.filter((s) => s.pontos >= 3).sort((a, b) => b.pontos - a.pontos).slice(0, 5);
  }

  /** 113: partes do processo particular do parceiro × base do escritório */
  private async cruzarParticular(ctx: Contexto, intimacaoId: string, c: ComunicacaoDjen) {
    const nomes = c.destinatarios.map((d) => ({ original: d.nome, n: normalizarNome(d.nome) })).filter((x) => x.n.length >= 5);
    if (!nomes.length) return;
    const [clientes, processos] = await Promise.all([
      // clientes atuais, antigos (inclusive excluídos) e atendidos que não fecharam
      this.prisma.cliente.findMany({ where: { escritorioId: ctx.escritorioId }, select: { id: true, nome: true, status: true, deletedAt: true, _count: { select: { processos: true } } } }),
      this.prisma.processo.findMany({ where: { escritorioId: ctx.escritorioId }, select: { id: true, numero: true, camposCustom: true } }),
    ]);
    const achados: { tipo: string; detalhe: string; refId?: string }[] = [];
    for (const nome of nomes) {
      for (const cli of clientes) {
        if (normalizarNome(cli.nome) !== nome.n) continue;
        const situacao = cli.deletedAt || cli.status !== 'ativo' ? 'cliente antigo' : cli._count.processos ? 'cliente' : 'contato/lead atendido';
        achados.push({ tipo: cli._count.processos ? 'CLIENTE' : 'LEAD', detalhe: `${nome.original} é ${situacao} do escritório.`, refId: cli.id });
      }
      for (const p of processos) {
        const partes = (((p.camposCustom as any)?.partes ?? []) as any[]);
        if (partes.some((pt) => normalizarNome(pt?.nome) === nome.n)) {
          achados.push({ tipo: 'PARTE_CONTRARIA', detalhe: `${nome.original} é parte no processo ${p.numero} do escritório.`, refId: p.id });
        }
      }
    }
    if (achados.length) await this.registrarCoincidencias(ctx, intimacaoId, c, achados);
  }

  private async registrarCoincidencias(ctx: Contexto, intimacaoId: string, c: ComunicacaoDjen, achados: any[]) {
    await this.prisma.intimacao.update({ where: { id: intimacaoId }, data: { coincidencias: achados as any } });
    const admins = await this.prisma.usuario.findMany({ where: { escritorioId: ctx.escritorioId, ativo: true, roles: { contains: 'ADMIN' } }, select: { id: true } });
    for (const a of admins) {
      await this.avisos.sino(ctx.escritorioId, a.id, 'COINCIDENCIA_PARCEIRO', 'Coincidência em processo de parceiro',
        `${c.numeroComMascara ?? mascararCnj(c.numeroProcesso)}: ${achados.map((x) => x.detalhe).join(' ')}`.slice(0, 900), `/publicacoes/${intimacaoId}`, 'alta');
    }
  }

  // ═══════════════════════ MARCOS: texto ═══════════════════════════════════
  descricaoMarcos(marcos: string[]) {
    return marcos.map((m) => MARCOS[m] ?? m).join(', ');
  }
}
