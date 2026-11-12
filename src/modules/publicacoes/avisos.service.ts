/**
 * JURYSONE — Avisos da etapa 4
 *
 *   • Sino do sistema (99, 100): notificações internas.
 *   • Mensagens ao cliente por WhatsApp (MensagemCliente):
 *       119 audiência → aviso automático + lembretes 2 dias antes e no dia (sem aprovação);
 *       120 marcos    → resumo simples pela IA, só sai depois da aprovação do advogado;
 *       122 dativa    → apresentação ao assistido, com aprovação.
 *   • Rotinas: envio das mensagens agendadas, alertas de prazo (3 dias antes e no dia) e
 *     saúde da captura do DJEN (127: WhatsApp pessoal do titular após 24 h sem captura).
 *
 * Observação: fora da janela de 24 h da conversa, a API oficial do WhatsApp (Meta) só
 * entrega mensagens iniciadas pelo escritório com modelo (template) aprovado.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ChavesService } from '../chaves/chaves.service';
import { PERFIS, perfisDo } from '../../common/perfis';
import { IaIndisponivel, resumoParaCliente } from '../../common/ia-claude';
import { MARCOS } from './analise';
import { diaLocal } from './agenda-prazos.service';
import { somarDias } from './calendario';

const STATUS_ENVIAVEIS = ['AGENDADA'];

function primeiroNome(nome?: string | null) {
  return String(nome ?? '').trim().split(/\s+/)[0] || 'cliente';
}

function dataBr(dia: string) {
  return dia.split('-').reverse().join('/');
}

@Injectable()
export class AvisosService {
  private readonly logger = new Logger(AvisosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly chaves: ChavesService,
  ) {}

  // ═══════════════════════ SINO ═══════════════════════════════════════════

  async sino(escritorioId: string, usuarioId: string, tipo: string, titulo: string, mensagem: string, link?: string, prioridade = 'normal') {
    return this.prisma.notificacao.create({
      data: { escritorioId, usuarioId, tipo, titulo: titulo.slice(0, 200), mensagem: mensagem.slice(0, 1000), link: link ?? null, prioridade },
    });
  }

  // ═══════════════════════ MENSAGENS AO CLIENTE ═══════════════════════════

  private async criarMensagem(d: {
    escritorioId: string; tipo: string; chave: string; clienteId?: string | null; processoId?: string | null; origemId?: string | null;
    telefone?: string | null; texto: string; precisaAprovacao: boolean; enviarEm?: Date | null; responsavelId?: string | null;
  }) {
    const existe = await this.prisma.mensagemCliente.findUnique({ where: { escritorioId_chave: { escritorioId: d.escritorioId, chave: d.chave } } });
    if (existe) return existe;
    return this.prisma.mensagemCliente.create({
      data: {
        escritorioId: d.escritorioId, tipo: d.tipo, chave: d.chave, clienteId: d.clienteId ?? null, processoId: d.processoId ?? null,
        origemId: d.origemId ?? null, telefone: d.telefone ?? null, texto: d.texto, precisaAprovacao: d.precisaAprovacao,
        status: d.precisaAprovacao ? 'RASCUNHO' : 'AGENDADA', enviarEm: d.enviarEm ?? new Date(), responsavelId: d.responsavelId ?? null,
      },
    });
  }

  /** 119: aviso imediato + lembretes 2 dias antes e no dia, sem aprovação */
  async agendarAvisosAudiencia(escritorioId: string, eventoId: string, processoId: string, clienteId: string,
    aud: { data: string; hora: string | null; virtual: boolean }, numero: string) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id: clienteId, escritorioId }, select: { nome: true, telefone: true } });
    const dativa = await this.prisma.casoDativa.findUnique({ where: { processoId } });
    const responsavel = (await this.prisma.processo.findUnique({ where: { id: processoId }, select: { responsavelId: true } }))?.responsavelId ?? null;
    if (!cliente?.telefone || dativa?.reuPreso) {
      if (responsavel) {
        await this.sino(escritorioId, responsavel, 'AUDIENCIA_SEM_AVISO', 'Avise o cliente da audiência',
          `Audiência em ${dataBr(aud.data)}${aud.hora ? ` às ${aud.hora}` : ''} (processo ${numero}): ${dativa?.reuPreso ? 'réu preso' : 'cliente sem telefone cadastrado'} — o aviso automático não foi enviado.`, `/agenda`, 'alta');
      }
      return [];
    }
    const quando = `${dataBr(aud.data)}${aud.hora ? `, às ${aud.hora}` : ' (horário a confirmar)'}`;
    const onde = aud.virtual ? 'Ela será por videoconferência: enviaremos o link assim que disponível.' : 'Confirme conosco o local antes do dia.';
    const nome = primeiroNome(cliente.nome);
    const base = { escritorioId, processoId, clienteId, origemId: eventoId, telefone: cliente.telefone, precisaAprovacao: false, responsavelId: responsavel };
    const msgs = [
      await this.criarMensagem({
        ...base, tipo: 'AVISO_AUDIENCIA', chave: `aud:${eventoId}:aviso`, enviarEm: new Date(),
        texto: `Olá, ${nome}! Foi marcada uma audiência no seu processo para ${quando}. ${onde} Leve documento com foto e, se houver testemunhas, avise-nos com antecedência. Qualquer dúvida, responda esta mensagem.`,
      }),
    ];
    const lembretes: [string, string][] = [[somarDias(aud.data, -2), '2d'], [aud.data, 'dia']];
    for (const [dia, rot] of lembretes) {
      if (dia < diaLocal(new Date())) continue;
      msgs.push(await this.criarMensagem({
        ...base, tipo: 'LEMBRETE_AUDIENCIA', chave: `aud:${eventoId}:${rot}`, enviarEm: new Date(`${dia}T08:00:00-03:00`),
        texto: rot === 'dia'
          ? `Bom dia, ${nome}! Lembrete: sua audiência é hoje${aud.hora ? `, às ${aud.hora}` : ''}. ${aud.virtual ? 'Entre no link com alguns minutos de antecedência.' : 'Chegue com 30 minutos de antecedência.'}`
          : `Olá, ${nome}! Lembrete: sua audiência será em ${quando}. Leve documento com foto. Qualquer dúvida, responda esta mensagem.`,
      }));
    }
    return msgs;
  }

  /** 120: rascunho do aviso de marco (sentença, liminar, acórdão, acordo, alvará), com aprovação */
  async rascunhoMarco(escritorioId: string, d: { intimacaoId: string; processoId: string; clienteId: string; marcos: string[]; texto: string; numero: string; responsavelId?: string | null }) {
    const cliente = await this.prisma.cliente.findFirst({ where: { id: d.clienteId, escritorioId }, select: { nome: true, telefone: true } });
    if (!cliente) return null;
    const descricao = d.marcos.map((m) => MARCOS[m] ?? m).join(', ');
    let texto: string;
    let viaIa = false;
    try {
      const chave = await this.chaves.getChave(escritorioId, 'anthropic');
      texto = await resumoParaCliente(chave, { marco: descricao, numeroProcesso: d.numero, nomeCliente: cliente.nome, textoPublicacao: d.texto });
      viaIa = true;
    } catch (e: any) {
      if (!(e instanceof IaIndisponivel)) this.logger.warn(`Resumo por IA falhou: ${e?.message ?? e}`);
      texto = `Olá, ${primeiroNome(cliente.nome)}! Há novidade no seu processo (${d.numero}): ${descricao}. O advogado responsável vai explicar o que isso significa e quais são os próximos passos.`;
    }
    const msg = await this.criarMensagem({
      escritorioId, tipo: 'MARCO_PROCESSO', chave: `marco:${d.intimacaoId}`, clienteId: d.clienteId, processoId: d.processoId,
      origemId: d.intimacaoId, telefone: cliente.telefone, texto, precisaAprovacao: true, responsavelId: d.responsavelId ?? null,
    });
    if (d.responsavelId) {
      await this.sino(escritorioId, d.responsavelId, 'MENSAGEM_PARA_APROVAR', 'Aviso ao cliente aguardando aprovação',
        `${descricao} no processo ${d.numero}: ${viaIa ? 'resumo pronto' : 'texto padrão (IA indisponível)'} para aprovar${cliente.telefone ? '' : ' — cliente sem telefone'}.`, `/mensagens/${msg.id}`);
    }
    return msg;
  }

  /** 122: apresentação ao assistido da dativa, com aprovação */
  async rascunhoApresentacaoDativa(escritorioId: string, d: { processoId: string; clienteId: string; telefone: string; nomeAssistido: string; advogado: string; numero: string; responsavelId: string }) {
    return this.criarMensagem({
      escritorioId, tipo: 'APRESENTACAO_DATIVA', chave: `dativa:${d.processoId}:apresentacao`, clienteId: d.clienteId, processoId: d.processoId,
      telefone: d.telefone, precisaAprovacao: true, responsavelId: d.responsavelId,
      texto: `Olá, ${primeiroNome(d.nomeAssistido)}! Sou ${d.advogado}, advogado(a) nomeado(a) pelo juiz para fazer a sua defesa no processo ${d.numero}. ` +
        'Você não paga nada por esse atendimento: os honorários são pagos pelo Estado. ' +
        'Por favor, responda esta mensagem para combinarmos uma conversa e me envie fotos dos documentos que tiver sobre o caso.',
    });
  }

  listar(user: any, q: any = {}) {
    const where: any = { escritorioId: user.officeId };
    if (q.status) where.status = String(q.status).toUpperCase();
    if (q.processoId) where.processoId = q.processoId;
    if (!this.podeVerTodas(user)) where.responsavelId = user.id;
    return this.prisma.mensagemCliente.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  private podeVerTodas(user: any) {
    return perfisDo(user).some((p) => [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO].includes(p as any));
  }

  private async rascunhoDoUsuario(user: any, id: string) {
    const m = await this.prisma.mensagemCliente.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!m) throw new NotFoundException('Mensagem não encontrada');
    if (!this.podeVerTodas(user) && m.responsavelId !== user.id) throw new ForbiddenException('Mensagem de outro advogado.');
    if (m.status !== 'RASCUNHO') throw new BadRequestException(`A mensagem já está ${m.status.toLowerCase()}.`);
    return m;
  }

  /** Aprova (podendo editar o texto) e envia já */
  async aprovar(user: any, id: string, dto: any = {}) {
    const m = await this.rascunhoDoUsuario(user, id);
    const texto = dto?.texto ? String(dto.texto).slice(0, 4000) : m.texto;
    const telefone = dto?.telefone ?? m.telefone;
    if (!telefone) throw new BadRequestException('Cliente sem telefone: informe o telefone para enviar.');
    await this.prisma.mensagemCliente.update({
      where: { id }, data: { texto, telefone, status: 'AGENDADA', aprovadaPorId: user.id, aprovadaEm: new Date(), enviarEm: new Date() },
    });
    await this.enviar(id);
    return this.prisma.mensagemCliente.findUnique({ where: { id } });
  }

  async descartar(user: any, id: string) {
    await this.rascunhoDoUsuario(user, id);
    return this.prisma.mensagemCliente.update({ where: { id }, data: { status: 'DESCARTADA' } });
  }

  private async enviar(id: string) {
    const m = await this.prisma.mensagemCliente.findUnique({ where: { id } });
    if (!m || !STATUS_ENVIAVEIS.includes(m.status)) return;
    const ok = m.telefone ? await this.whatsapp.enviarTextoSimples(m.telefone, m.texto) : false;
    if (ok && m.clienteId) {
      await this.prisma.whatsappMessage.create({
        data: {
          escritorioId: m.escritorioId, telefone: m.telefone!, tipo: 'texto', conteudo: m.texto, status: 'enviada',
          enviadoEm: new Date(), clienteId: m.clienteId, processoId: m.processoId,
        },
      }).catch(() => undefined);
    }
    const tentativas = m.tentativas + 1;
    await this.prisma.mensagemCliente.update({
      where: { id },
      data: ok
        ? { status: 'ENVIADA', enviadaEm: new Date(), tentativas, erro: null }
        : { tentativas, erro: m.telefone ? 'Falha no envio pelo WhatsApp (API não configurada ou recusou).' : 'Sem telefone', status: tentativas >= 3 || !m.telefone ? 'FALHOU' : 'AGENDADA', enviarEm: new Date(Date.now() + 30 * 60 * 1000) },
    });
  }

  /** Envia as mensagens agendadas que já venceram */
  @Cron('*/10 * * * *')
  async enviarAgendadas() {
    const pendentes = await this.prisma.mensagemCliente.findMany({
      where: { status: 'AGENDADA', enviarEm: { lte: new Date() } }, orderBy: { enviarEm: 'asc' }, take: 100,
    });
    for (const m of pendentes) await this.enviar(m.id).catch((e) => this.logger.warn(`Envio ${m.id}: ${e.message}`));
    return { processadas: pendentes.length };
  }

  // ═══════════════════════ ALERTAS DE PRAZO (100) ═════════════════════════

  @Cron('0 7 * * *', { timeZone: 'America/Sao_Paulo' })
  async alertarPrazos(agora = new Date()) {
    const hoje = diaLocal(agora);
    const limite3d = new Date(`${somarDias(hoje, 3)}T23:59:59-03:00`);
    const prazos = await this.prisma.prazo.findMany({
      where: { status: 'pendente', deletedAt: null, dataPrazo: { gte: new Date(`${hoje}T00:00:00-03:00`), lte: limite3d } },
    });
    let enviados = 0;
    for (const p of prazos) {
      const venc = diaLocal(p.dataPrazo);
      const ehHoje = venc === hoje;
      if (ehHoje && p.alertaDiaEm) continue;
      if (!ehHoje && p.alerta3dEm) continue;
      const destinatarios = p.responsaveisIds.length ? p.responsaveisIds : [];
      for (const uid of destinatarios) {
        await this.sino(p.escritorioId, uid, ehHoje ? 'PRAZO_HOJE' : 'PRAZO_PROXIMO',
          ehHoje ? 'Prazo vence HOJE' : 'Prazo vence em até 3 dias',
          `${p.descricao} — vence em ${dataBr(venc)}${p.conferir ? ' (provisório, conferir)' : ''}.`, `/prazos/${p.id}`, 'alta');
        enviados++;
      }
      await this.prisma.prazo.update({ where: { id: p.id }, data: ehHoje ? { alertaDiaEm: new Date() } : { alerta3dEm: new Date() } });
    }
    return { prazos: prazos.length, avisos: enviados };
  }

  // ═══════════════════════ SAÚDE DA CAPTURA (127) ═════════════════════════

  @Cron('30 * * * *')
  async verificarSaudeCaptura(agora = new Date()) {
    const limite = new Date(agora.getTime() - 24 * 3600 * 1000);
    const atrasados = await this.prisma.estadoCapturaDjen.findMany({
      where: { alertaEnviadoEm: null, OR: [{ ultimoSucessoEm: { lt: limite } }, { ultimoSucessoEm: null, createdAt: { lt: limite } }] },
    });
    let alertas = 0;
    for (const e of atrasados) {
      const admins = await this.prisma.usuario.findMany({
        where: { escritorioId: e.escritorioId, ativo: true, roles: { contains: 'ADMIN' } }, select: { id: true, telefone: true },
      });
      const texto = `JurysOne: há mais de 24 h sem capturar publicações do DJEN para a OAB ${e.oab}/${e.uf}. ` +
        `Último erro: ${e.ultimoErro ?? 'sem registro'}. O sistema continua tentando e recupera o período quando voltar; confira o diário manualmente até lá.`;
      for (const a of admins) {
        await this.sino(e.escritorioId, a.id, 'CAPTURA_DJEN_FALHA', 'Captura do DJEN parada há mais de 24 h', texto, '/publicacoes/saude', 'alta');
        if (a.telefone) await this.whatsapp.enviarTextoSimples(a.telefone, texto);
      }
      await this.prisma.estadoCapturaDjen.update({ where: { id: e.id }, data: { alertaEnviadoEm: new Date() } });
      alertas++;
    }
    return { alertas };
  }
}
