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
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { IaUsoService } from '../ia-uso/ia-uso.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { CaixaWhatsappService } from '../whatsapp-oficial/caixa.service';
import { RegistroMensagensService } from '../whatsapp-oficial/registro-mensagens.service';
import { IaIndisponivel, MensagemConversa, RespostaAtendimento, respostaAtendimento } from '../../common/ia-claude';
import { PERFIS_GESTAO, temPerfil } from '../../common/perfis';
import { regrasAtendimento } from './regras-atendimento';

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

const TIPOS_MIDIA: Record<string, string> = {
  image: '[foto]', video: '[vídeo]', audio: '[áudio — a IA não ouve áudios]', sticker: '[figurinha]',
  location: '[localização]', contacts: '[contato compartilhado]', reaction: '[reação]',
};

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
  ) {}

  onModuleInit() {
    this.registro.aoRegistrar((m) => {
      if (m.direcao === 'ENTRADA' && m.origem === 'CLIENTE') this.agendar(m.escritorioId, m.conversaId);
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

      const mensagens = await this.prisma.whatsappMensagemCaixa.findMany({
        where: { conversaId }, orderBy: { dataHora: 'desc' }, take: 60,
      });
      mensagens.reverse();
      const conversaIa: MensagemConversa[] = mensagens
        .filter((m) => m.status !== 'falhou')
        .map((m) => ({ deCliente: m.direcao === 'ENTRADA', texto: this.textoDa(m) }));

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
            (chave, aoUsar) => respostaAtendimento(chave, { sistema, conversa: conversaIa }, aoUsar),
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
    const base = (m.texto ?? '').trim();
    if (m.tipo === 'text' || m.tipo === 'button' || m.tipo === 'interactive') return base;
    const rotulo = m.tipo === 'document' ? `[documento${m.midiaNome ? `: ${m.midiaNome}` : ''}]` : TIPOS_MIDIA[m.tipo] ?? `[${m.tipo}]`;
    return base ? `${rotulo} ${base}` : rotulo;
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

    return regrasAtendimento({
      escritorio: escritorio?.nome ?? null, dono: dono?.nome ?? null, hoje: hojeBrasilia(),
      clienteCadastrado: cadastrado?.nome ?? null, nomeContato, catalogo,
    });
  }

  private async encaminhar(conversa: any, r: RespostaAtendimento) {
    await this.prisma.whatsappConversa.update({
      where: { id: conversa.id },
      data: { iaStatus: 'ENCAMINHADA', iaMotivo: (r.motivo || 'Encaminhada pela IA').slice(0, 500) },
    });
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
