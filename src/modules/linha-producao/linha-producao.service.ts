/**
 * JURYSONE — Linha de produção
 *
 * Cada caso anda por etapas; cada etapa tem um responsável, um prazo e um checklist.
 * Nenhuma pessoa fica com o caso inteiro: o escritório controla o fluxo.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS, PERFIS_GESTAO, ehParceiro, perfisDo, temPerfil } from '../../common/perfis';
import { MODELOS_PADRAO, montarChecklist } from './modelos-padrao';

const TIPOS_RESPONSAVEL = ['ADVOGADO_RESPONSAVEL', 'ESTAGIARIO', 'ADMIN', 'USUARIO'];
const DIA = 24 * 60 * 60 * 1000;

interface ItemChecklist { id: string; texto: string; obrigatorio: boolean; feito?: boolean; feitoEm?: string | null; feitoPorId?: string | null }

@Injectable()
export class LinhaProducaoService {
  private readonly logger = new Logger(LinhaProducaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════════ MODELOS ═══════════════════════════════

  /** Instala os modelos padrão que ainda não existem no escritório (não sobrescreve edições). */
  async instalarPadrao(escritorioId: string) {
    const existentes = await this.prisma.modeloLinha.findMany({ where: { escritorioId }, select: { codigo: true } });
    const ja = new Set(existentes.map((m) => m.codigo));
    let criados = 0;
    for (const m of MODELOS_PADRAO) {
      if (ja.has(m.codigo)) continue;
      await this.prisma.modeloLinha.create({
        data: {
          escritorioId, codigo: m.codigo, nome: m.nome, area: m.area, descricao: m.descricao,
          etapas: {
            create: m.etapas.map((e, i) => ({
              ordem: i + 1,
              nome: e.nome,
              descricao: e.descricao,
              responsavelTipo: e.responsavelTipo ?? 'ADVOGADO_RESPONSAVEL',
              aguardando: e.aguardando,
              prazoDias: e.prazoDias ?? 5,
              opcional: e.opcional ?? false,
              checklist: montarChecklist(e.checklist) as any,
            })),
          },
        },
      });
      criados++;
    }
    return { criados, jaExistiam: ja.size };
  }

  listarModelos(escritorioId: string, query: any = {}) {
    const where: any = { escritorioId };
    if (query.area) where.area = String(query.area).toUpperCase();
    if (query.ativos !== 'false') where.ativo = true;
    return this.prisma.modeloLinha.findMany({
      where,
      orderBy: [{ area: 'asc' }, { nome: 'asc' }],
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    });
  }

  async obterModelo(escritorioId: string, id: string) {
    const m = await this.prisma.modeloLinha.findFirst({
      where: { id, escritorioId },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    });
    if (!m) throw new NotFoundException('Modelo não encontrado');
    return m;
  }

  private validarEtapas(etapas: any[]) {
    if (!Array.isArray(etapas) || etapas.length === 0) throw new BadRequestException('O modelo precisa de ao menos uma etapa.');
    return etapas.map((e, i) => {
      if (!e?.nome) throw new BadRequestException(`Etapa ${i + 1} sem nome.`);
      const tipo = String(e.responsavelTipo ?? 'ADVOGADO_RESPONSAVEL').toUpperCase();
      if (!TIPOS_RESPONSAVEL.includes(tipo)) throw new BadRequestException(`Etapa ${i + 1}: responsavelTipo inválido (${TIPOS_RESPONSAVEL.join(', ')}).`);
      if (tipo === 'USUARIO' && !e.responsavelPadraoId) throw new BadRequestException(`Etapa ${i + 1}: informe responsavelPadraoId.`);
      const prazoDias = Number(e.prazoDias ?? 5);
      if (!Number.isInteger(prazoDias) || prazoDias < 0 || prazoDias > 3650) throw new BadRequestException(`Etapa ${i + 1}: prazoDias inválido.`);
      const checklist = (Array.isArray(e.checklist) ? e.checklist : []).map((c: any, j: number) =>
        typeof c === 'string'
          ? { id: `c${j + 1}`, texto: c, obrigatorio: true }
          : { id: c.id ?? `c${j + 1}`, texto: String(c.texto ?? ''), obrigatorio: c.obrigatorio !== false });
      return {
        ordem: i + 1, nome: e.nome, descricao: e.descricao ?? null, responsavelTipo: tipo,
        responsavelPadraoId: e.responsavelPadraoId ?? null, aguardando: e.aguardando ?? null,
        prazoDias, opcional: Boolean(e.opcional), checklist,
      };
    });
  }

  async criarModelo(escritorioId: string, dto: any) {
    if (!dto?.nome || !dto?.area) throw new BadRequestException('Informe nome e área do modelo.');
    const etapas = this.validarEtapas(dto.etapas);
    const codigo = String(dto.codigo ?? `PERSONALIZADO_${Date.now()}`).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const existe = await this.prisma.modeloLinha.findUnique({ where: { escritorioId_codigo: { escritorioId, codigo } } });
    if (existe) throw new BadRequestException('Já existe um modelo com este código.');
    return this.prisma.modeloLinha.create({
      data: {
        escritorioId, codigo, nome: dto.nome, area: String(dto.area).toUpperCase(), descricao: dto.descricao,
        etapas: { create: etapas as any },
      },
      include: { etapas: { orderBy: { ordem: 'asc' } } },
    });
  }

  /** Editar um modelo sobe a versão; casos já iniciados continuam com as etapas que tinham. */
  async atualizarModelo(escritorioId: string, id: string, dto: any) {
    const atual = await this.obterModelo(escritorioId, id);
    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.area !== undefined) data.area = String(dto.area).toUpperCase();
    if (dto.ativo !== undefined) data.ativo = Boolean(dto.ativo);

    if (dto.etapas !== undefined) {
      const etapas = this.validarEtapas(dto.etapas);
      return this.prisma.$transaction(async (tx) => {
        await tx.etapaModelo.deleteMany({ where: { modeloId: id } });
        return tx.modeloLinha.update({
          where: { id },
          data: { ...data, versao: atual.versao + 1, etapas: { create: etapas as any } },
          include: { etapas: { orderBy: { ordem: 'asc' } } },
        });
      });
    }
    return this.prisma.modeloLinha.update({ where: { id }, data, include: { etapas: { orderBy: { ordem: 'asc' } } } });
  }

  // ═══════════════════════════ LINHA NO PROCESSO ══════════════════════════

  private async primeiroUsuarioComPerfil(escritorioId: string, perfil: string) {
    const us = await this.prisma.usuario.findMany({
      where: { escritorioId, ativo: true, roles: { contains: perfil } },
      select: { id: true, roles: true },
      orderBy: { createdAt: 'asc' },
    });
    return us.find((u) => perfisDo(u).includes(perfil))?.id ?? null;
  }

  private async assertUsuarioDoEscritorio(escritorioId: string, usuarioId: string) {
    const u = await this.prisma.usuario.findFirst({ where: { id: usuarioId, escritorioId, ativo: true }, select: { id: true } });
    if (!u) throw new BadRequestException('Responsável não encontrado ou inativo neste escritório.');
  }

  async iniciar(escritorioId: string, processoId: string, dto: any, user: any) {
    const processo = await this.prisma.processo.findFirst({
      where: { id: processoId, escritorioId, deletedAt: null },
      select: { id: true, responsavelId: true, numero: true },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');

    const modelo = dto?.modeloId
      ? await this.prisma.modeloLinha.findFirst({ where: { id: dto.modeloId, escritorioId, ativo: true }, include: { etapas: { orderBy: { ordem: 'asc' } } } })
      : dto?.codigo
        ? await this.prisma.modeloLinha.findFirst({ where: { codigo: String(dto.codigo).toUpperCase(), escritorioId, ativo: true }, include: { etapas: { orderBy: { ordem: 'asc' } } } })
        : null;
    if (!modelo) throw new BadRequestException('Informe um modelo ativo (modeloId ou codigo).');
    if (modelo.etapas.length === 0) throw new BadRequestException('O modelo não tem etapas.');

    const ativa = await this.prisma.linhaProcesso.findFirst({ where: { escritorioId, processoId, status: 'ATIVA' }, select: { id: true } });
    if (ativa) throw new BadRequestException('Este processo já tem uma linha de produção ativa.');

    const advogado = processo.responsavelId ?? user.id;
    const estagiario = (await this.primeiroUsuarioComPerfil(escritorioId, PERFIS.ESTAGIARIO)) ?? advogado;
    const admin = (await this.primeiroUsuarioComPerfil(escritorioId, PERFIS.ADMIN)) ?? advogado;
    const escolhidos: Record<string, string> = dto?.responsaveis ?? {};
    for (const id of Object.values(escolhidos)) await this.assertUsuarioDoEscritorio(escritorioId, id);

    const linha = await this.prisma.linhaProcesso.create({
      data: {
        escritorioId, processoId, modeloId: modelo.id, modeloVersao: modelo.versao, iniciadaPor: user.id,
        etapas: {
          create: modelo.etapas.map((e) => {
            const porTipo: Record<string, string | null> = {
              ADVOGADO_RESPONSAVEL: advogado, ESTAGIARIO: estagiario, ADMIN: admin, USUARIO: e.responsavelPadraoId,
            };
            return {
              escritorioId,
              ordem: e.ordem,
              nome: e.nome,
              descricao: e.descricao,
              aguardando: e.aguardando,
              opcional: e.opcional,
              prazoDias: e.prazoDias,
              responsavelId: escolhidos[String(e.ordem)] ?? porTipo[e.responsavelTipo] ?? advogado,
              checklist: ((e.checklist as any[]) ?? []).map((c) => ({ ...c, feito: false, feitoEm: null, feitoPorId: null })) as any,
            };
          }),
        },
      },
    });
    await this.avancar(linha.id);
    return this.obterLinha(escritorioId, linha.id);
  }

  private async obterLinha(escritorioId: string, linhaId: string) {
    const linha = await this.prisma.linhaProcesso.findFirst({
      where: { id: linhaId, escritorioId },
      include: { etapas: { orderBy: { ordem: 'asc' } }, modelo: { select: { id: true, codigo: true, nome: true, area: true } } },
    });
    if (!linha) throw new NotFoundException('Linha não encontrada');
    return this.resumir(linha);
  }

  private resumir(linha: any) {
    const total = linha.etapas.length;
    const feitas = linha.etapas.filter((e: any) => ['CONCLUIDA', 'PULADA'].includes(e.status)).length;
    const atual = linha.etapas.find((e: any) => e.status === 'EM_ANDAMENTO') ?? null;
    const agora = Date.now();
    return {
      ...linha,
      progresso: total ? Math.round((feitas / total) * 100) : 0,
      etapaAtual: atual
        ? { id: atual.id, ordem: atual.ordem, nome: atual.nome, responsavelId: atual.responsavelId, prazoEm: atual.prazoEm, atrasada: !!atual.prazoEm && new Date(atual.prazoEm).getTime() < agora }
        : null,
    };
  }

  async doProcesso(escritorioId: string, processoId: string, user: any) {
    if (ehParceiro(user)) await this.assertParceiroNoProcesso(escritorioId, processoId, user);
    const linhas = await this.prisma.linhaProcesso.findMany({
      where: { escritorioId, processoId },
      orderBy: { createdAt: 'desc' },
      include: { etapas: { orderBy: { ordem: 'asc' } }, modelo: { select: { id: true, codigo: true, nome: true, area: true } } },
    });
    return linhas.map((l) => this.resumir(l));
  }

  private async assertParceiroNoProcesso(escritorioId: string, processoId: string, user: any) {
    const ok = await this.prisma.participacaoProcesso.findFirst({
      where: { escritorioId, processoId, parceiroId: user.parceiroId ?? '__sem_parceiro__' }, select: { id: true },
    });
    if (!ok) throw new NotFoundException('Processo não encontrado');
  }

  // ═══════════════════════════════ ETAPAS ═══════════════════════════════

  private async carregarEtapa(escritorioId: string, etapaId: string) {
    const etapa = await this.prisma.etapaLinha.findFirst({
      where: { id: etapaId, escritorioId },
      include: { linha: { select: { id: true, processoId: true, status: true } } },
    });
    if (!etapa) throw new NotFoundException('Etapa não encontrada');
    return etapa;
  }

  /** Responsável da etapa ou gestão (admin/sócio/advogado) podem agir */
  private assertPodeAgir(etapa: { responsavelId: string | null }, user: any) {
    if (etapa.responsavelId === user.id) return;
    if (!ehParceiro(user) && temPerfil(user, PERFIS_GESTAO)) return;
    throw new ForbiddenException('Só o responsável pela etapa ou um advogado gestor pode fazer isso.');
  }

  async marcarItem(escritorioId: string, etapaId: string, dto: any, user: any) {
    const etapa = await this.carregarEtapa(escritorioId, etapaId);
    this.assertPodeAgir(etapa, user);
    if (etapa.status !== 'EM_ANDAMENTO') throw new BadRequestException('Só é possível marcar itens da etapa em andamento.');
    const lista = ((etapa.checklist as any[]) ?? []) as ItemChecklist[];
    const item = lista.find((i) => i.id === dto?.itemId);
    if (!item) throw new NotFoundException('Item do checklist não encontrado');
    const feito = dto?.feito !== false;
    item.feito = feito;
    item.feitoEm = feito ? new Date().toISOString() : null;
    item.feitoPorId = feito ? user.id : null;
    return this.prisma.etapaLinha.update({ where: { id: etapaId }, data: { checklist: lista as any } });
  }

  async concluir(escritorioId: string, etapaId: string, dto: any, user: any) {
    const etapa = await this.carregarEtapa(escritorioId, etapaId);
    this.assertPodeAgir(etapa, user);
    if (etapa.status !== 'EM_ANDAMENTO') throw new BadRequestException('Esta etapa não está em andamento.');
    const pendentes = (((etapa.checklist as any[]) ?? []) as ItemChecklist[]).filter((i) => i.obrigatorio && !i.feito);
    if (pendentes.length > 0) {
      throw new BadRequestException({
        message: 'Há itens obrigatórios do checklist pendentes.',
        pendentes: pendentes.map((p) => p.texto),
      });
    }
    await this.prisma.etapaLinha.update({
      where: { id: etapaId },
      data: { status: 'CONCLUIDA', concluidaEm: new Date(), concluidaPor: user.id, observacao: dto?.observacao ?? etapa.observacao },
    });
    await this.avancar(etapa.linhaId);
    return this.obterLinha(escritorioId, etapa.linhaId);
  }

  /** Etapas opcionais (ex.: notificação antes da ação) podem ser puladas com motivo */
  async pular(escritorioId: string, etapaId: string, dto: any, user: any) {
    const etapa = await this.carregarEtapa(escritorioId, etapaId);
    this.assertPodeAgir(etapa, user);
    if (!etapa.opcional) throw new BadRequestException('Só etapas opcionais podem ser puladas.');
    if (!['EM_ANDAMENTO', 'PENDENTE'].includes(etapa.status)) throw new BadRequestException('Esta etapa já foi encerrada.');
    if (!dto?.motivo) throw new BadRequestException('Informe o motivo para pular a etapa.');
    await this.prisma.etapaLinha.update({
      where: { id: etapaId },
      data: { status: 'PULADA', concluidaEm: new Date(), concluidaPor: user.id, observacao: `Pulada: ${dto.motivo}` },
    });
    if (etapa.status === 'EM_ANDAMENTO') await this.avancar(etapa.linhaId);
    return this.obterLinha(escritorioId, etapa.linhaId);
  }

  async reatribuir(escritorioId: string, etapaId: string, dto: any) {
    const etapa = await this.carregarEtapa(escritorioId, etapaId);
    if (['CONCLUIDA', 'PULADA'].includes(etapa.status)) throw new BadRequestException('Esta etapa já foi encerrada.');
    const data: any = {};
    if (dto?.responsavelId) {
      await this.assertUsuarioDoEscritorio(escritorioId, dto.responsavelId);
      data.responsavelId = dto.responsavelId;
    }
    if (dto?.prazoEm) {
      const p = new Date(dto.prazoEm);
      if (Number.isNaN(p.getTime())) throw new BadRequestException('Data de prazo inválida.');
      data.prazoEm = p;
      data.alertadoEm = null;
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('Informe responsavelId e/ou prazoEm.');
    const atualizada = await this.prisma.etapaLinha.update({ where: { id: etapaId }, data });
    if (data.responsavelId && etapa.status === 'EM_ANDAMENTO') {
      await this.notificar(escritorioId, data.responsavelId, atualizada, etapa.linha.processoId, 'Etapa atribuída a você');
    }
    return atualizada;
  }

  async cancelarLinha(escritorioId: string, linhaId: string, dto: any) {
    const linha = await this.prisma.linhaProcesso.findFirst({ where: { id: linhaId, escritorioId } });
    if (!linha) throw new NotFoundException('Linha não encontrada');
    if (linha.status !== 'ATIVA') throw new BadRequestException('A linha não está ativa.');
    await this.prisma.linhaProcesso.update({ where: { id: linhaId }, data: { status: 'CANCELADA', concluidaEm: new Date() } });
    await this.prisma.etapaLinha.updateMany({
      where: { linhaId, status: { in: ['PENDENTE', 'EM_ANDAMENTO'] } },
      data: { status: 'PULADA', observacao: `Linha cancelada: ${dto?.motivo ?? 'sem motivo informado'}` },
    });
    return this.obterLinha(escritorioId, linhaId);
  }

  /** Abre a próxima etapa pendente; se não houver, conclui a linha. */
  private async avancar(linhaId: string) {
    const prox = await this.prisma.etapaLinha.findFirst({
      where: { linhaId, status: 'PENDENTE' },
      orderBy: { ordem: 'asc' },
      include: { linha: { select: { processoId: true } } },
    });
    if (!prox) {
      await this.prisma.linhaProcesso.update({ where: { id: linhaId }, data: { status: 'CONCLUIDA', concluidaEm: new Date() } });
      return null;
    }
    const agora = new Date();
    const etapa = await this.prisma.etapaLinha.update({
      where: { id: prox.id },
      data: { status: 'EM_ANDAMENTO', iniciadaEm: agora, prazoEm: new Date(agora.getTime() + prox.prazoDias * DIA), alertadoEm: null },
    });
    if (etapa.responsavelId) {
      await this.notificar(etapa.escritorioId, etapa.responsavelId, etapa, prox.linha.processoId, 'Nova etapa para você');
    }
    return etapa;
  }

  private async notificar(escritorioId: string, usuarioId: string, etapa: any, processoId: string, titulo: string) {
    try {
      const proc = await this.prisma.processo.findUnique({ where: { id: processoId }, select: { numero: true, titulo: true } });
      await this.prisma.notificacao.create({
        data: {
          escritorioId, usuarioId, tipo: 'linha_producao', titulo,
          mensagem: `${etapa.nome} — ${proc?.titulo ?? proc?.numero ?? 'processo'}${etapa.prazoEm ? ` (prazo ${new Date(etapa.prazoEm).toLocaleDateString('pt-BR')})` : ''}`,
          dados: { etapaId: etapa.id, processoId } as any,
          link: `/processos/${processoId}`,
          prioridade: 'normal',
        },
      });
    } catch (e: any) {
      this.logger.warn(`Falha ao notificar etapa ${etapa.id}: ${e?.message}`);
    }
  }

  // ═══════════════════════════ PAINÉIS ═══════════════════════════════════

  private incluirContexto = {
    linha: {
      select: {
        id: true, processoId: true,
        modelo: { select: { nome: true, area: true } },
        processo: { select: { id: true, numero: true, titulo: true, cliente: { select: { id: true, nome: true } } } },
      },
    },
  } as const;

  /** Etapas em andamento do próprio usuário */
  minhas(escritorioId: string, user: any) {
    return this.prisma.etapaLinha.findMany({
      where: { escritorioId, responsavelId: user.id, status: 'EM_ANDAMENTO' },
      orderBy: { prazoEm: 'asc' },
      include: this.incluirContexto,
    });
  }

  /** Casos parados: etapa em andamento com prazo vencido (gestão vê todos; demais, só os seus) */
  async paradas(escritorioId: string, user: any, query: any = {}) {
    const toleranciaDias = Math.max(0, Number(query.diasAlemDoPrazo ?? 0) || 0);
    const limite = new Date(Date.now() - toleranciaDias * DIA);
    const where: any = { escritorioId, status: 'EM_ANDAMENTO', prazoEm: { lt: limite } };
    if (ehParceiro(user) || !temPerfil(user, PERFIS_GESTAO)) where.responsavelId = user.id;
    const etapas = await this.prisma.etapaLinha.findMany({ where, orderBy: { prazoEm: 'asc' }, include: this.incluirContexto });
    const ids = [...new Set(etapas.map((e) => e.responsavelId).filter(Boolean))] as string[];
    const us = await this.prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } });
    const nome = new Map(us.map((u) => [u.id, u.nome]));
    return etapas.map((e) => ({
      ...e,
      responsavelNome: e.responsavelId ? nome.get(e.responsavelId) ?? null : null,
      diasDeAtraso: e.prazoEm ? Math.floor((Date.now() - e.prazoEm.getTime()) / DIA) : 0,
    }));
  }

  // ═══════════════════════════ ALERTA DIÁRIO ═════════════════════════════

  /** Todo dia às 8h: avisa o responsável (e o administrador) das etapas com prazo vencido. */
  @Cron('0 8 * * *', { name: 'linha-producao-paradas', timeZone: 'America/Sao_Paulo' })
  async alertarParadas(somenteEscritorioId?: string) {
    const inicioDoDia = new Date();
    inicioDoDia.setHours(0, 0, 0, 0);
    const etapas = await this.prisma.etapaLinha.findMany({
      where: {
        ...(typeof somenteEscritorioId === 'string' ? { escritorioId: somenteEscritorioId } : {}),
        status: 'EM_ANDAMENTO',
        prazoEm: { lt: new Date() },
        OR: [{ alertadoEm: null }, { alertadoEm: { lt: inicioDoDia } }],
      },
      include: { linha: { select: { processoId: true } } },
      take: 500,
    });
    const adminsPorEscritorio = new Map<string, string | null>();
    for (const e of etapas) {
      if (!adminsPorEscritorio.has(e.escritorioId)) {
        adminsPorEscritorio.set(e.escritorioId, await this.primeiroUsuarioComPerfil(e.escritorioId, PERFIS.ADMIN));
      }
      const admin = adminsPorEscritorio.get(e.escritorioId);
      const destinos = new Set([e.responsavelId, admin].filter(Boolean) as string[]);
      for (const u of destinos) await this.notificar(e.escritorioId, u, e, e.linha.processoId, 'Etapa parada — prazo vencido');
      await this.prisma.etapaLinha.update({ where: { id: e.id }, data: { alertadoEm: new Date() } });
    }
    if (etapas.length) this.logger.log(`Alertas de etapas paradas enviados: ${etapas.length}`);
    return { alertadas: etapas.length };
  }
}
