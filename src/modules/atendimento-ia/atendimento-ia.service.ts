/**
 * JURYSONE — Atendimento automático do WhatsApp (IA, Claude Haiku por padrão)
 *
 * Quando o cliente escreve, a IA responde no lugar do escritório, dentro destas regras:
 *   • Liga e desliga em CADA NÚMERO (cada login conecta o próprio WhatsApp; começa DESLIGADO).
 *     Os ajustes (espera, silêncio, só contatos novos) valem para o escritório todo.
 *   • Por padrão só atende CONTATOS NOVOS (conversa criada depois de ligar): o número conectado
 *     costuma ser o celular do advogado, e a IA não pode responder família, amigos e clientes antigos.
 *     Em cada conversa o advogado pode ligar (AUTO) ou pausar (PAUSADA) a IA.
 *   • Se o advogado escreve na conversa, a IA pausa nela (CaixaWhatsappService.enviarTexto).
 *   • Espera alguns segundos antes de responder, para juntar mensagens enviadas em sequência.
 *   • Conduz o atendimento até o fim (regras-atendimento.ts): entende o caso, manda a lista de
 *     documentos do catálogo, acompanha o envio e só então encaminha ao advogado (para de responder
 *     e avisa no sino). Sem documentos e com urgência, pergunta se o cliente quer advogado assim mesmo.
 *   • Nunca dá parecer jurídico, promete resultado ou informa preço; trata o texto do cliente
 *     como dado (ignora instruções escritas nas mensagens).
 * O gasto passa pelo IaUsoService (tarefa conversa_whatsapp, categoria CONVERSA: nunca é
 * bloqueada pelo limite mensal).
 *   • Lembretes: cliente que parou de responder recebe um lembrete do que falta depois de 48 h e
 *     outro depois de mais 72 h; 48 h depois do segundo, a conversa vai para o advogado.
 *   • Aprendizado (aprendizado.service): respostas aprovadas do advogado entram nas regras e, ao
 *     encerrar, a IA sugere melhorias no catálogo.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { IaUsoService } from '../ia-uso/ia-uso.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { CaixaWhatsappService } from '../whatsapp-oficial/caixa.service';
import { RegistroMensagensService } from '../whatsapp-oficial/registro-mensagens.service';
import { IaIndisponivel, MensagemConversa, RespostaAtendimento, respostaAtendimento, resumirConversa } from '../../common/ia-claude';
import { PERFIS_GESTAO, temPerfil } from '../../common/perfis';
import { regrasAtendimento } from './regras-atendimento';
import { AprendizadoAtendimentoService } from './aprendizado.service';
import { textoDaMensagem } from './texto-mensagem';
import { ConhecimentoService } from '../conhecimento/conhecimento.service';

/** Lembretes ao cliente que parou de responder: horas de silêncio antes de cada passo */
const LEMBRETE_1_HORAS = 48;
const LEMBRETE_2_HORAS = 72;
const AVISAR_ADVOGADO_HORAS = 48;
/** Conversa longa: acima disto (desde o último resumo) o começo vira resumo; ficam as mais novas */
const HISTORICO_MAXIMO = 40;
const HISTORICO_RECENTE = 20;

const CHAVE_CONFIG = 'ia_whatsapp';

/** Ajustes do escritório. Ligar/desligar fica em cada número (whatsapp_conexoes.iaAtivo). */
export interface ConfigAtendimentoIa {
  apenasNovosContatos: boolean;
  /** espera antes de responder, para juntar mensagens seguidas */
  esperaSegundos: number;
  /** horas sem a IA falar depois que alguém do escritório respondeu (pelo celular ou pela caixa) */
  silencioAposHumanoHoras: number;
}

const PADRAO: ConfigAtendimentoIa = {
  apenasNovosContatos: true, esperaSegundos: 8, silencioAposHumanoHoras: 12,
};

