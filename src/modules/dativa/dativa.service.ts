/**
 * JURYSONE — Advocacia dativa (etapa 4)
 *
 *   101/102 nomeação detectada no DJEN ou no e-mail do AJG → caso criado sozinho
 *           (processo, assistido, linha da dativa e prazos);
 *   103/104 e-mails do AJG chegam por encaminhamento automático a um endereço do sistema;
 *   105     fim: lembrar a fixação dos honorários, certidão, pedido ao Estado e crédito;
 *   106     honorários só do advogado nomeado: fora do caixa do escritório e da cota-parte;
 *   107     réu preso: destaque e alerta a cada 90 dias (CPP, art. 316, parágrafo único);
 *   121     conflito de interesses e impedimentos antes do aceite + prazo de aceite;
 *   122     primeiro contato: WhatsApp com aprovação, ou tarefa (sem telefone / réu preso);
 *   123/124 cópia dos autos → varredura de prompt injection → rascunho da 1ª peça pelo Claude.
 */
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS, perfisDo } from '../../common/perfis';
import { ConflitosService } from '../conflitos/conflitos.service';
import { LinhaProducaoService } from '../linha-producao/linha-producao.service';
import { ArquivosService } from '../arquivos/arquivos.service';
import { ChavesService } from '../chaves/chaves.service';
import { AgendaPrazosService, diaLocal } from '../publicacoes/agenda-prazos.service';
import { AvisosService } from '../publicacoes/avisos.service';
import { criarClienteIncompleto, procurarCliente } from '../publicacoes/clientes-vinculo';
import { somarDias } from '../publicacoes/calendario';
import { comarcaDoOrgao, ehPenal, extrairTelefone, mascararCnj, mencionaReuPreso, numeroCnj, textoPlano, tribunalDoNumero } from '../publicacoes/analise';
import { varrerDocumento } from '../../common/varredura-documento';
import { IaIndisponivel, rascunhoDePeca } from '../../common/ia-claude';

const DIAS_ACEITE = Number(process.env.DATIVA_PRAZO_ACEITE_DIAS ?? 5);
const CHAVE_TOKEN_AJG = 'ajg_email_token';

function hash(t: string) {
  return createHash('sha256').update(t).digest('hex');
}

