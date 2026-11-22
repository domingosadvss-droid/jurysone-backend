/**
 * JURYSONE — Aprendizado do atendimento automático (inspirado nas "anotações" do Dify).
 *
 *   1. EXEMPLOS: quando o advogado responde numa conversa que a IA atendia (pela caixa ou pelo
 *      celular), o par "mensagem do cliente → resposta do advogado" vira um exemplo PENDENTE.
 *      O advogado revisa (pode editar ou descartar); os APROVADOS entram nas regras da IA.
 *   2. CATÁLOGO: quando um atendimento termina, o Claude Haiku lê a conversa e propõe o que
 *      faltou no catálogo (perguntas frequentes, documentos, perguntas de triagem ou um serviço
 *      novo). As propostas vão para a fila de sugestões, que só vale depois da aprovação.
 * Nada muda o comportamento da IA sem a decisão de um advogado de gestão.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { CatalogoService } from '../catalogo/catalogo.service';
import { IaUsoService } from '../ia-uso/ia-uso.service';
import { analisarAtendimentoParaCatalogo, IaIndisponivel } from '../../common/ia-claude';
import { PERFIS_GESTAO, temPerfil } from '../../common/perfis';
import { textoDaMensagem } from './texto-mensagem';

const AREAS = ['IMOBILIARIO', 'EMPRESARIAL', 'TRABALHISTA', 'PREVIDENCIARIO', 'FAMILIA', 'CIVEL', 'CONSUMIDOR', 'CRIMINAL', 'TRIBUTARIO', 'OUTRA'];
/** quantos exemplos aprovados entram nas regras da IA (os mais recentes) */
const EXEMPLOS_NAS_REGRAS = 15;
const RESPOSTA_MINIMA = 15;
const chave = (t: unknown) => String(t ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

@Injectable()
export class AprendizadoAtendimentoService {
  private readonly logger = new Logger(AprendizadoAtendimentoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogo: CatalogoService,
    private readonly iaUso: IaUsoService,
  ) {}

  private gestao(user: any) {
    if (!temPerfil(user, PERFIS_GESTAO)) throw new BadRequestException('Só advogados de gestão revisam o aprendizado da IA.');
  }

  // ─────────────────────────── 1. exemplos ───────────────────────────

  /** Exemplos aprovados que entram nas regras da IA */
  async exemplosAprovados(escritorioId: string) {
    const lista = await this.prisma.atendimentoExemplo.findMany({
      where: { escritorioId, status: 'APROVADO' }, orderBy: { decididoEm: 'desc' }, take: EXEMPLOS_NAS_REGRAS,
      select: { perguntaCliente: true, respostaAdvogado: true },
    });
    return lista.reverse().map((e) => ({ pergunta: e.perguntaCliente.slice(0, 600), resposta: e.respostaAdvogado.slice(0, 1200) }));
  }

  /**
   * Procura respostas do advogado (caixa ou celular) em conversas que a IA atendeu e cria os
   * exemplos pendentes. Roda a cada 30 min e pode ser chamado na hora.
   */
  @Cron('*/30 * * * *', { name: 'aprendizado-exemplos' })
  async capturarExemplosAgendado() {
    if (process.env.APRENDIZADO_DESLIGADO === 'true') return;
    await this.capturarExemplos().catch((e) => this.logger.error(`Capturar exemplos: ${e?.message ?? e}`));
  }

  async capturarExemplos(escritorioId?: string, dias = 7) {
    const desde = new Date(Date.now() - dias * 86400_000);
    const respostas = await this.prisma.whatsappMensagemCaixa.findMany({
      where: {
        ...(escritorioId ? { escritorioId } : {}),
        direcao: 'SAIDA', origem: { in: ['JURYSONE', 'CELULAR'] }, tipo: 'text', dataHora: { gte: desde },
        conversa: { mensagens: { some: { origem: 'IA' } } },
      },
      orderBy: { dataHora: 'asc' }, take: 500,
      select: { id: true, conversaId: true, escritorioId: true, texto: true, dataHora: true, enviadaPorId: true },
    });
    if (!respostas.length) return { criados: 0 };
    const ja = new Set((await this.prisma.atendimentoExemplo.findMany({
      where: { mensagemAdvogadoId: { in: respostas.map((r) => r.id) } }, select: { mensagemAdvogadoId: true },
    })).map((x) => x.mensagemAdvogadoId));
    let criados = 0;
    for (const r of respostas) {
      if (ja.has(r.id) || String(r.texto ?? '').trim().length < RESPOSTA_MINIMA) continue;
      // Mensagens do cliente logo antes da resposta (até a saída anterior)
      const antes = await this.prisma.whatsappMensagemCaixa.findMany({
        where: { conversaId: r.conversaId, dataHora: { lt: r.dataHora } }, orderBy: { dataHora: 'desc' }, take: 12,
      });
      const doCliente: string[] = [];
      let respostaIa: string | null = null;
      for (const m of antes) {
        if (m.direcao === 'ENTRADA') { doCliente.unshift(textoDaMensagem(m)); continue; }
        if (m.origem === 'IA') respostaIa = m.texto;
        break;
      }
      if (!doCliente.length) continue; // advogado continuou a própria fala: não é par pergunta/resposta
      await this.prisma.atendimentoExemplo.create({
        data: {
          escritorioId: r.escritorioId, conversaId: r.conversaId, mensagemAdvogadoId: r.id,
          perguntaCliente: doCliente.join('\n').slice(0, 4000), respostaAdvogado: String(r.texto).trim().slice(0, 4000),
          respostaIa: respostaIa?.slice(0, 4000) ?? null, criadoPorId: r.enviadaPorId ?? null,
        },
      }).then(() => { criados++; }).catch(() => undefined); // corrida com outra rodada: ignora duplicado
    }
    if (criados) this.logger.log(`Aprendizado: ${criados} exemplo(s) novo(s) para revisar.`);
    return { criados };
  }

  /** Conversas que o usuário vê (WhatsApp do próprio login + números liberados para ele) */
  private async conversasVisiveis(user: any) {
    const cs = await this.prisma.whatsappConversa.findMany({
      where: { escritorioId: user.officeId, conexao: { OR: [{ usuarioId: user.id }, { acessoIds: { has: user.id } }] } },
      select: { id: true },
    });
    return cs.map((c) => c.id);
  }

  async listarExemplos(user: any, q: any = {}) {
    this.gestao(user);
    const status = String(q?.status ?? 'PENDENTE').toUpperCase();
    return this.prisma.atendimentoExemplo.findMany({
      where: { escritorioId: user.officeId, conversaId: { in: await this.conversasVisiveis(user) }, ...(status === 'TODOS' ? {} : { status }) },
      orderBy: { createdAt: 'desc' }, take: 200,
    });
  }

  /** { status: APROVADO | DESCARTADO | PENDENTE, perguntaCliente?, respostaAdvogado? } (edição antes de aprovar) */
  async decidirExemplo(user: any, id: string, dto: any) {
    this.gestao(user);
    const e = await this.prisma.atendimentoExemplo.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!e || !e.conversaId || !(await this.conversasVisiveis(user)).includes(e.conversaId)) throw new NotFoundException('Exemplo não encontrado.');
    const status = String(dto?.status ?? '').toUpperCase();
    if (!['APROVADO', 'DESCARTADO', 'PENDENTE'].includes(status)) throw new BadRequestException('Status inválido: APROVADO, DESCARTADO ou PENDENTE.');
    const pergunta = dto?.perguntaCliente !== undefined ? String(dto.perguntaCliente).trim() : e.perguntaCliente;
    const resposta = dto?.respostaAdvogado !== undefined ? String(dto.respostaAdvogado).trim() : e.respostaAdvogado;
    if (status === 'APROVADO' && (!pergunta || resposta.length < 5)) throw new BadRequestException('Preencha a mensagem do cliente e a resposta.');
    return this.prisma.atendimentoExemplo.update({
      where: { id },
      data: {
        status, perguntaCliente: pergunta.slice(0, 4000), respostaAdvogado: resposta.slice(0, 4000),
        decididoPorId: status === 'PENDENTE' ? null : user.id, decididoEm: status === 'PENDENTE' ? null : new Date(),
      },
    });
  }

  // ─────────────────────────── 2. catálogo ───────────────────────────

  /** Analisa um atendimento encerrado e manda as sugestões para a fila do catálogo */
  async sugerirParaCatalogo(conversaId: string) {
    const conversa = await this.prisma.whatsappConversa.findUnique({ where: { id: conversaId } });
    if (!conversa) throw new NotFoundException('Conversa não encontrada.');
    const mensagens = await this.prisma.whatsappMensagemCaixa.findMany({ where: { conversaId }, orderBy: { dataHora: 'asc' }, take: 120 });
    await this.prisma.whatsappConversa.update({ where: { id: conversaId }, data: { aprendizadoEm: new Date() } });
    if (mensagens.filter((m) => m.direcao === 'ENTRADA').length < 2) return { sugestoes: 0, motivo: 'conversa curta demais' };

    const servicos = await this.catalogo.paraAtendimento(conversa.escritorioId);
    const catalogoIa = servicos.map((s) => ({ codigo: s.codigo, nome: s.nome, area: s.area, documentos: s.documentos, perguntas: s.perguntas, faq: s.faq }));
    let r;
    try {
      r = await this.iaUso.executar(
        { escritorioId: conversa.escritorioId, tarefa: 'aprendizado_catalogo', categoria: 'PESADA', conversaId } as any,
        (apiKey, aoUsar) => analisarAtendimentoParaCatalogo(apiKey, {
          conversa: mensagens.map((m) => ({ deCliente: m.direcao === 'ENTRADA', texto: textoDaMensagem(m) })), catalogo: catalogoIa,
        }, aoUsar),
      );
    } catch (e: any) {
      if (e instanceof IaIndisponivel) return { sugestoes: 0, motivo: e.message };
      throw e;
    }

    let criadas = 0;
    for (const s of r.sugestoes.slice(0, 5)) {
      try {
        if (s.tipo === 'AJUSTE') {
          const alvo = servicos.find((x) => x.codigo === s.servicoCodigo);
          if (!alvo) continue;
          const dados: Record<string, any> = {};
          const faq = this.juntar(alvo.faq as any[], s.faqNovas, 'pergunta');
          const documentos = this.juntar(alvo.documentos as any[], s.documentosNovos, 'texto');
          const perguntas = this.juntar(alvo.perguntas as any[], s.perguntasNovas, 'pergunta');
          if (faq) dados.faq = faq;
          if (documentos) dados.documentos = documentos;
          if (perguntas) dados.perguntas = perguntas;
          if (!Object.keys(dados).length) continue;
          await this.catalogo.sugerir(conversa.escritorioId, { tipo: 'AJUSTE', servicoId: alvo.id, dados, justificativa: `[IA] ${s.justificativa}`, origem: 'IA', conversaId });
        } else {
          if (!s.nome.trim()) continue;
          await this.catalogo.sugerir(conversa.escritorioId, {
            tipo: 'NOVO_SERVICO', origem: 'IA', conversaId, justificativa: `[IA] ${s.justificativa}`,
            dados: {
              nome: s.nome, area: AREAS.includes(s.area.toUpperCase()) ? s.area.toUpperCase() : 'OUTRA', descricao: s.descricao,
              documentos: s.documentosNovos, perguntas: s.perguntasNovas, faq: s.faqNovas,
            },
          });
        }
        criadas++;
      } catch (e: any) {
        this.logger.warn(`Sugestão do aprendizado descartada: ${e?.message ?? e}`);
      }
    }
    return { sugestoes: criadas };
  }

  /** Lista atual + itens novos (sem repetir pelo texto); null se não há nada novo */
  private juntar(atual: any[], novos: any[], campo: string): any[] | null {
    const lista = Array.isArray(atual) ? [...atual] : [];
    const vistos = new Set(lista.map((x) => chave(x?.[campo])));
    let mudou = false;
    for (const n of novos ?? []) {
      const k = chave(n?.[campo]);
      if (!k || vistos.has(k)) continue;
      vistos.add(k); lista.push(n); mudou = true;
    }
    return mudou ? lista : null;
  }

  /**
   * Atendimentos que terminaram sem passar pelo "encaminhar" (o advogado assumiu, ou o cliente
   * sumiu): analisa os parados há mais de 24 h. Até 5 por hora, para não gastar de uma vez.
   */
  @Cron('10 * * * *', { name: 'aprendizado-catalogo' })
  async analisarParados() {
    if (process.env.APRENDIZADO_DESLIGADO === 'true') return;
    const limite = new Date(Date.now() - 24 * 3600_000);
    const conversas = await this.prisma.whatsappConversa.findMany({
      where: { aprendizadoEm: null, ultimaMensagemEm: { lt: limite }, mensagens: { some: { origem: 'IA', status: { not: 'simulada' } } } },
      select: { id: true }, take: 5,
    });
    for (const c of conversas) {
      await this.sugerirParaCatalogo(c.id).catch((e) => this.logger.warn(`Aprendizado da conversa ${c.id}: ${e?.message ?? e}`));
    }
  }

  /** Números para o painel de qualidade do atendimento */
  async painel(user: any, dias = 30) {
    this.gestao(user);
    const escritorioId = user.officeId;
    const desde = new Date(Date.now() - dias * 86400_000);
    const visiveis = await this.conversasVisiveis(user);
    const base = { escritorioId, id: { in: visiveis }, mensagens: { some: { origem: 'IA', dataHora: { gte: desde } } } };
    const [atendidas, encaminhadas, pausadas, exemplosPendentes, exemplosAprovados, sugestoesPendentes, lembretes] = await Promise.all([
      this.prisma.whatsappConversa.count({ where: base }),
      this.prisma.whatsappConversa.count({ where: { ...base, iaStatus: 'ENCAMINHADA' } }),
      this.prisma.whatsappConversa.count({ where: { ...base, iaStatus: 'PAUSADA' } }),
      this.prisma.atendimentoExemplo.count({ where: { escritorioId, status: 'PENDENTE', conversaId: { in: visiveis } } }),
      this.prisma.atendimentoExemplo.count({ where: { escritorioId, status: 'APROVADO' } }),
      this.prisma.sugestaoCatalogo.count({ where: { escritorioId, status: 'PENDENTE' } }),
      this.prisma.whatsappConversa.count({ where: { ...base, lembretesEnviados: { gt: 0 } } }),
    ]);
    return { dias, atendidas, encaminhadas, pausadas, comLembrete: lembretes, exemplosPendentes, exemplosAprovados, sugestoesPendentes };
  }
}