/** Testes: responde com texto fixo e não envia nada ao WhatsApp (só grava na caixa como "simulada") */
const simulado = () => process.env.IA_ATENDIMENTO_SIMULADO === 'true';

function hojeBrasilia() {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full' }).format(new Date());
}

@Injectable()
export class AtendimentoIaService implements OnModuleInit {
  private readonly logger = new Logger(AtendimentoIaService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly emAndamento = new Set<string>();
  private avisouSemChave = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registro: RegistroMensagensService,
    private readonly caixa: CaixaWhatsappService,
    private readonly catalogo: CatalogoService,
    private readonly iaUso: IaUsoService,
    private readonly aprendizado: AprendizadoAtendimentoService,
    private readonly conhecimento: ConhecimentoService,
  ) {}

  onModuleInit() {
    this.registro.aoRegistrar((m) => {
      if (m.direcao === 'ENTRADA' && m.origem === 'CLIENTE') {
        // O cliente voltou a falar: a contagem de lembretes recomeça
        void this.prisma.whatsappConversa.updateMany({ where: { id: m.conversaId, lembretesEnviados: { gt: 0 } }, data: { lembretesEnviados: 0 } }).catch(() => undefined);
        this.agendar(m.escritorioId, m.conversaId);
      }
    });
  }

  // ─────────────────────────── configuração ───────────────────────────

  async config(escritorioId: string): Promise<ConfigAtendimentoIa> {
    const row = await this.prisma.configuracao.findFirst({ where: { escritorioId, chave: CHAVE_CONFIG } });
    const v: any = row?.valor ?? {};
    return {
      apenasNovosContatos: v.apenasNovosContatos ?? PADRAO.apenasNovosContatos,
      esperaSegundos: v.esperaSegundos ?? PADRAO.esperaSegundos,
      silencioAposHumanoHoras: v.silencioAposHumanoHoras ?? PADRAO.silencioAposHumanoHoras,
    };
  }

  /** Para a tela: ajustes do escritório + se a IA está ligada no número do MEU login */
  async configDoUsuario(user: { id: string; officeId: string }) {
    const cfg = await this.config(user.officeId);
    const minha = await this.prisma.whatsappConexao.findFirst({ where: { escritorioId: user.officeId, usuarioId: user.id, ativo: true } });
    return { ...cfg, temNumero: !!minha, ativo: !!minha?.iaAtivo, ativadoEm: minha?.iaAtivadoEm ?? null, simulado: simulado() };
  }

  /**
   * { ativo } liga/desliga a IA no número do meu login (qualquer advogado, no próprio número).
   * { apenasNovosContatos, esperaSegundos, silencioAposHumanoHoras } valem para o escritório (gestão).
   */
  async salvarConfig(user: any, dto: any) {
    const escritorioId = user.officeId;
    const ajustes = ['apenasNovosContatos', 'esperaSegundos', 'silencioAposHumanoHoras'].some((k) => dto?.[k] !== undefined);
    if (ajustes) {
      if (!temPerfil(user, PERFIS_GESTAO)) throw new ForbiddenException('Só advogados de gestão mudam os ajustes do atendimento.');
      const novo = await this.config(escritorioId);
      if (dto?.apenasNovosContatos !== undefined) novo.apenasNovosContatos = dto.apenasNovosContatos !== false;
      if (dto?.esperaSegundos !== undefined) novo.esperaSegundos = Math.min(120, Math.max(0, Number(dto.esperaSegundos) || 0));
      if (dto?.silencioAposHumanoHoras !== undefined) novo.silencioAposHumanoHoras = Math.min(720, Math.max(0, Number(dto.silencioAposHumanoHoras) || 0));
      await this.prisma.configuracao.upsert({
        where: { escritorioId_chave: { escritorioId, chave: CHAVE_CONFIG } },
        create: { id: `${escritorioId}_${CHAVE_CONFIG}`, escritorioId, chave: CHAVE_CONFIG, valor: novo as any, tipo: 'ia' },
        update: { valor: novo as any },
      });
    }
    if (dto?.ativo !== undefined) {
      const minha = await this.prisma.whatsappConexao.findFirst({ where: { escritorioId, usuarioId: user.id, ativo: true } });
      if (!minha) throw new BadRequestException('Conecte o seu WhatsApp antes de ligar o atendimento automático.');
      const ligar = dto.ativo === true;
      await this.prisma.whatsappConexao.update({
        where: { id: minha.id },
        // Ligar de novo reinicia o marco: "contatos novos" passam a contar a partir de agora
        data: { iaAtivo: ligar, ...(ligar && !minha.iaAtivo ? { iaAtivadoEm: new Date() } : {}) },
      });
    }
    return this.configDoUsuario(user);
  }

