/**
 * JURYSONE — Prazos e audiências na agenda (etapa 4)
 *
 *   • Calendário do escritório: feriados estaduais/municipais e suspensões de cada tribunal.
 *   • Prazo da publicação: calculado e lançado direto na agenda (sem confirmação); sem prazo
 *     explícito, entra o provisório de 5 dias úteis (CPC, art. 218, § 3º) marcado "conferir".
 *   • Mais de um advogado intimado: o prazo é de todos; quem cumprir dá baixa para todos.
 *   • Cada advogado pode ligar o próprio Google Agenda; prazos e audiências vão para lá.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { cifrar, criptografiaConfigurada, decifrar } from '../../common/cripto';
import { Calendario, Contagem, DiaSemExpediente, contarPrazo, iso, somarDias } from './calendario';
import { corpoAlertaD3, corpoAudiencia, corpoPrazoFatal, DadosPrazoAgenda } from './agenda-google-formato';

export const TIPOS_FERIADO = ['MUNICIPAL', 'ESTADUAL', 'SUSPENSAO', 'SUSPENSAO_PRAZO', 'FORENSE', 'OUTRO'] as const;
export const PRAZO_PADRAO_DIAS = 5;

/** Fim do dia em Brasília (UTC−3) para guardar o vencimento */
export function fimDoDia(dia: string): Date {
  return new Date(`${dia}T23:59:00-03:00`);
}

export function diaLocal(d: Date): string {
  return iso(new Date(d.getTime() - 3 * 3600 * 1000));
}