function valorBr(txt: string): number | null {
  const n = Number(txt.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

@Injectable()
export class DativaService {
  private readonly logger = new Logger(DativaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflitos: ConflitosService,
    private readonly linhas: LinhaProducaoService,
    private readonly arquivos: ArquivosService,
    private readonly chaves: ChavesService,
    @Inject(forwardRef(() => AgendaPrazosService)) private readonly agenda: AgendaPrazosService,
    @Inject(forwardRef(() => AvisosService)) private readonly avisos: AvisosService,
  ) {}

  // ═══════════════════════ CRIAÇÃO DO CASO ════════════════════════════════

  async criarDaNomeacao(d: {
    escritorioId: string; advogadoId: string; fonte: 'DJEN' | 'AJG_EMAIL' | 'MANUAL'; origemRef?: string | null;
    numeroProcesso: string; tribunal?: string | null; orgao?: string | null; classe?: string | null;
    nomeadoEm: string; texto: string; destinatarios: { nome: string; polo: string | null }[];
    assistidoNome?: string | null; telefone?: string | null; comarca?: string | null; referenciaAjg?: string | null;
  }) {
    const { escritorioId } = d;
    const advogado = await this.prisma.usuario.findFirst({ where: { id: d.advogadoId, escritorioId }, select: { id: true, nome: true } });
    if (!advogado) throw new BadRequestException('Advogado nomeado não pertence ao escritório.');
    const numeroDig = numeroCnj(d.numeroProcesso);
    const numero = numeroDig ? mascararCnj(numeroDig) : d.numeroProcesso;

    // Já existe caso para este processo? (DJEN e e-mail do AJG podem trazer a mesma nomeação)
    if (numeroDig) {
      const procs = await this.prisma.processo.findMany({ where: { escritorioId, deletedAt: null }, select: { id: true, numero: true, clienteId: true } });
      const existente = procs.find((p) => numeroCnj(p.numero) === numeroDig);
      if (existente) {
        const caso = await this.prisma.casoDativa.findUnique({ where: { processoId: existente.id } });
        if (caso) return { processoId: existente.id, clienteId: existente.clienteId, caso, duplicado: true };
      }
    }

    const penal = ehPenal(d.classe, d.orgao, d.texto.slice(0, 2000));
    const comarca = d.comarca ?? comarcaDoOrgao(d.orgao);
    const reuPreso = mencionaReuPreso(d.texto);
    // Assistido: no penal, o polo passivo; nos demais, o primeiro destinatário que não é o Ministério Público
    const semMp = d.destinatarios.filter((x) => !/minist[eé]rio\s+p[uú]blico|defensoria/i.test(x.nome));
    const assistidoNome = (d.assistidoNome
      ?? (penal ? semMp.find((x) => /^p/i.test(String(x.polo ?? '')))?.nome : null)
      ?? semMp[0]?.nome ?? 'Assistido (nome a completar)').trim();
    const contrapartes = d.destinatarios.filter((x) => x.nome && x.nome !== assistidoNome).map((x) => ({ nome: x.nome, polo: x.polo }));

    // 121: conflito e impedimentos ANTES de aceitar o encargo
    const ocorrencias: any[] = [];
    for (const cp of contrapartes.length ? contrapartes : [{ nome: '' }]) {
      try {
        const r = await this.conflitos.verificar(escritorioId, { nome: assistidoNome, parteContrariaNome: cp.nome || undefined, orgao: d.orgao });
        for (const o of r.ocorrencias) if (!ocorrencias.some((x) => x.mensagem === o.mensagem)) ocorrencias.push(o);
      } catch { /* sem dados suficientes para checar */ }
    }

    // 110/111: assistido já cadastrado?
    const busca = await procurarCliente(this.prisma, escritorioId, assistidoNome, comarca ?? d.orgao);
    let clienteId: string;
    let observacao: string | null = null;
    if (busca.tipo === 'VINCULADO') {
      clienteId = busca.clienteId;
      if (d.telefone) await this.prisma.cliente.updateMany({ where: { id: clienteId, telefone: null }, data: { telefone: d.telefone } });
    } else {
      const novo = await criarClienteIncompleto(this.prisma, escritorioId, {
        nome: assistidoNome, telefone: d.telefone, cidade: comarca, origem: 'DATIVA',
        observacao: 'Assistido da advocacia dativa (cadastro automático). Completar CPF, contato e endereço.',
      });
      clienteId = novo.id;
      if (busca.tipo === 'CONFIRMAR') {
        observacao = `Há cliente(s) com o mesmo nome (${busca.candidatos.map((c) => `${c.nome}${c.cidade ? ` — ${c.cidade}` : ''}`).join('; ')}). Confirme se é a mesma pessoa.`;
      }
    }

    const processo = await this.prisma.processo.create({
      data: {
        escritorioId, numero, tribunal: d.tribunal ?? tribunalDoNumero(numero), area: 'DATIVA', tipo: 'DATIVA',
        tipoAcao: d.classe ?? null, titulo: `Dativa — ${d.classe ?? 'processo'} — ${assistidoNome}`.slice(0, 250),
        clienteId, responsavelId: advogado.id, dataInicio: new Date(`${d.nomeadoEm}T12:00:00-03:00`),
        camposCustom: { dativa: true, comarca, orgao: d.orgao ?? null, partes: contrapartes } as any,
      },
    });

    const nomeadoEm = new Date(`${d.nomeadoEm}T12:00:00-03:00`);
    const caso = await this.prisma.casoDativa.create({
      data: {
        escritorioId, processoId: processo.id, advogadoId: advogado.id, fonte: d.fonte, origemRef: d.origemRef ?? null,
        status: 'NOMEADO', nomeadoEm, comarca, materia: penal ? 'CRIMINAL' : 'CIVEL', referenciaAjg: d.referenciaAjg ?? null,
        conflitos: ocorrencias.length ? (ocorrencias as any) : undefined,
        reuPreso, presoDesde: reuPreso ? nomeadoEm : null,
        proximoAlertaPreventiva: reuPreso ? new Date(nomeadoEm.getTime() + 90 * 86400_000) : null,
        observacao,
      },
    });

    // Linha de produção da dativa
    try {
      await this.linhas.iniciar(escritorioId, processo.id, { codigo: 'DATIVA' }, { id: advogado.id });
    } catch {
      try {
        await this.linhas.instalarPadrao(escritorioId);
        await this.linhas.iniciar(escritorioId, processo.id, { codigo: 'DATIVA' }, { id: advogado.id });
      } catch (e: any) { this.logger.warn(`Linha da dativa não iniciada: ${e?.message ?? e}`); }
    }

    // Prazo para aceitar a nomeação (regra do AJG/TJSC a confirmar → entra como "conferir")
    const prazoAceite = await this.agenda.lancarPrazoDaPublicacao({
      escritorioId, processoId: processo.id, clienteId, responsaveisIds: [advogado.id],
      disponibilizacao: d.nomeadoEm, dias: DIAS_ACEITE, duvidoso: true, contagem: 'UTEIS',
      tribunal: processo.tribunal, comarca, descricao: `Aceitar a nomeação no sistema AJG — ${numero}`,
      origem: 'DATIVA_ACEITE', criadoPorId: advogado.id,
    });
    await this.prisma.casoDativa.update({ where: { id: caso.id }, data: { aceiteAte: prazoAceite.dataPrazo } });

    // 122: primeiro contato
    const telefone = d.telefone ?? (busca.tipo === 'VINCULADO' ? (await this.prisma.cliente.findUnique({ where: { id: clienteId }, select: { telefone: true } }))?.telefone : null);
    if (telefone && !reuPreso) {
      await this.avisos.rascunhoApresentacaoDativa(escritorioId, {
        processoId: processo.id, clienteId, telefone, nomeAssistido: assistidoNome, advogado: advogado.nome, numero, responsavelId: advogado.id,
      });
    } else {
      await this.prisma.tarefa.create({
        data: {
          escritorioId, processoId: processo.id, responsavelId: advogado.id, prioridade: reuPreso ? 'URGENTE' : 'ALTA',
          titulo: reuPreso ? `Contatar o assistido preso — ${assistidoNome}` : `Fazer o primeiro contato com o assistido — ${assistidoNome}`,
          descricao: reuPreso
            ? 'Réu preso: agendar atendimento na unidade prisional ou por videochamada e registrar o contato.'
            : 'Não há telefone do assistido nos dados recebidos. Localizar o contato nos autos ou pelo cartório.',
          dataPrazo: new Date(`${somarDias(d.nomeadoEm, 3)}T18:00:00-03:00`),
        },
      });
    }

    const partesAviso = [
      `Processo ${numero}${comarca ? ` (${comarca})` : ''}: caso de dativa criado.`,
      reuPreso ? 'RÉU PRESO.' : null,
      ocorrencias.length ? `ATENÇÃO — possível conflito/impedimento: ${ocorrencias.map((o) => o.mensagem).join(' ')} Avalie recusar ou pedir substituição.` : 'Sem conflito encontrado.',
      `Aceite até ${diaLocal(prazoAceite.dataPrazo).split('-').reverse().join('/')} (conferir a regra do AJG).`,
      observacao,
    ].filter(Boolean).join(' ');
    await this.avisos.sino(escritorioId, advogado.id, ocorrencias.length ? 'DATIVA_CONFLITO' : 'DATIVA_NOMEACAO',
      ocorrencias.length ? 'Nomeação dativa com possível conflito' : 'Nova nomeação dativa', partesAviso, `/dativa/${caso.id}`, 'alta');

    return { processoId: processo.id, clienteId, caso: await this.prisma.casoDativa.findUnique({ where: { id: caso.id } }), duplicado: false };
  }

  // ═══════════════════════ E-MAIL DO AJG ══════════════════════════════════

  /** Gera (ou troca) o token do endereço que recebe os e-mails encaminhados do AJG */
  async gerarTokenEmail(user: any) {
    this.exigirAdmin(user);
    const token = randomBytes(24).toString('hex');
    await this.prisma.configuracao.upsert({
      where: { escritorioId_chave: { escritorioId: user.officeId, chave: CHAVE_TOKEN_AJG } },
      create: { escritorioId: user.officeId, chave: CHAVE_TOKEN_AJG, valor: { hash: hash(token), advogadoId: user.id }, tipo: 'integracao' },
      update: { valor: { hash: hash(token), advogadoId: user.id } },
    });
    return {
      token,
      instrucao: 'Configure o serviço de recebimento de e-mail para fazer POST em /api/dativa/email-ajg com o cabeçalho X-JurysOne-Token e o corpo { from, subject, text }. No Gmail, crie um filtro que encaminhe só os e-mails do AJG para esse endereço. O token aparece só agora.',
    };
  }

  private async escritorioPorToken(token: string): Promise<{ escritorioId: string; advogadoId: string } | null> {
    if (!token || token.length < 20) return null;
    const h = hash(token);
    const cfgs = await this.prisma.configuracao.findMany({ where: { chave: CHAVE_TOKEN_AJG } });
    for (const c of cfgs) {
      const v = c.valor as any;
      if (v?.hash && v.hash.length === h.length && timingSafeEqual(Buffer.from(v.hash), Buffer.from(h))) {
        return { escritorioId: c.escritorioId, advogadoId: v.advogadoId };
      }
    }
    return null;
  }

  /** Recebe um e-mail do AJG encaminhado automaticamente (só os do AJG, por filtro no Gmail) */
  async receberEmailAjg(token: string, corpo: any) {
    const alvo = await this.escritorioPorToken(token);
    if (!alvo) throw new ForbiddenException('Token inválido.');
    const assunto = String(corpo?.subject ?? '');
    const texto = textoPlano(String(corpo?.text ?? corpo?.html ?? ''));
    const tudo = `${assunto}\n${texto}`;
    const numero = tudo.match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/)?.[0];
    if (!numero || !numeroCnj(numero)) {
      await this.avisos.sino(alvo.escritorioId, alvo.advogadoId, 'AJG_EMAIL_SEM_PROCESSO', 'E-mail do AJG sem número de processo',
        `Assunto: "${assunto.slice(0, 150)}". Abra o e-mail e cadastre a nomeação manualmente, se for o caso.`, '/dativa', 'alta');
      return { criado: false, motivo: 'Número do processo não encontrado no e-mail.' };
    }
    if (!/nomea|nomead|designa|dativ|AJG|assist[eê]ncia\s+judici/i.test(tudo)) {
      return { criado: false, motivo: 'O e-mail não parece uma nomeação.' };
    }
    const nomeAssistido = tudo.match(/(?:assistid[oa]|benefici[aá]ri[oa]|r[eé]u|acusad[oa]|requerid[oa]|parte)\s*:\s*([^\n;,]{5,120})/i)?.[1]?.trim() ?? null;
    const comarca = tudo.match(/comarca\s*(?:de|:)\s*([A-Za-zÀ-ú' ]{3,60})/i)?.[1]?.trim() ?? null;
    const referencia = tudo.match(/(?:solicita[cç][aã]o|nomea[cç][aã]o|protocolo|n[º°o]\.?\s*AJG)\s*(?:n[º°o]\.?)?\s*:?\s*(\d{3,})/i)?.[1] ?? null;
    const r = await this.criarDaNomeacao({
      escritorioId: alvo.escritorioId, advogadoId: alvo.advogadoId, fonte: 'AJG_EMAIL', origemRef: referencia,
      numeroProcesso: numero, tribunal: tribunalDoNumero(numero), orgao: comarca ? `Comarca de ${comarca}` : null, classe: null,
      nomeadoEm: diaLocal(new Date()), texto: tudo, destinatarios: [], assistidoNome: nomeAssistido,
      telefone: extrairTelefone(texto.replace(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g, ' ')), comarca, referenciaAjg: referencia,
    });
    return { criado: !r.duplicado, duplicado: r.duplicado, casoId: r.caso?.id, processoId: r.processoId };
  }

  // ═══════════════════════ CONSULTA E AÇÕES ═══════════════════════════════

  private exigirAdmin(user: any) {
    if (!perfisDo(user).includes(PERFIS.ADMIN)) throw new ForbiddenException('Somente o titular.');
  }

  /** A dativa é do advogado nomeado; o titular vê todas */
  private async caso(user: any, id: string) {
    const caso = await this.prisma.casoDativa.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!caso) throw new NotFoundException('Caso de dativa não encontrado');
    if (caso.advogadoId !== user.id && !perfisDo(user).includes(PERFIS.ADMIN)) throw new ForbiddenException('Caso de dativa de outro advogado.');
    return caso;
  }

  async listar(user: any, q: any = {}) {
    const where: any = { escritorioId: user.officeId };
    if (!perfisDo(user).includes(PERFIS.ADMIN)) where.advogadoId = user.id;
    if (q.status) where.status = String(q.status).toUpperCase();
    if (q.reuPreso === 'true') where.reuPreso = true;
    const casos = await this.prisma.casoDativa.findMany({ where, orderBy: [{ reuPreso: 'desc' }, { nomeadoEm: 'desc' }] });
    const procs = await this.prisma.processo.findMany({
      where: { id: { in: casos.map((c) => c.processoId) } }, select: { id: true, numero: true, titulo: true, cliente: { select: { id: true, nome: true } } },
    });
    const porId = new Map(procs.map((p) => [p.id, p]));
    return casos.map((c) => ({ ...c, processo: porId.get(c.processoId) ?? null, destaque: c.reuPreso ? 'RÉU PRESO' : null }));
  }

  async obter(user: any, id: string) {
    const caso = await this.caso(user, id);
    const [processo, prazos, rascunhos] = await Promise.all([
      this.prisma.processo.findUnique({ where: { id: caso.processoId }, include: { cliente: { select: { id: true, nome: true, telefone: true, cadastroIncompleto: true } } } }),
      this.prisma.prazo.findMany({ where: { escritorioId: user.officeId, processoId: caso.processoId, deletedAt: null }, orderBy: { dataPrazo: 'asc' } }),
      this.prisma.rascunhoPeca.findMany({ where: { escritorioId: user.officeId, processoId: caso.processoId }, orderBy: { createdAt: 'desc' }, select: { id: true, tipoPeca: true, status: true, createdAt: true, geradoEm: true, erro: true } }),
    ]);
    return { ...caso, destaque: caso.reuPreso ? 'RÉU PRESO' : null, processo, prazos, rascunhos };
  }

  async aceitar(user: any, id: string) {
    const caso = await this.caso(user, id);
    const atualizado = await this.prisma.casoDativa.update({ where: { id }, data: { status: 'ACEITO', aceitoEm: new Date() } });
    await this.cumprirPrazosDeAceite(user, caso.processoId);
    return atualizado;
  }

  async recusar(user: any, id: string, dto: any) {
    const caso = await this.caso(user, id);
    if (!dto?.motivo) throw new BadRequestException('Informe o motivo da recusa (ex.: conflito de interesses).');
    const atualizado = await this.prisma.casoDativa.update({ where: { id }, data: { status: 'RECUSADO', recusadoEm: new Date(), motivoRecusa: String(dto.motivo).slice(0, 500) } });
    await this.cumprirPrazosDeAceite(user, caso.processoId);
    await this.prisma.processo.update({ where: { id: caso.processoId }, data: { status: 'ENCERRADO' } });
    return atualizado;
  }

  private async cumprirPrazosDeAceite(user: any, processoId: string) {
    const prazos = await this.prisma.prazo.findMany({ where: { escritorioId: user.officeId, processoId, origem: 'DATIVA_ACEITE', status: 'pendente' } });
    for (const p of prazos) await this.agenda.cumprir(user.officeId, p.id, user);
  }

  /** Réu preso e revisão da preventiva (alerta a cada 90 dias) */
  async atualizarPrisao(user: any, id: string, dto: any) {
    const caso = await this.caso(user, id);
    const data: any = {};
    if (dto?.reuPreso !== undefined) data.reuPreso = !!dto.reuPreso;
    const reuPreso = data.reuPreso ?? caso.reuPreso;
    if (dto?.presoDesde) data.presoDesde = new Date(`${dto.presoDesde}T12:00:00-03:00`);
    if (dto?.ultimaRevisaoPreventiva) data.ultimaRevisaoPreventiva = new Date(`${dto.ultimaRevisaoPreventiva}T12:00:00-03:00`);
    const base = data.ultimaRevisaoPreventiva ?? caso.ultimaRevisaoPreventiva ?? data.presoDesde ?? caso.presoDesde ?? caso.nomeadoEm;
    data.proximoAlertaPreventiva = reuPreso ? new Date(base.getTime() + 90 * 86400_000) : null;
    if (reuPreso && !caso.presoDesde && !data.presoDesde) data.presoDesde = caso.nomeadoEm;
    return this.prisma.casoDativa.update({ where: { id }, data });
  }

  @Cron('0 8 * * *', { timeZone: 'America/Sao_Paulo' })
  async alertarPreventivas(agora = new Date()) {
    const casos = await this.prisma.casoDativa.findMany({
      where: { reuPreso: true, status: { notIn: ['RECUSADO', 'ENCERRADO', 'PAGO'] }, proximoAlertaPreventiva: { lte: agora } },
    });
    for (const c of casos) {
      const proc = await this.prisma.processo.findUnique({ where: { id: c.processoId }, select: { numero: true } });
      await this.avisos.sino(c.escritorioId, c.advogadoId, 'DATIVA_REVISAO_PREVENTIVA', 'Réu preso: cobrar a revisão da preventiva',
        `Processo ${proc?.numero}: passaram 90 dias desde a última referência (CPP, art. 316, parágrafo único). Verifique se a prisão foi revista e, se não, peça a revisão/revogação.`, `/dativa/${c.id}`, 'alta');
      await this.prisma.tarefa.create({
        data: {
          escritorioId: c.escritorioId, processoId: c.processoId, responsavelId: c.advogadoId, prioridade: 'URGENTE',
          titulo: `Réu preso: cobrar revisão da preventiva — ${proc?.numero}`,
          dataPrazo: new Date(agora.getTime() + 2 * 86400_000),
        },
      });
      await this.prisma.casoDativa.update({ where: { id: c.id }, data: { proximoAlertaPreventiva: new Date(agora.getTime() + 90 * 86400_000) } });
    }
    // Acompanhamento do pagamento pelo Estado: lembrete a cada 30 dias depois do pedido
    const aguardando = await this.prisma.casoDativa.findMany({ where: { status: 'AGUARDANDO_PAGAMENTO', pedidoPagamentoEm: { not: null } } });
    for (const c of aguardando) {
      const dias = Math.floor((agora.getTime() - c.pedidoPagamentoEm!.getTime()) / 86400_000);
      if (dias > 0 && dias % 30 === 0) {
        await this.avisos.sino(c.escritorioId, c.advogadoId, 'DATIVA_PAGAMENTO_PENDENTE', 'Honorários da dativa ainda não pagos',
          `Pedido feito há ${dias} dias e o crédito não foi registrado. Confira no sistema do AJG.`, `/dativa/${c.id}`);
      }
    }
    return { preventivas: casos.length, pagamentos: aguardando.length };
  }

  // ═══════════════════════ FIM DA DATIVA E HONORÁRIOS ═════════════════════

  /** Chamado quando sai sentença/acórdão num caso de dativa */
  async registrarSentenca(escritorioId: string, casoId: string, dia: string, texto: string) {
    const caso = await this.prisma.casoDativa.findFirst({ where: { id: casoId, escritorioId } });
    if (!caso || caso.honorariosFixadosEm) return caso;
    const m = texto.match(/honor[aá]rios[^.]{0,200}?(?:dativ|nomead|defensor)[^.]{0,200}?R\$\s*([\d.]+,\d{2})/i)
      ?? texto.match(/(?:fixo|arbitro)[^.]{0,80}honor[aá]rios[^.]{0,200}?R\$\s*([\d.]+,\d{2})/i);
    const valor = m ? valorBr(m[1]) : null;
    if (valor) {
      await this.prisma.casoDativa.update({ where: { id: casoId }, data: { sentencaEm: new Date(`${dia}T12:00:00-03:00`) } });
      await this.registrarFixacao({ id: caso.advogadoId, officeId: escritorioId, roles: 'ADMIN' }, casoId, { valor, data: dia, automatico: true });
      await this.avisos.sino(escritorioId, caso.advogadoId, 'DATIVA_HONORARIOS_FIXADOS', 'Honorários da dativa fixados',
        `A decisão fixou R$ ${valor.toFixed(2).replace('.', ',')} (conferir). Próximos passos: certidão de atuação e pedido de pagamento ao Estado.`, `/dativa/${casoId}`, 'alta');
    } else {
      await this.prisma.casoDativa.update({ where: { id: casoId }, data: { sentencaEm: new Date(`${dia}T12:00:00-03:00`), status: 'AGUARDANDO_FIXACAO' } });
      await this.avisos.sino(escritorioId, caso.advogadoId, 'DATIVA_PEDIR_FIXACAO', 'Sentença na dativa: confira os honorários',
        'Não encontrei a fixação dos honorários do advogado dativo na decisão. Se faltou, peça a fixação (por exemplo, por embargos de declaração) — confira o prazo.', `/dativa/${casoId}`, 'alta');
    }
    return this.prisma.casoDativa.findUnique({ where: { id: casoId } });
  }

  async registrarFixacao(user: any, id: string, dto: any) {
    const caso = await this.caso(user, id);
    const valor = Number(dto?.valor);
    if (!Number.isFinite(valor) || valor <= 0) throw new BadRequestException('Informe o valor fixado.');
    const quando = dto?.data ? new Date(`${dto.data}T12:00:00-03:00`) : new Date();
    let lancamentoId = caso.lancamentoId;
    // 106: lançamento DATIVA / origem ESTADO — fica fora do caixa do escritório e da cota-parte
    if (lancamentoId) {
      await this.prisma.lancamentoFinanceiro.update({ where: { id: lancamentoId }, data: { valor } });
    } else {
      const l = await this.prisma.lancamentoFinanceiro.create({
        data: {
          escritorioId: user.officeId, processoId: caso.processoId, descricao: 'Honorários de advocacia dativa (Estado)',
          valor, tipo: 'receita', status: 'pendente', tipoHonorario: 'DATIVA', origemRecebimento: 'ESTADO', data: quando,
        },
      });
      lancamentoId = l.id;
    }
    return this.prisma.casoDativa.update({
      where: { id }, data: { valorFixado: valor, honorariosFixadosEm: quando, lancamentoId, status: 'FIXADO' },
    });
  }

  async registrarCertidao(user: any, id: string, dto: any = {}) {
    await this.caso(user, id);
    return this.prisma.casoDativa.update({ where: { id }, data: { certidaoEm: dto?.data ? new Date(`${dto.data}T12:00:00-03:00`) : new Date() } });
  }

  async registrarPedidoPagamento(user: any, id: string, dto: any = {}) {
    const caso = await this.caso(user, id);
    if (!caso.valorFixado) throw new BadRequestException('Registre antes o valor fixado pelo juiz.');
    if (!caso.certidaoEm) throw new BadRequestException('Registre antes a certidão de atuação.');
    return this.prisma.casoDativa.update({
      where: { id }, data: { pedidoPagamentoEm: dto?.data ? new Date(`${dto.data}T12:00:00-03:00`) : new Date(), status: 'AGUARDANDO_PAGAMENTO' },
    });
  }

  async registrarPagamento(user: any, id: string, dto: any) {
    const caso = await this.caso(user, id);
    const valor = Number(dto?.valor ?? caso.valorFixado);
    if (!Number.isFinite(valor) || valor <= 0) throw new BadRequestException('Informe o valor recebido.');
    const quando = dto?.data ? new Date(`${dto.data}T12:00:00-03:00`) : new Date();
    if (caso.lancamentoId) {
      await this.prisma.lancamentoFinanceiro.update({ where: { id: caso.lancamentoId }, data: { valor, status: 'pago', paidAt: quando } });
    }
    await this.prisma.processo.update({ where: { id: caso.processoId }, data: { status: 'ENCERRADO' } });
    return this.prisma.casoDativa.update({ where: { id }, data: { valorPago: valor, pagoEm: quando, status: 'PAGO' } });
  }

  /** Resumo financeiro da dativa: só do próprio advogado (fora do caixa do escritório) */
  async financeiro(user: any) {
    const casos = await this.prisma.casoDativa.findMany({ where: { escritorioId: user.officeId, advogadoId: user.id } });
    const soma = (f: (c: any) => any) => casos.reduce((t, c) => t + Number(f(c) ?? 0), 0);
    return {
      casos: casos.length,
      aguardandoFixacao: casos.filter((c) => c.status === 'AGUARDANDO_FIXACAO').length,
      fixadoNaoPago: soma((c) => (c.status !== 'PAGO' ? c.valorFixado : 0)),
      recebido: soma((c) => c.valorPago),
      itens: casos.map((c) => ({ id: c.id, processoId: c.processoId, status: c.status, valorFixado: c.valorFixado, valorPago: c.valorPago, pagoEm: c.pagoEm })),
    };
  }

  // ═══════════════════════ AUTOS → VARREDURA → RASCUNHO (123/124) ═════════

  async enviarAutos(user: any, id: string, arquivo: any, dto: any = {}) {
    const caso = await this.caso(user, id);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o PDF dos autos no campo "arquivo".');
    const ehPdf = arquivo.mimetype === 'application/pdf' || String(arquivo.originalname ?? '').toLowerCase().endsWith('.pdf');
    if (!ehPdf) throw new BadRequestException('Envie a cópia dos autos em PDF.');
    if (arquivo.buffer.length > 32 * 1024 * 1024) throw new BadRequestException('PDF acima de 32 MB: divida a cópia dos autos em partes.');
    const doc = await this.arquivos.salvarNoProcesso(user.officeId, caso.processoId, {
      nome: arquivo.originalname || 'autos.pdf', mimeType: 'application/pdf', conteudo: arquivo.buffer,
      categoria: 'DECISOES', origem: 'UPLOAD', enviadoPorId: user.id, tipo: 'autos',
    });
    const v = await varrerDocumento(arquivo.buffer, arquivo.originalname || 'autos.pdf', 'application/pdf');
    const varredura = await this.prisma.varreduraDocumento.create({
      data: {
        escritorioId: user.officeId, documentoId: doc.id, processoId: caso.processoId, nomeArquivo: doc.nome,
        hashSha256: doc.hashSha256 ?? createHash('sha256').update(arquivo.buffer).digest('hex'),
        resultado: v.resultado, achados: v.achados as any, resumo: v.observacoes.join(' ') || null,
        decisao: v.resultado === 'ACHADOS' ? 'PENDENTE' : null,
      },
    });
    const prazo = await this.prisma.prazo.findFirst({
      where: { escritorioId: user.officeId, processoId: caso.processoId, status: 'pendente', deletedAt: null, NOT: { origem: 'DATIVA_ACEITE' } },
      orderBy: { dataPrazo: 'asc' },
    });
    const tipoPeca = dto?.tipoPeca ? String(dto.tipoPeca).slice(0, 120)
      : caso.materia === 'CRIMINAL' ? 'Resposta à acusação (CPP, arts. 396 e 396-A)' : 'Contestação';
    const rascunho = await this.prisma.rascunhoPeca.create({
      data: {
        escritorioId: user.officeId, processoId: caso.processoId, documentoId: doc.id, varreduraId: varredura.id, tipoPeca,
        status: v.resultado === 'ACHADOS' ? 'AGUARDANDO_LIBERACAO' : 'GERANDO', prazoId: prazo?.id ?? null, criadoPorId: user.id,
      },
    });
    if (v.resultado === 'ACHADOS') {
      const a = v.achados[0];
      await this.avisos.sino(user.officeId, caso.advogadoId, 'VARREDURA_ACHADOS', 'Autos com possível instrução escondida para IA',
        `A leitura pela IA foi suspensa. ${v.achados.length} achado(s); o primeiro: ${a.camada}, ${a.local} — ${a.descricao}. Trecho: "${a.trecho.slice(0, 300)}". Decida se libera ou descarta.`, `/dativa/${caso.id}`, 'alta');
    } else {
      this.gerarEmSegundoPlano(rascunho.id);
    }
    return { documentoId: doc.id, varredura: { id: varredura.id, resultado: v.resultado, achados: v.achados, observacoes: v.observacoes }, rascunho: { id: rascunho.id, status: rascunho.status } };
  }

  /** 124: o advogado decide se a IA pode ler o arquivo com achados */
  async decidirVarredura(user: any, varreduraId: string, dto: any) {
    const v = await this.prisma.varreduraDocumento.findFirst({ where: { id: varreduraId, escritorioId: user.officeId } });
    if (!v) throw new NotFoundException('Varredura não encontrada');
    if (v.decisao !== 'PENDENTE') throw new BadRequestException('Esta varredura já foi decidida.');
    const caso = v.processoId ? await this.prisma.casoDativa.findUnique({ where: { processoId: v.processoId } }) : null;
    if (caso) await this.caso(user, caso.id);
    else if (!perfisDo(user).some((p) => [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO].includes(p as any))) throw new ForbiddenException('Sem permissão.');
    const decisao = String(dto?.decisao ?? '').toUpperCase();
    if (!['LIBERADO', 'DESCARTADO'].includes(decisao)) throw new BadRequestException('decisao: LIBERADO ou DESCARTADO');
    await this.prisma.varreduraDocumento.update({ where: { id: v.id }, data: { decisao, decididoPorId: user.id, decididoEm: new Date() } });
    const rascunhos = await this.prisma.rascunhoPeca.findMany({ where: { escritorioId: user.officeId, varreduraId: v.id, status: 'AGUARDANDO_LIBERACAO' } });
    for (const r of rascunhos) {
      if (decisao === 'LIBERADO') {
        await this.prisma.rascunhoPeca.update({ where: { id: r.id }, data: { status: 'GERANDO' } });
        this.gerarEmSegundoPlano(r.id);
      } else {
        await this.prisma.rascunhoPeca.update({ where: { id: r.id }, data: { status: 'DESCARTADO' } });
      }
    }
    return { decisao, rascunhos: rascunhos.length };
  }

  async obterRascunho(user: any, rascunhoId: string) {
    const r = await this.prisma.rascunhoPeca.findFirst({ where: { id: rascunhoId, escritorioId: user.officeId } });
    if (!r) throw new NotFoundException('Rascunho não encontrado');
    const caso = await this.prisma.casoDativa.findUnique({ where: { processoId: r.processoId } });
    if (caso) await this.caso(user, caso.id);
    return r;
  }

  private gerarEmSegundoPlano(rascunhoId: string) {
    setImmediate(() => this.gerar(rascunhoId).catch((e) => this.logger.error(`Rascunho ${rascunhoId}: ${e?.message ?? e}`)));
  }

  async gerar(rascunhoId: string) {
    const r = await this.prisma.rascunhoPeca.findUnique({ where: { id: rascunhoId } });
    if (!r || r.status !== 'GERANDO') return;
    const caso = await this.prisma.casoDativa.findUnique({ where: { processoId: r.processoId } });
    const processo = await this.prisma.processo.findUnique({ where: { id: r.processoId }, include: { cliente: { select: { nome: true } } } });
    const prazo = r.prazoId ? await this.prisma.prazo.findUnique({ where: { id: r.prazoId } }) : null;
    try {
      const pdf = await this.arquivos.conteudoInterno(r.escritorioId, r.documentoId);
      const chave = await this.chaves.getChave(r.escritorioId, 'anthropic');
      const { texto, modelo } = await rascunhoDePeca(chave, {
        pdf, tipoPeca: r.tipoPeca, materia: caso?.materia ?? 'CIVEL',
        numeroProcesso: processo?.numero ?? '', assistido: processo?.cliente?.nome ?? '', reuPreso: !!caso?.reuPreso,
        prazo: prazo ? diaLocal(prazo.dataPrazo).split('-').reverse().join('/') : null, comarca: caso?.comarca ?? null,
      });
      await this.prisma.rascunhoPeca.update({ where: { id: r.id }, data: { status: 'PRONTO', texto, modelo, geradoEm: new Date(), erro: null } });
      if (caso) {
        await this.avisos.sino(r.escritorioId, caso.advogadoId, 'RASCUNHO_PRONTO', 'Rascunho da peça pronto',
          `${r.tipoPeca} — processo ${processo?.numero}. Revise os pontos marcados [CONFERIR] antes de protocolar.`, `/dativa/${caso.id}`, 'alta');
      }
    } catch (e: any) {
      const semIa = e instanceof IaIndisponivel;
      await this.prisma.rascunhoPeca.update({ where: { id: r.id }, data: { status: semIa ? 'SEM_IA' : 'ERRO', erro: String(e?.message ?? e).slice(0, 500) } });
      if (caso) {
        await this.avisos.sino(r.escritorioId, caso.advogadoId, 'RASCUNHO_FALHOU', 'Rascunho da peça não foi gerado',
          semIa ? 'A chave da Anthropic não está configurada. Configure-a para gerar rascunhos.' : `Erro: ${String(e?.message ?? e).slice(0, 300)}`, `/dativa/${caso.id}`);
      }
    }
  }
}