  /** Liga (AUTO), pausa (PAUSADA) ou devolve à regra geral (null) a IA numa conversa que o usuário vê */
  async definirNaConversa(user: any, conversaId: string, status: string | null) {
    const valido = status === null || status === 'AUTO' || status === 'PAUSADA';
    if (!valido) throw new Error('Status inválido: use AUTO, PAUSADA ou null.');
    await this.caixa.conversaVisivel(user, conversaId);
    await this.prisma.whatsappConversa.update({
      where: { id: conversaId },
      data: { iaStatus: status, ...(status !== null ? { iaMotivo: null } : {}) },
    });
    return { conversaId, iaStatus: status };
  }

  /** Testes: processa agora uma conversa que o usuário vê */
  async responderAgora(user: any, conversaId: string) {
    await this.caixa.conversaVisivel(user, conversaId);
    return this.processar(conversaId);
  }

  // ─────────────────────────── disparo ───────────────────────────

  private agendar(escritorioId: string, conversaId: string) {
    void Promise.all([
      this.config(escritorioId),
      this.prisma.whatsappConversa.findUnique({ where: { id: conversaId }, select: { conexao: { select: { iaAtivo: true } } } }),
    ]).then(([cfg, c]) => {
      if (!c?.conexao.iaAtivo) return;
      clearTimeout(this.timers.get(conversaId));
      this.timers.set(conversaId, setTimeout(() => {
        this.timers.delete(conversaId);
        this.processar(conversaId).catch((e) => this.logger.error(`Atendimento IA (${conversaId}): ${e?.message ?? e}`));
      }, cfg.esperaSegundos * 1000));
    }).catch(() => undefined);
  }