@Injectable()
export class AgendaPrazosService {
  private readonly logger = new Logger(AgendaPrazosService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════ CALENDÁRIO ═════════════════════════════════════

  async calendario(escritorioId: string, ctx: { tribunal?: string | null; comarca?: string | null }, anos: number[]) {
    const cadastrados = await this.prisma.feriadoCalendario.findMany({ where: { escritorioId } });
    const dias: DiaSemExpediente[] = cadastrados.map((f) => ({
      inicio: iso(f.data), fim: iso(f.dataFim ?? f.data), tipo: f.tipo, descricao: f.descricao,
      tribunal: f.tribunal, comarca: f.comarca,
    }));
    return Calendario.para(anos, dias, ctx);
  }

  listarFeriados(escritorioId: string, query: any) {
    const where: any = { escritorioId };
    if (query?.ano) where.data = { gte: new Date(`${query.ano}-01-01`), lte: new Date(`${query.ano}-12-31`) };
    return this.prisma.feriadoCalendario.findMany({ where, orderBy: { data: 'asc' } });
  }

  async criarFeriado(escritorioId: string, dto: any, user: any) {
    const tipo = String(dto?.tipo ?? '').toUpperCase();
    if (!TIPOS_FERIADO.includes(tipo as any)) throw new BadRequestException(`Tipo inválido. Use: ${TIPOS_FERIADO.join(', ')}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dto?.data ?? ''))) throw new BadRequestException('Informe a data no formato AAAA-MM-DD.');
    if (dto.dataFim && !/^\d{4}-\d{2}-\d{2}$/.test(String(dto.dataFim))) throw new BadRequestException('dataFim no formato AAAA-MM-DD.');
    if (dto.dataFim && dto.dataFim < dto.data) throw new BadRequestException('dataFim anterior à data.');
    if (!dto?.descricao) throw new BadRequestException('Informe a descrição (ex.: "Aniversário de Itajaí").');
    if (tipo === 'MUNICIPAL' && !dto.comarca) throw new BadRequestException('No feriado municipal, informe o município (comarca).');
    return this.prisma.feriadoCalendario.create({
      data: {
        escritorioId, tipo,
        data: new Date(`${dto.data}T00:00:00Z`),
        dataFim: dto.dataFim ? new Date(`${dto.dataFim}T00:00:00Z`) : null,
        tribunal: dto.tribunal ? String(dto.tribunal).toUpperCase() : null,
        comarca: dto.comarca ?? null,
        descricao: String(dto.descricao),
        criadoPorId: user?.id ?? null,
      },
    });
  }

  async removerFeriado(escritorioId: string, id: string) {
    const f = await this.prisma.feriadoCalendario.findFirst({ where: { id, escritorioId } });
    if (!f) throw new NotFoundException('Feriado não encontrado');
    await this.prisma.feriadoCalendario.delete({ where: { id } });
    return { message: 'Removido' };
  }

  /** Simulação: quanto vence um prazo publicado em tal dia (útil para conferir o calendário) */
  async simular(escritorioId: string, q: any) {
    const disponibilizacao = String(q?.disponibilizacao ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(disponibilizacao)) throw new BadRequestException('disponibilizacao no formato AAAA-MM-DD');
    const dias = Number(q?.dias ?? PRAZO_PADRAO_DIAS);
    const contagem: Contagem = String(q?.contagem ?? 'UTEIS').toUpperCase() === 'CORRIDOS' ? 'CORRIDOS' : 'UTEIS';
    const ano = Number(disponibilizacao.slice(0, 4));
    const cal = await this.calendario(escritorioId, { tribunal: q?.tribunal, comarca: q?.comarca }, [ano, ano + 1]);
    return contarPrazo({ disponibilizacao, dias, contagem, calendario: cal, penal: q?.penal === 'true', reuPreso: q?.reuPreso === 'true' });
  }

  // ═══════════════════════ PRAZOS ═════════════════════════════════════════

  /**
   * Calcula e lança o prazo. `dias` nulo = prazo não explícito → 5 dias úteis "conferir".
   */
  async lancarPrazoDaPublicacao(p: {
    escritorioId: string;
    intimacaoId?: string | null;
    processoId?: string | null;
    clienteId?: string | null;
    responsaveisIds: string[];
    disponibilizacao: string;
    dias: number | null;
    duvidoso?: boolean;
    contagem: Contagem;
    penal?: boolean;
    reuPreso?: boolean;
    tribunal?: string | null;
    comarca?: string | null;
    descricao: string;
    origem: string;
    criadoPorId: string;
  }) {
    const ano = Number(p.disponibilizacao.slice(0, 4));
    const cal = await this.calendario(p.escritorioId, { tribunal: p.tribunal, comarca: p.comarca }, [ano, ano + 1]);
    const conferir = p.dias === null || !!p.duvidoso;
    const dias = p.dias ?? PRAZO_PADRAO_DIAS;
    const contagem: Contagem = p.dias === null ? 'UTEIS' : p.contagem;
    const r = contarPrazo({ disponibilizacao: p.disponibilizacao, dias, contagem, calendario: cal, penal: p.penal, reuPreso: p.reuPreso });
    if (p.dias === null) r.memoria.unshift('Prazo não explícito na publicação: lançado o prazo provisório de 5 dias úteis (CPC, art. 218, § 3º). CONFERIR.');
    else if (p.duvidoso) r.memoria.unshift('A publicação traz mais de um prazo ou prazo em horas: CONFERIR.');
    return this.criarPrazo({
      ...p, conferir, diasPrazo: dias, contagem, inicio: r.inicio, vencimento: r.vencimento, memoria: r.memoria,
    });
  }

  async criarPrazo(p: {
    escritorioId: string;
    intimacaoId?: string | null;
    processoId?: string | null;
    clienteId?: string | null;
    responsaveisIds: string[];
    descricao: string;
    origem: string;
    criadoPorId: string;
    conferir: boolean;
    diasPrazo: number;
    contagem: Contagem;
    inicio: string;
    vencimento: string;
    memoria: string[];
  }) {
    const responsaveis = [...new Set(p.responsaveisIds.filter(Boolean))];
    const titulo = `${p.conferir ? '[CONFERIR] ' : ''}Prazo: ${p.descricao}`.slice(0, 250);
    const evento = await this.prisma.evento.create({
      data: {
        escritorioId: p.escritorioId, processoId: p.processoId ?? null, clienteId: p.clienteId ?? null,
        criadoPorId: p.criadoPorId, titulo, descricao: p.memoria.join('\n'),
        data: fimDoDia(p.vencimento), tipo: 'PRAZO', diaInteiro: true,
        responsaveis: { create: responsaveis.map((usuarioId) => ({ usuarioId })) },
      },
    });
    const prazo = await this.prisma.prazo.create({
      data: {
        escritorioId: p.escritorioId, processoId: p.processoId ?? null, descricao: p.descricao.slice(0, 500),
        tipo: 'judicial', dataPrazo: fimDoDia(p.vencimento), status: 'pendente',
        origem: p.origem, intimacaoId: p.intimacaoId ?? null, eventoId: evento.id,
        responsaveisIds: responsaveis, conferir: p.conferir, diasPrazo: p.diasPrazo, contagem: p.contagem,
        dataInicio: fimDoDia(p.inicio), memoriaCalculo: p.memoria as any,
      },
    });
    await this.enviarAoGoogle(evento.id).catch((e) => this.logger.warn(`Google Agenda: ${e.message}`));
    return prazo;
  }

  /** Baixa do prazo: basta a marcação; vale para todos os responsáveis */
  async cumprir(escritorioId: string, prazoId: string, user: any, dto: any = {}) {
    const prazo = await this.prisma.prazo.findFirst({ where: { id: prazoId, escritorioId, deletedAt: null } });
    if (!prazo) throw new NotFoundException('Prazo não encontrado');
    if (prazo.status === 'cumprido') return prazo;
    const atualizado = await this.prisma.prazo.update({
      where: { id: prazoId },
      data: { status: 'cumprido', cumpridoEm: new Date(), cumpridoPorId: user.id, conferir: false },
    });
    if (prazo.eventoId) {
      await this.prisma.evento.updateMany({ where: { id: prazo.eventoId, escritorioId }, data: { status: 'CONCLUIDO', concluidoEm: new Date() } });
      await this.enviarAoGoogle(prazo.eventoId).catch((e) => this.logger.warn(`Google Agenda: ${e.message}`));
    }
    if (prazo.intimacaoId) {
      await this.prisma.intimacao.updateMany({
        where: { id: prazo.intimacaoId, escritorioId },
        data: { status: 'RESPONDIDA', providencia: dto?.observacao ?? 'Prazo cumprido', providenciaEm: new Date() },
      });
    }
    return atualizado;
  }

  /** Ajuste manual do vencimento (ex.: prazo provisório conferido pelo advogado) */
  async ajustar(escritorioId: string, prazoId: string, dto: any, user: any) {
    const prazo = await this.prisma.prazo.findFirst({ where: { id: prazoId, escritorioId, deletedAt: null } });
    if (!prazo) throw new NotFoundException('Prazo não encontrado');
    const data: any = { conferir: false };
    const memoria = [...(((prazo.memoriaCalculo as any) ?? []) as string[])];
    if (dto?.vencimento) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.vencimento)) throw new BadRequestException('vencimento no formato AAAA-MM-DD');
      data.dataPrazo = fimDoDia(dto.vencimento);
      memoria.push(`Vencimento ajustado manualmente para ${dto.vencimento} por ${user.nome ?? user.id}.`);
    } else {
      memoria.push(`Prazo conferido por ${user.nome ?? user.id}.`);
    }
    if (dto?.descricao) data.descricao = String(dto.descricao).slice(0, 500);
    data.memoriaCalculo = memoria;
    const atualizado = await this.prisma.prazo.update({ where: { id: prazoId }, data });
    if (prazo.eventoId) {
      await this.prisma.evento.updateMany({
        where: { id: prazo.eventoId, escritorioId },
        data: { titulo: `Prazo: ${atualizado.descricao}`.slice(0, 250), ...(data.dataPrazo ? { data: data.dataPrazo } : {}) },
      });
      await this.enviarAoGoogle(prazo.eventoId).catch(() => undefined);
    }
    return atualizado;
  }

  // ═══════════════════════ AUDIÊNCIAS ═════════════════════════════════════

  async criarAudiencia(p: {
    escritorioId: string; processoId?: string | null; clienteId?: string | null; responsaveisIds: string[];
    data: string; hora: string | null; virtual: boolean; descricao: string; criadoPorId: string;
  }) {
    const inicio = new Date(`${p.data}T${p.hora ?? '09:00'}:00-03:00`);
    const responsaveis = [...new Set(p.responsaveisIds.filter(Boolean))];
    const evento = await this.prisma.evento.create({
      data: {
        escritorioId: p.escritorioId, processoId: p.processoId ?? null, clienteId: p.clienteId ?? null,
        criadoPorId: p.criadoPorId,
        titulo: `${p.hora ? '' : '[CONFERIR HORÁRIO] '}Audiência${p.virtual ? ' (virtual)' : ''}`,
        descricao: p.descricao, data: inicio, dataFim: new Date(inicio.getTime() + 60 * 60 * 1000),
        tipo: 'AUDIENCIA', local: p.virtual ? 'Videoconferência (ver link na publicação)' : null,
        responsaveis: { create: responsaveis.map((usuarioId) => ({ usuarioId })) },
      },
    });
    await this.enviarAoGoogle(evento.id).catch((e) => this.logger.warn(`Google Agenda: ${e.message}`));
    return evento;
  }

  // ═══════════════════════ GOOGLE AGENDA DE CADA ADVOGADO ═════════════════

  private assinarEstado(usuarioId: string, ts: number) {
    const segredo = process.env.JWT_SECRET ?? '';
    if (!segredo) throw new BadRequestException('JWT_SECRET não configurado.');
    return createHmac('sha256', segredo).update(`agenda.${usuarioId}.${ts}`).digest('hex');
  }

  /** Endereço de retorno do Google: GOOGLE_AGENDA_REDIRECT_URI ou, sem ele, o do próprio sistema */
  static redirectAgenda(): string {
    const base = (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
    return process.env.GOOGLE_AGENDA_REDIRECT_URI || `${base}/api/agenda-google/callback`;
  }

  private clienteOAuth() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { google } = require('googleapis');
    return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, AgendaPrazosService.redirectAgenda());
  }

  urlConexaoAgenda(user: any) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new BadRequestException('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor.');
    }
    if (!criptografiaConfigurada()) throw new BadRequestException('Configure CHAVE_CRIPTOGRAFIA no servidor antes de conectar a agenda.');
    const ts = Date.now();
    const state = `${user.id}.${ts}.${this.assinarEstado(user.id, ts)}`;
    const url = this.clienteOAuth().generateAuthUrl({
      access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/calendar.events'], state,
    });
    return { url };
  }

  async callbackAgenda(code: string, state: string) {
    const [usuarioId, tsStr, assinatura] = String(state ?? '').split('.');
    const ts = Number(tsStr);
    const esperado = usuarioId && ts ? this.assinarEstado(usuarioId, ts) : '';
    const valido = !!assinatura && esperado.length === assinatura.length &&
      timingSafeEqual(Buffer.from(esperado), Buffer.from(assinatura)) && Date.now() - ts < 15 * 60 * 1000;
    if (!valido) throw new ForbiddenException('Link de conexão inválido ou expirado. Gere um novo.');
    if (!code) throw new BadRequestException('Código de autorização ausente.');
    const { tokens } = await this.clienteOAuth().getToken(code);
    if (!tokens?.refresh_token) throw new BadRequestException('O Google não devolveu o token de acesso contínuo. Remova o acesso do JurysOne na conta Google e conecte de novo.');
    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { googleAgendaToken: cifrar(tokens.refresh_token), googleAgendaId: 'primary', googleAgendaConectadoEm: new Date() },
    });
    // Leva para a agenda recém-ligada os prazos e audiências que já existiam
    this.enviarPendentesDoUsuario(usuarioId).catch((e) => this.logger.warn(`Google Agenda: ${e?.message ?? e}`));
    return { conectado: true };
  }

  async statusAgenda(user: any) {
    const u = await this.prisma.usuario.findUnique({ where: { id: user.id }, select: { googleAgendaConectadoEm: true } });
    return {
      conectada: !!u?.googleAgendaConectadoEm,
      conectadaEm: u?.googleAgendaConectadoEm ?? null,
      // Servidor sem credencial do Google ou com o envio desligado: a tela avisa em vez de oferecer o botão à toa
      googleConfigurado: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      envioDesligado: AgendaPrazosService.agendaGoogleDesligada(),
    };
  }

  // ═══════════════════════ PRAZOS MANUAIS NA AGENDA ═══════════════════════

  /**
   * Coloca na agenda interna (e no Google de quem ligou a agenda) um prazo lançado fora das
   * publicações — tela de Prazos, importação etc. Se já tem evento, atualiza data, título e status.
   * Responsáveis: os do prazo; senão o responsável do processo; senão quem lançou.
   */
  async sincronizarPrazo(prazoId: string, usuarioId?: string | null): Promise<void> {
    const prazo = await this.prisma.prazo.findUnique({
      where: { id: prazoId },
      include: { processo: { select: { clienteId: true, responsavelId: true } } },
    });
    if (!prazo) return;
    if (prazo.deletedAt) return this.removerPrazoDaAgenda(prazoId);

    const cumprido = prazo.status === 'cumprido';
    const titulo = `${prazo.conferir ? '[CONFERIR] ' : ''}Prazo: ${prazo.descricao}`.slice(0, 250);
    const situacao = {
      status: cumprido ? ('CONCLUIDO' as const) : ('PENDENTE' as const),
      concluidoEm: cumprido ? prazo.cumpridoEm ?? new Date() : null,
    };
    let eventoId = prazo.eventoId;

    if (!eventoId) {
      const doPrazo = (prazo.responsaveisIds ?? []).filter(Boolean);
      const responsaveis = doPrazo.length
        ? [...new Set(doPrazo)]
        : [prazo.processo?.responsavelId, usuarioId].filter((x): x is string => !!x).slice(0, 1);
      const criadoPorId = usuarioId ?? responsaveis[0];
      if (!criadoPorId) return; // sem ninguém a quem atribuir: fica só na lista de prazos
      const ev = await this.prisma.evento.create({
        data: {
          escritorioId: prazo.escritorioId, processoId: prazo.processoId, clienteId: prazo.processo?.clienteId ?? null,
          criadoPorId, titulo, descricao: 'Prazo lançado no JurysOne.', data: prazo.dataPrazo,
          tipo: 'PRAZO', diaInteiro: true, ...situacao,
          responsaveis: { create: responsaveis.map((id) => ({ usuarioId: id })) },
        },
      });
      await this.prisma.prazo.update({
        where: { id: prazo.id },
        data: { eventoId: ev.id, responsaveisIds: responsaveis, origem: prazo.origem ?? 'MANUAL' },
      });
      eventoId = ev.id;
    } else {
      await this.prisma.evento.updateMany({ where: { id: eventoId }, data: { titulo, data: prazo.dataPrazo, ...situacao } });
    }
    await this.enviarAoGoogle(eventoId).catch((e) => this.logger.warn(`Google Agenda: ${e?.message ?? e}`));
  }

  /** Prazo excluído: cancela o evento interno e apaga as cópias no Google Agenda */
  async removerPrazoDaAgenda(prazoId: string): Promise<void> {
    const prazo = await this.prisma.prazo.findUnique({ where: { id: prazoId }, select: { eventoId: true } });
    if (!prazo?.eventoId) return;
    await this.prisma.evento.updateMany({ where: { id: prazo.eventoId }, data: { status: 'CANCELADO' } });
    if (AgendaPrazosService.agendaGoogleDesligada() || !process.env.GOOGLE_CLIENT_ID) return;
    const resps = await this.prisma.eventoResponsavel.findMany({
      where: { eventoId: prazo.eventoId, OR: [{ googleEventId: { not: null } }, { googleEventIdD3: { not: null } }] },
      include: { usuario: { select: { googleAgendaToken: true, googleAgendaId: true } } },
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { google } = require('googleapis');
    for (const r of resps) {
      if (!r.usuario.googleAgendaToken) continue;
      try {
        const auth = this.clienteOAuth();
        auth.setCredentials({ refresh_token: decifrar(r.usuario.googleAgendaToken) });
        const cal = google.calendar({ version: 'v3', auth });
        const calendarId = r.usuario.googleAgendaId ?? 'primary';
        for (const eventId of [r.googleEventId, r.googleEventIdD3]) {
          if (eventId) await cal.events.delete({ calendarId, eventId }).catch(() => undefined);
        }
        await this.prisma.eventoResponsavel.update({ where: { id: r.id }, data: { googleEventId: null, googleEventIdD3: null } });
      } catch (e: any) {
        this.logger.warn(`Google Agenda do usuário ${r.usuarioId}: ${e?.message ?? e}`);
      }
    }
  }

  /**
   * Botão "Enviar prazos ao Google": põe na agenda interna os prazos pendentes que ainda não
   * estavam lá e manda ao Google os prazos e audiências futuros em que o usuário é responsável.
   */
  async sincronizarTudo(escritorioId: string, usuarioId: string) {
    const semEvento = await this.prisma.prazo.findMany({
      where: { escritorioId, deletedAt: null, status: 'pendente', eventoId: null },
      select: { id: true },
    });
    for (const p of semEvento) await this.sincronizarPrazo(p.id, usuarioId);
    const enviados = await this.enviarPendentesDoUsuario(usuarioId);
    return {
      colocadosNaAgenda: semEvento.length,
      enviadosAoGoogle: enviados,
      envioDesligado: AgendaPrazosService.agendaGoogleDesligada(),
    };
  }

  /** Manda ao Google do usuário os eventos futuros (prazos e audiências) em que ele é responsável */
  async enviarPendentesDoUsuario(usuarioId: string): Promise<number> {
    if (AgendaPrazosService.agendaGoogleDesligada()) return 0;
    const hoje = new Date(Date.now() - 24 * 3600 * 1000);
    const eventos = await this.prisma.evento.findMany({
      where: {
        tipo: { in: ['PRAZO', 'AUDIENCIA'] }, data: { gte: hoje }, status: { in: ['PENDENTE', 'CONFIRMADO'] },
        responsaveis: { some: { usuarioId } },
      },
      select: { id: true },
      orderBy: { data: 'asc' },
      take: 500,
    });
    for (const e of eventos) await this.enviarAoGoogle(e.id).catch((err) => this.logger.warn(`Google Agenda: ${err?.message ?? err}`));
    return eventos.length;
  }

  async desconectarAgenda(user: any) {
    await this.prisma.usuario.update({ where: { id: user.id }, data: { googleAgendaToken: null, googleAgendaId: null, googleAgendaConectadoEm: null } });
    return { conectada: false };
  }

  /** Agenda Google desligada por configuração (ex.: JurysOne local enquanto a planilha é o controle oficial) */
  static agendaGoogleDesligada(): boolean {
    return /^(1|true|sim)$/i.test(String(process.env.AGENDA_GOOGLE_DESLIGADA ?? ''));
  }

  /** Dados do prazo ligado ao evento, para montar o evento no formato da planilha */
  async dadosPrazoDoEvento(eventoId: string): Promise<DadosPrazoAgenda | null> {
    const p = await this.prisma.prazo.findFirst({
      where: { eventoId },
      include: { processo: { select: { numero: true, tribunal: true, camposCustom: true, cliente: { select: { nome: true } } } } },
    });
    if (!p) return null;
    const i = p.intimacaoId ? await this.prisma.intimacao.findUnique({ where: { id: p.intimacaoId }, select: { tribunal: true, orgao: true } }) : null;
    const tribunal = i?.tribunal && !/^DJEN/i.test(i.tribunal) ? i.tribunal : p.processo?.tribunal ?? null;
    const vencimento = diaLocal(p.dataPrazo);
    const ano = Number(vencimento.slice(0, 4));
    const cal = await this.calendario(p.escritorioId, { tribunal, comarca: (p.processo?.camposCustom as any)?.comarca ?? null }, [ano - 1, ano]);
    let d3 = vencimento;
    for (let faltam = 3, g = 0; faltam > 0 && g < 60; g++) { d3 = somarDias(d3, -1); if (cal.ehDiaUtil(d3) && !cal.prazoSuspenso(d3)) faltam--; }
    const nomes = await this.prisma.usuario.findMany({ where: { id: { in: p.responsaveisIds } }, select: { nome: true } });
    return {
      prazoId: p.id, dias: p.diasPrazo, vencimento, alertaD3: d3, oQueFazer: p.descricao, processo: p.processo?.numero ?? null,
      tribunal, orgao: i?.orgao ?? (p.processo?.camposCustom as any)?.orgao ?? null, cliente: p.processo?.cliente?.nome ?? null,
      responsaveis: nomes.map((n) => n.nome.split(/\s+/)[0]), conferir: p.conferir, cumprido: p.status === 'cumprido',
    };
  }

  /**
   * Cria/atualiza o evento no Google Agenda de cada responsável que ligou a agenda, no formato da
   * planilha: prazo fatal 9h vermelho + alerta D-3 amarelo; audiência azul; cumprido vira "✅ CUMPRIDO".
   */
  async enviarAoGoogle(eventoId: string) {
    if (AgendaPrazosService.agendaGoogleDesligada()) return;
    const ev = await this.prisma.evento.findUnique({
      where: { id: eventoId },
      include: {
        responsaveis: { include: { usuario: { select: { id: true, googleAgendaToken: true, googleAgendaId: true } } } },
        processo: { select: { numero: true } },
      },
    });
    if (!ev) return;
    const conectados = ev.responsaveis.filter((r) => r.usuario.googleAgendaToken);
    if (!conectados.length || !process.env.GOOGLE_CLIENT_ID) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { google } = require('googleapis');
    let fatal: any;
    let d3: any = null;
    let dados: DadosPrazoAgenda | null = null;
    if (ev.tipo === 'PRAZO') dados = await this.dadosPrazoDoEvento(eventoId);
    if (dados) {
      fatal = corpoPrazoFatal(dados);
      d3 = corpoAlertaD3(dados);
    } else if (ev.tipo === 'AUDIENCIA') {
      fatal = corpoAudiencia({ titulo: ev.titulo, descricao: ev.descricao, inicio: ev.data, fim: ev.dataFim, local: ev.local, processo: ev.processo?.numero ?? null, cancelado: ev.status === 'CANCELADO' });
    } else {
      fatal = {
        summary: ev.titulo,
        description: `${ev.descricao ?? ''}\n\n(JurysOne)`.trim(),
        location: ev.local ?? undefined,
        ...(ev.diaInteiro
          ? { start: { date: diaLocal(ev.data) }, end: { date: somarDias(diaLocal(ev.data), 1) } }
          : { start: { dateTime: ev.data.toISOString() }, end: { dateTime: (ev.dataFim ?? new Date(ev.data.getTime() + 3600_000)).toISOString() } }),
        status: ev.status === 'CANCELADO' ? 'cancelled' : 'confirmed',
      };
    }
    const hoje = diaLocal(new Date());
    for (const r of conectados) {
      try {
        const auth = this.clienteOAuth();
        auth.setCredentials({ refresh_token: decifrar(r.usuario.googleAgendaToken!) });
        const cal = google.calendar({ version: 'v3', auth });
        const calendarId = r.usuario.googleAgendaId ?? 'primary';
        if (r.googleEventId) {
          await cal.events.patch({ calendarId, eventId: r.googleEventId, requestBody: fatal });
        } else if (!(dados && (dados.cumprido || dados.vencimento < hoje))) {
          const { data } = await cal.events.insert({ calendarId, requestBody: fatal });
          await this.prisma.eventoResponsavel.update({ where: { id: r.id }, data: { googleEventId: data.id } });
        }
        if (d3 && dados) {
          if (r.googleEventIdD3) {
            await cal.events.patch({ calendarId, eventId: r.googleEventIdD3, requestBody: d3 });
          } else if (!dados.cumprido && dados.alertaD3! >= hoje) {
            const { data } = await cal.events.insert({ calendarId, requestBody: d3 });
            await this.prisma.eventoResponsavel.update({ where: { id: r.id }, data: { googleEventIdD3: data.id } });
          }
        }
      } catch (e: any) {
        this.logger.warn(`Google Agenda do usuário ${r.usuarioId}: ${e?.message ?? e}`);
      }
    }
  }
}