  /** Decide se responde e responde. Devolve o motivo quando não responde (útil nos testes). */
  async processar(conversaId: string): Promise<{ respondeu: boolean; motivo?: string; resposta?: RespostaAtendimento }> {
    if (this.emAndamento.has(conversaId)) return { respondeu: false, motivo: 'já em andamento' };
    this.emAndamento.add(conversaId);
    try {
      const conversa = await this.prisma.whatsappConversa.findUnique({ where: { id: conversaId }, include: { conexao: true } });
      if (!conversa) return { respondeu: false, motivo: 'conversa não existe' };
      const cfg = await this.config(conversa.escritorioId);
      const motivo = await this.motivoParaNaoResponder(conversa, cfg);
      if (motivo) return { respondeu: false, motivo };

      const { mensagens, conversaIa, resumo } = await this.historico(conversa);
      const conhecimento = await this.conhecimentoPara(conversa.escritorioId, conversaIa);

      const sistema = await this.montarSistema(conversa.escritorioId, conversa.telefone, conversa.nomeContato, conversa.conexao.usuarioId);
      let r: RespostaAtendimento;
      if (simulado()) {
        const ultima = conversaIa[conversaIa.length - 1]?.texto ?? '';
        const pedeAdvogado = /advogad|processo|urgente|pres[oa]|valor|preç/i.test(ultima);
        r = {
          resposta: pedeAdvogado
            ? '[SIMULAÇÃO] Entendi! Vou passar sua mensagem para um advogado do escritório, que te responde em breve.'
            : '[SIMULAÇÃO] Olá! Sou a assistente virtual do escritório. Pode me contar o que aconteceu e em qual cidade você está?',
          encaminhar: pedeAdvogado, motivo: pedeAdvogado ? 'Simulação: cliente pediu advogado/assunto sensível' : '',
          resumoCaso: `Simulação — última mensagem: ${ultima.slice(0, 200)}`,
        };
      } else {
        try {
          r = await this.iaUso.executar(
            { escritorioId: conversa.escritorioId, tarefa: 'conversa_whatsapp', categoria: 'CONVERSA', conversaId },
            (chave, aoUsar) => respostaAtendimento(chave, { sistema, conversa: conversaIa, resumo, conhecimento }, aoUsar),
          );
        } catch (e: any) {
          if (e instanceof IaIndisponivel) {
            if (!this.avisouSemChave.has(conversa.escritorioId)) {
              this.avisouSemChave.add(conversa.escritorioId);
              this.logger.warn(`Atendimento IA ligado, mas sem IA disponível: ${e.message}`);
            }
            return { respondeu: false, motivo: e.message };
          }
          throw e;
        }
      }

      // Uma nova mensagem do cliente pode ter chegado enquanto a IA pensava: responde na próxima rodada
      const ultimaAgora = await this.prisma.whatsappMensagemCaixa.findFirst({ where: { conversaId }, orderBy: { dataHora: 'desc' }, select: { id: true } });
      if (ultimaAgora && ultimaAgora.id !== mensagens[mensagens.length - 1]?.id) {
        return { respondeu: false, motivo: 'chegou mensagem nova durante a resposta' };
      }

      if (r.resposta.trim()) await this.caixa.enviarTextoSistema(conversaId, r.resposta.trim().slice(0, 4000), { simular: simulado() });
      if (r.encaminhar) await this.encaminhar(conversa, r);
      return { respondeu: true, resposta: r };
    } finally {
      this.emAndamento.delete(conversaId);
    }
  }

  private async motivoParaNaoResponder(conversa: any, cfg: ConfigAtendimentoIa): Promise<string | null> {
    if (!conversa.conexao?.iaAtivo) return 'atendimento automático desligado neste número';
    if (!/^\d{10,15}$/.test(String(conversa.telefone))) return 'não é um número de pessoa (grupo ou lista)';
    if (conversa.iaStatus === 'PAUSADA') return 'pausada nesta conversa (advogado assumiu)';
    if (conversa.iaStatus === 'ENCAMINHADA') return 'já encaminhada ao advogado';
    if (conversa.iaStatus !== 'AUTO' && cfg.apenasNovosContatos) {
      const marco = conversa.conexao.iaAtivadoEm ? new Date(conversa.conexao.iaAtivadoEm) : null;
      if (!marco || conversa.createdAt < marco) return 'contato antigo (a IA só atende contatos novos)';
    }
    const ultima = await this.prisma.whatsappMensagemCaixa.findFirst({ where: { conversaId: conversa.id }, orderBy: { dataHora: 'desc' } });
    if (!ultima || ultima.direcao !== 'ENTRADA') return 'a última mensagem não é do cliente';
    if (cfg.silencioAposHumanoHoras > 0) {
      const desde = new Date(Date.now() - cfg.silencioAposHumanoHoras * 3600_000);
      const humano = await this.prisma.whatsappMensagemCaixa.findFirst({
        where: { conversaId: conversa.id, direcao: 'SAIDA', origem: { in: ['JURYSONE', 'CELULAR'] }, dataHora: { gte: desde } },
        select: { id: true },
      });
      if (humano) return 'alguém do escritório respondeu há pouco';
    }
    return null;
  }

  private textoDa(m: { tipo: string; texto: string | null; midiaNome: string | null }) {
    return textoDaMensagem(m);
  }

  // ─────────────────────────── lembretes ───────────────────────────

  /**
   * Cliente que parou de responder no meio do atendimento (última mensagem é da IA):
   * 48 h → lembrete 1; mais 72 h → lembrete 2; mais 48 h → passa ao advogado.
   * Só em números com a IA ligada, das 8h às 20h, de segunda a sábado.
   */
  @Cron('15 * * * *', { name: 'atendimento-lembretes', timeZone: 'America/Sao_Paulo' })
  async lembretesAgendados() {
    if (process.env.LEMBRETES_DESLIGADOS === 'true') return;
    const agora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    if (agora.getDay() === 0 || agora.getHours() < 8 || agora.getHours() >= 20) return;
    await this.processarLembretes().catch((e) => this.logger.error(`Lembretes: ${e?.message ?? e}`));
  }

  /** `simular`: gera os lembretes e grava na caixa como "simulada", sem enviar ao WhatsApp */
  async processarLembretes(opcoes: { escritorioId?: string; simular?: boolean; agora?: Date } = {}) {
    const agora = opcoes.agora ?? new Date();
    const horas = (h: number) => new Date(agora.getTime() - h * 3600_000);
    const candidatas = await this.prisma.whatsappConversa.findMany({
      where: {
        ...(opcoes.escritorioId ? { escritorioId: opcoes.escritorioId } : {}),
        conexao: { iaAtivo: true, ativo: true },
        OR: [{ iaStatus: null }, { iaStatus: 'AUTO' }],
        lembretesEnviados: { lt: 3 },
        ultimaMensagemEm: { lt: horas(Math.min(LEMBRETE_1_HORAS, AVISAR_ADVOGADO_HORAS)) },
      },
      include: { conexao: true }, take: 50,
    });
    const feitos: { conversaId: string; acao: string }[] = [];
    for (const c of candidatas) {
      if (!/^\d{10,15}$/.test(String(c.telefone))) continue;
      const cfg = await this.config(c.escritorioId);
      if (c.iaStatus !== 'AUTO' && cfg.apenasNovosContatos && (!c.conexao.iaAtivadoEm || c.createdAt < c.conexao.iaAtivadoEm)) continue;
      const ultima = await this.prisma.whatsappMensagemCaixa.findFirst({ where: { conversaId: c.id }, orderBy: { dataHora: 'desc' } });
      if (!ultima || ultima.direcao !== 'SAIDA' || ultima.origem !== 'IA') continue; // só quando a IA falou por último
      const silencio = (agora.getTime() - ultima.dataHora.getTime()) / 3600_000;

      if (c.lembretesEnviados >= 2) {
        if (silencio < AVISAR_ADVOGADO_HORAS) continue;
        await this.encaminhar({ ...c }, { resposta: '', encaminhar: true, motivo: 'O cliente parou de responder depois de dois lembretes.', resumoCaso: '' });
        await this.prisma.whatsappConversa.update({ where: { id: c.id }, data: { lembretesEnviados: 3 } });
        feitos.push({ conversaId: c.id, acao: 'encaminhada ao advogado' });
        continue;
      }
      const precisa = c.lembretesEnviados === 0 ? LEMBRETE_1_HORAS : LEMBRETE_2_HORAS;
      if (silencio < precisa) continue;

      const numero = c.lembretesEnviados + 1;
      const r = await this.gerarResposta(c, `O cliente não responde há ${Math.round(silencio / 24)} dia(s). Este é o lembrete ${numero} de 2.`);
      if (!r) continue;
      if (!r.resposta.trim()) {
        // Não falta nada: não insiste mais
        await this.prisma.whatsappConversa.update({ where: { id: c.id }, data: { lembretesEnviados: 3 } });
        feitos.push({ conversaId: c.id, acao: 'nada a lembrar' });
        continue;
      }
      await this.caixa.enviarTextoSistema(c.id, r.resposta.trim().slice(0, 4000), { simular: opcoes.simular || simulado() });
      await this.prisma.whatsappConversa.update({ where: { id: c.id }, data: { lembretesEnviados: numero, ultimoLembreteEm: agora } });
      feitos.push({ conversaId: c.id, acao: `lembrete ${numero}` });
    }
    return { analisadas: candidatas.length, feitos };
  }

  /**
   * Histórico para a IA. Conversa longa (mais de HISTORICO_MAXIMO mensagens desde o último resumo):
   * o começo vira um resumo guardado na conversa e a IA relê só o resumo + as HISTORICO_RECENTE
   * mais novas — o custo por resposta deixa de crescer com o tamanho do atendimento.
   */
  private async historico(conversa: any) {
    const todas = await this.prisma.whatsappMensagemCaixa.findMany({
      where: { conversaId: conversa.id, status: { not: 'falhou' }, ...(conversa.resumoAte ? { dataHora: { gt: conversa.resumoAte } } : {}) },
      orderBy: { dataHora: 'asc' },
    });
    let resumo: string | null = conversa.resumoIa ?? null;
    let mensagens = todas;
    if (todas.length > HISTORICO_MAXIMO) {
      // Corta de modo que as recentes comecem por uma mensagem do cliente
      let corte = todas.length - HISTORICO_RECENTE;
      while (corte > 0 && todas[corte].direcao !== 'ENTRADA') corte--;
      if (corte > 0) {
        const antigas = todas.slice(0, corte);
        try {
          resumo = await this.iaUso.executar(
            { escritorioId: conversa.escritorioId, tarefa: 'resumo_conversa', categoria: 'CONVERSA', conversaId: conversa.id },
            (chave, aoUsar) => resumirConversa(chave, {
              resumoAnterior: resumo, conversa: antigas.map((m) => ({ deCliente: m.direcao === 'ENTRADA', texto: this.textoDa(m) })),
            }, aoUsar),
          );
          await this.prisma.whatsappConversa.update({ where: { id: conversa.id }, data: { resumoIa: resumo, resumoAte: antigas[antigas.length - 1].dataHora } });
          mensagens = todas.slice(corte);
        } catch (e: any) {
          // Sem resumo, segue com as últimas mensagens (comportamento antigo)
          this.logger.warn(`Resumo da conversa ${conversa.id}: ${e?.message ?? e}`);
          mensagens = todas.slice(-60);
        }
      }
    }
    const conversaIa: MensagemConversa[] = mensagens.map((m) => ({ deCliente: m.direcao === 'ENTRADA', texto: this.textoDa(m) }));
    return { mensagens, conversaIa, resumo };
  }

  /** Trechos da base de conhecimento sobre o que o cliente escreveu por último (busca sem custo) */
  private async conhecimentoPara(escritorioId: string, conversa: MensagemConversa[]) {
    const ultimas = conversa.filter((m) => m.deCliente).slice(-2).map((m) => m.texto).join(' ');
    try {
      const achados = await this.conhecimento.paraAtendimento(escritorioId, ultimas);
      return achados.map((a) => ({ titulo: a.titulo, texto: a.texto }));
    } catch (e: any) {
      this.logger.warn(`Busca na base de conhecimento: ${e?.message ?? e}`);
      return [];
    }
  }

  /** Chama a IA com o histórico da conversa (e um aviso do sistema, quando houver) */
  private async gerarResposta(conversa: any, notaSistema?: string): Promise<RespostaAtendimento | null> {
    const { conversaIa, resumo } = await this.historico(conversa);
    const conhecimento = notaSistema ? [] : await this.conhecimentoPara(conversa.escritorioId, conversaIa);
    const sistema = await this.montarSistema(conversa.escritorioId, conversa.telefone, conversa.nomeContato, conversa.conexao?.usuarioId ?? null);
    try {
      return await this.iaUso.executar(
        { escritorioId: conversa.escritorioId, tarefa: notaSistema ? 'lembrete_whatsapp' : 'conversa_whatsapp', categoria: 'CONVERSA', conversaId: conversa.id } as any,
        (chave, aoUsar) => respostaAtendimento(chave, { sistema, conversa: conversaIa, notaSistema, resumo, conhecimento }, aoUsar),
      );
    } catch (e: any) {
      if (e instanceof IaIndisponivel) { this.logger.warn(`IA indisponível: ${e.message}`); return null; }
      throw e;
    }
  }

  /** Regras + dados do escritório + catálogo (sem preços). As mensagens do cliente vão à parte. */
  private async montarSistema(escritorioId: string, telefone: string, nomeContato: string | null, donoId: string | null = null) {
    const escritorio = await this.prisma.escritorio.findUnique({ where: { id: escritorioId }, select: { nome: true } });
    const dono = donoId ? await this.prisma.usuario.findUnique({ where: { id: donoId }, select: { nome: true } }) : null;
    const servicos = await this.catalogo.paraAtendimento(escritorioId);
    const fim = String(telefone).slice(-8);
    const clientes = await this.prisma.cliente.findMany({
      where: { escritorioId, deletedAt: null, telefone: { contains: fim.slice(-4) } },
      select: { nome: true, telefone: true }, take: 20,
    });
    const cadastrado = clientes.find((c) => String(c.telefone ?? '').replace(/\D/g, '').endsWith(fim));
    const catalogo = servicos.map((s) => ({
      servico: s.nome, area: s.area, descricao: s.descricao, documentos: s.documentos,
      perguntas: s.perguntas, orientacoes: s.orientacoes, faq: s.faq,
    }));

    const exemplos = await this.aprendizado.exemplosAprovados(escritorioId);
    return regrasAtendimento({
      escritorio: escritorio?.nome ?? null, dono: dono?.nome ?? null, hoje: hojeBrasilia(),
      clienteCadastrado: cadastrado?.nome ?? null, nomeContato, catalogo, exemplos,
    });
  }

  private async encaminhar(conversa: any, r: RespostaAtendimento) {
    await this.prisma.whatsappConversa.update({
      where: { id: conversa.id },
      data: { iaStatus: 'ENCAMINHADA', iaMotivo: (r.motivo || 'Encaminhada pela IA').slice(0, 500) },
    });
    // Atendimento encerrado: a IA sugere o que faltou no catálogo (vai para aprovação)
    if (!simulado() && process.env.APRENDIZADO_DESLIGADO !== 'true') {
      void this.aprendizado.sugerirParaCatalogo(conversa.id).catch((e) => this.logger.warn(`Aprendizado: ${e?.message ?? e}`));
    }
    // Avisa só quem vê este número: o dono e quem ele liberou (cada login tem o próprio WhatsApp)
    const ids = [conversa.conexao?.usuarioId, ...(conversa.conexao?.acessoIds ?? [])].filter(Boolean) as string[];
    const alvo = await this.prisma.usuario.findMany({ where: { id: { in: ids }, escritorioId: conversa.escritorioId, ativo: true }, select: { id: true } });
    const quem = conversa.nomeContato || `+${conversa.telefone}`;
    for (const u of alvo) {
      await this.prisma.notificacao.create({
        data: {
          tipo: 'WHATSAPP_ENCAMINHADO', prioridade: 'alta', link: '/whatsapp', usuarioId: u.id, escritorioId: conversa.escritorioId,
          titulo: `WhatsApp: ${quem} precisa de um advogado`,
          mensagem: `${r.motivo || 'A IA encaminhou a conversa.'}${r.resumoCaso ? `\n\nResumo: ${r.resumoCaso}` : ''}`.slice(0, 2000),
          dados: { conversaId: conversa.id, telefone: conversa.telefone },
        },
      });
    }
  }
}
