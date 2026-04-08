/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — AutomacoesService
 * Motor de Automação Inteligente (Workflow Engine)
 *
 * Como funciona:
 *   1. Um evento é disparado em qualquer parte do sistema
 *      ex: dispararEvento('esign.assinado', { envelopeId, clienteNome })
 *
 *   2. O motor busca todas as automações ativas com esse gatilho
 *      e avalia as condições de cada uma
 *
 *   3. Para cada automação elegível, executa as ações em sequência:
 *      criar_tarefa → whatsapp.enviar_mensagem → notificacao.push → …
 *
 *   4. Registra o log de execução (sucesso/erro/parcial) com
 *      input, output e duração
 *
 * Gatilhos disponíveis (TipoGatilho):
 *   esign.assinado | esign.expirado | esign.rejeitado
 *   financeiro.pagamento_recebido | financeiro.vencimento_proximo
 *   processo.criado | processo.andamento_novo | processo.encerrado
 *   prazo.D-7 | prazo.D-1 | prazo.hoje
 *   tarefa.criada | tarefa.concluida | tarefa.atrasada
 *   cliente.criado
 *   datajud.nova_movimentacao
 *
 * Ações disponíveis (TipoAcao):
 *   tarefa.criar | notificacao.push | whatsapp.enviar_mensagem
 *   email.enviar | agenda.criar_evento | documento.gerar
 *   financeiro.criar_cobranca | webhook.disparar | esperar
 * ═══════════════════════════════════════════════════════════════
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { TipoGatilho, TipoAcao } from './automacoes.controller';

// ─── Interfaces internas ──────────────────────────────────────────────────────

interface DispararEventoOptions {
  escritorioId: string;
  gatilho: TipoGatilho;
  dados: Record<string, any>;
  dryRun?: boolean;
}

interface ResultadoAcao {
  tipo: TipoAcao;
  sucesso: boolean;
  output?: any;
  erro?: string;
}

// ─── Templates de automações prontas ─────────────────────────────────────────

const TEMPLATES_PRONTOS = [
  {
    id: 'tpl_notificar_movimentacao',
    nome: 'Notificar cliente de nova movimentação',
    descricao: 'Envia WhatsApp ao cliente quando houver novo andamento no processo',
    icone: '📱',
    categoria: 'Comunicação',
    gatilho: {
      tipo: 'datajud.nova_movimentacao',
      condicoes: [],
    },
    acoes: [
      {
        tipo: 'whatsapp.enviar_mensagem',
        ordem: 1,
        config: {
          template: 'Olá {{cliente_nome}}, há uma nova movimentação no seu processo {{numero_processo}}. Acesse o portal para detalhes.',
        },
      },
      {
        tipo: 'notificacao.push',
        ordem: 2,
        config: {
          titulo: 'Nova movimentação',
          mensagem: '{{cliente_nome}} — {{numero_processo}}',
          prioridade: 'normal',
        },
      },
    ],
  },
  {
    id: 'tpl_prazo_urgente',
    nome: 'Alerta de prazo a 7 dias',
    descricao: 'Cria uma tarefa e notifica o advogado responsável 7 dias antes do prazo',
    icone: '⏰',
    categoria: 'Prazos',
    gatilho: {
      tipo: 'prazo.D-7',
      condicoes: [],
    },
    acoes: [
      {
        tipo: 'tarefa.criar',
        ordem: 1,
        config: {
          titulo: 'PRAZO em 7 dias: {{titulo_evento}}',
          descricao: 'Prazo vence em {{data_prazo}}. Processo: {{numero_processo}}',
          prioridade: 'HIGH',
          responsavel: '{{responsavel_id}}',
        },
      },
      {
        tipo: 'notificacao.push',
        ordem: 2,
        config: {
          titulo: '⏰ Prazo a 7 dias',
          mensagem: '{{titulo_evento}} — {{numero_processo}}',
          prioridade: 'alta',
        },
      },
    ],
  },
  {
    id: 'tpl_contrato_assinado',
    nome: 'Boas-vindas após assinatura do contrato',
    descricao: 'Envia mensagem de boas-vindas e cria tarefa de onboarding quando o cliente assina',
    icone: '✅',
    categoria: 'Atendimento',
    gatilho: {
      tipo: 'esign.assinado',
      condicoes: [],
    },
    acoes: [
      {
        tipo: 'whatsapp.enviar_mensagem',
        ordem: 1,
        config: {
          template: 'Olá {{cliente_nome}}! Seu contrato foi assinado com sucesso. Bem-vindo(a) ao nosso escritório! Em breve entraremos em contato para darmos início ao seu atendimento.',
        },
      },
      {
        tipo: 'tarefa.criar',
        ordem: 2,
        config: {
          titulo: 'Onboarding — {{cliente_nome}}',
          descricao: 'Iniciar atendimento jurídico. Contrato assinado em {{data_assinatura}}.',
          prioridade: 'MEDIUM',
          prazo_dias: 3,
        },
      },
    ],
  },
  {
    id: 'tpl_pagamento_confirmado',
    nome: 'Confirmação de pagamento recebido',
    descricao: 'Notifica a equipe e atualiza o processo quando um pagamento é confirmado',
    icone: '💰',
    categoria: 'Financeiro',
    gatilho: {
      tipo: 'financeiro.pagamento_recebido',
      condicoes: [],
    },
    acoes: [
      {
        tipo: 'notificacao.push',
        ordem: 1,
        config: {
          titulo: '💰 Pagamento confirmado',
          mensagem: '{{valor_formatado}} de {{cliente_nome}} confirmado',
          prioridade: 'normal',
        },
      },
      {
        tipo: 'whatsapp.enviar_mensagem',
        ordem: 2,
        config: {
          template: 'Olá {{cliente_nome}}, confirmamos o recebimento do seu pagamento de {{valor_formatado}}. Obrigado!',
        },
      },
    ],
  },
  {
    id: 'tpl_relatorio_semanal',
    nome: 'Relatório semanal automático',
    descricao: 'Envia um resumo semanal dos processos por e-mail toda segunda-feira',
    icone: '📊',
    categoria: 'Relatórios',
    gatilho: {
      tipo: 'agendamento.semanal',
      condicoes: [],
    },
    acoes: [
      {
        tipo: 'relatorio.gerar',
        ordem: 1,
        config: {
          tipo: 'semanal',
          formato: 'pdf',
          enviar_email: true,
        },
      },
    ],
  },
  {
    id: 'tpl_audiencia_lembrete',
    nome: 'Lembrete de audiência 1 dia antes',
    descricao: 'Envia WhatsApp ao cliente lembrando da audiência no dia anterior',
    icone: '⚖️',
    categoria: 'Comunicação',
    gatilho: {
      tipo: 'prazo.D-1',
      condicoes: [
        { campo: 'tipo_evento', operador: 'igual', valor: 'AUDIENCIA' },
      ],
    },
    acoes: [
      {
        tipo: 'whatsapp.enviar_mensagem',
        ordem: 1,
        config: {
          template: 'Lembrete: você tem audiência amanhã, {{data_audiencia}}, às {{hora_audiencia}}, em {{local_audiencia}}. Qualquer dúvida, entre em contato.',
        },
      },
    ],
  },
];

// ─── Metadados de gatilhos ────────────────────────────────────────────────────

const GATILHOS_META = [
  { tipo: 'esign.assinado',               label: 'Contrato assinado',           categoria: 'E-Sign',     campos: ['envelope_id','cliente_nome','processo_id'] },
  { tipo: 'esign.expirado',               label: 'Envelope expirado',           categoria: 'E-Sign',     campos: ['envelope_id','cliente_nome'] },
  { tipo: 'esign.rejeitado',              label: 'Assinatura recusada',         categoria: 'E-Sign',     campos: ['envelope_id','cliente_nome','motivo'] },
  { tipo: 'financeiro.pagamento_recebido',label: 'Pagamento recebido',          categoria: 'Financeiro', campos: ['lancamento_id','cliente_nome','valor','valor_formatado'] },
  { tipo: 'financeiro.vencimento_proximo',label: 'Vencimento próximo',          categoria: 'Financeiro', campos: ['lancamento_id','cliente_nome','valor','data_vencimento','dias_restantes'] },
  { tipo: 'processo.criado',              label: 'Novo processo criado',        categoria: 'Processos',  campos: ['processo_id','numero_processo','area','cliente_nome'] },
  { tipo: 'processo.andamento_novo',      label: 'Novo andamento',              categoria: 'Processos',  campos: ['processo_id','numero_processo','descricao_andamento'] },
  { tipo: 'processo.encerrado',           label: 'Processo encerrado',          categoria: 'Processos',  campos: ['processo_id','numero_processo','motivo'] },
  { tipo: 'prazo.D-30',                   label: 'Prazo a 30 dias',             categoria: 'Prazos',     campos: ['evento_id','titulo_evento','data_prazo','numero_processo'] },
  { tipo: 'prazo.D-15',                   label: 'Prazo a 15 dias',             categoria: 'Prazos',     campos: ['evento_id','titulo_evento','data_prazo','numero_processo'] },
  { tipo: 'prazo.D-7',                    label: 'Prazo a 7 dias',              categoria: 'Prazos',     campos: ['evento_id','titulo_evento','data_prazo','numero_processo'] },
  { tipo: 'prazo.D-3',                    label: 'Prazo a 3 dias',              categoria: 'Prazos',     campos: ['evento_id','titulo_evento','data_prazo','numero_processo'] },
  { tipo: 'prazo.D-1',                    label: 'Prazo amanhã',                categoria: 'Prazos',     campos: ['evento_id','titulo_evento','tipo_evento','data_prazo'] },
  { tipo: 'prazo.hoje',                   label: 'Prazo hoje',                  categoria: 'Prazos',     campos: ['evento_id','titulo_evento','tipo_evento'] },
  { tipo: 'tarefa.criada',                label: 'Tarefa criada',               categoria: 'Tarefas',    campos: ['tarefa_id','titulo','responsavel_id'] },
  { tipo: 'tarefa.concluida',             label: 'Tarefa concluída',            categoria: 'Tarefas',    campos: ['tarefa_id','titulo','responsavel_id'] },
  { tipo: 'tarefa.atrasada',              label: 'Tarefa atrasada',             categoria: 'Tarefas',    campos: ['tarefa_id','titulo','dias_atraso'] },
  { tipo: 'cliente.criado',               label: 'Novo cliente cadastrado',     categoria: 'Clientes',   campos: ['cliente_id','cliente_nome','email'] },
  { tipo: 'datajud.nova_movimentacao',    label: 'Nova movimentação DataJud',   categoria: 'DataJud',    campos: ['processo_id','numero_processo','descricao','cliente_nome'] },
  { tipo: 'agendamento.diario',           label: 'Todo dia (recorrente)',       categoria: 'Agendamentos', campos: ['data'] },
  { tipo: 'agendamento.semanal',          label: 'Toda semana (recorrente)',    categoria: 'Agendamentos', campos: ['data','dia_semana'] },
  { tipo: 'agendamento.mensal',           label: 'Todo mês (recorrente)',       categoria: 'Agendamentos', campos: ['data','dia_mes'] },
];

// ─── Metadados de ações ───────────────────────────────────────────────────────

const ACOES_META = [
  {
    tipo: 'tarefa.criar',
    label: 'Criar tarefa',
    categoria: 'Tarefas',
    campos: [
      { nome: 'titulo',       tipo: 'text',   obrigatorio: true,  descricao: 'Título da tarefa (suporta {{variáveis}})' },
      { nome: 'descricao',    tipo: 'text',   obrigatorio: false, descricao: 'Descrição (suporta {{variáveis}})' },
      { nome: 'prioridade',   tipo: 'select', obrigatorio: false, opcoes: ['LOW','MEDIUM','HIGH','URGENT'] },
      { nome: 'prazo_dias',   tipo: 'number', obrigatorio: false, descricao: 'Dias a partir de hoje para o prazo' },
    ],
  },
  {
    tipo: 'notificacao.push',
    label: 'Enviar notificação',
    categoria: 'Notificações',
    campos: [
      { nome: 'titulo',    tipo: 'text',   obrigatorio: true },
      { nome: 'mensagem',  tipo: 'text',   obrigatorio: true },
      { nome: 'prioridade', tipo: 'select', obrigatorio: false, opcoes: ['baixa','normal','alta','urgente'] },
      { nome: 'link',      tipo: 'text',   obrigatorio: false },
    ],
  },
  {
    tipo: 'whatsapp.enviar_mensagem',
    label: 'Enviar WhatsApp',
    categoria: 'Comunicação',
    campos: [
      { nome: 'template', tipo: 'textarea', obrigatorio: true, descricao: 'Mensagem (suporta {{variáveis}})' },
      { nome: 'telefone', tipo: 'text',     obrigatorio: false, descricao: 'Deixe vazio para usar o telefone do cliente' },
    ],
  },
  {
    tipo: 'email.enviar',
    label: 'Enviar e-mail',
    categoria: 'Comunicação',
    campos: [
      { nome: 'assunto', tipo: 'text',     obrigatorio: true },
      { nome: 'corpo',   tipo: 'textarea', obrigatorio: true },
      { nome: 'para',    tipo: 'text',     obrigatorio: false, descricao: 'Deixe vazio para usar o e-mail do cliente' },
    ],
  },
  {
    tipo: 'agenda.criar_evento',
    label: 'Criar evento na agenda',
    categoria: 'Agenda',
    campos: [
      { nome: 'titulo',       tipo: 'text',   obrigatorio: true },
      { nome: 'tipo',         tipo: 'select', obrigatorio: true, opcoes: ['PRAZO','AUDIENCIA','REUNIAO','TAREFA','OUTRO'] },
      { nome: 'dias_a_partir', tipo: 'number', obrigatorio: true, descricao: 'Dias a partir do evento disparador' },
      { nome: 'duracao_min',  tipo: 'number', obrigatorio: false },
    ],
  },
  {
    tipo: 'documento.gerar',
    label: 'Gerar documento',
    categoria: 'Documentos',
    campos: [
      { nome: 'tipo_doc', tipo: 'select', obrigatorio: true, opcoes: ['contrato','procuracao','peticao','notificacao'] },
      { nome: 'template', tipo: 'text',   obrigatorio: false },
    ],
  },
  {
    tipo: 'financeiro.criar_cobranca',
    label: 'Criar cobrança',
    categoria: 'Financeiro',
    campos: [
      { nome: 'descricao',    tipo: 'text',   obrigatorio: true },
      { nome: 'valor',        tipo: 'number', obrigatorio: true },
      { nome: 'vencimento_dias', tipo: 'number', obrigatorio: true },
      { nome: 'forma_pagamento', tipo: 'select', obrigatorio: false, opcoes: ['BOLETO','PIX','CREDIT_CARD'] },
    ],
  },
  {
    tipo: 'webhook.disparar',
    label: 'Disparar webhook externo',
    categoria: 'Integrações',
    campos: [
      { nome: 'url',    tipo: 'text',   obrigatorio: true },
      { nome: 'method', tipo: 'select', obrigatorio: false, opcoes: ['POST','PUT','PATCH'] },
      { nome: 'headers', tipo: 'json', obrigatorio: false },
    ],
  },
  {
    tipo: 'relatorio.gerar',
    label: 'Gerar relatório',
    categoria: 'Relatórios',
    campos: [
      { nome: 'tipo',          tipo: 'select', obrigatorio: true, opcoes: ['semanal','mensal','cliente','processo'] },
      { nome: 'formato',       tipo: 'select', obrigatorio: false, opcoes: ['pdf','xlsx'] },
      { nome: 'enviar_email',  tipo: 'boolean', obrigatorio: false },
    ],
  },
  {
    tipo: 'esperar',
    label: 'Aguardar (delay)',
    categoria: 'Controle',
    campos: [
      { nome: 'minutos', tipo: 'number', obrigatorio: true, descricao: 'Minutos para aguardar antes da próxima ação' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AutomacoesService {
  private readonly logger = new Logger(AutomacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsGateway,
  ) {}

  // ════════════════════════════════════════════════════════════
  // CRUD
  // ════════════════════════════════════════════════════════════

  async list(
    escritorioId: string,
    query: { ativa?: string; gatilho?: string; page?: string },
  ) {
    const page = parseInt(query.page || '1', 10);
    const limit = 20;

    const where: any = { escritorioId };
    if (query.ativa !== undefined) where.ativa = query.ativa === 'true';
    if (query.gatilho)             where.evento = query.gatilho;

    const [total, items] = await Promise.all([
      this.prisma.automacao.count({ where }),
      this.prisma.automacao.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { logs: true } },
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  async create(
    escritorioId: string,
    criadoPorId: string,
    dto: {
      nome: string;
      descricao?: string;
      ativa: boolean;
      gatilho: { tipo: TipoGatilho; condicoes?: any[] };
      acoes: Array<{ tipo: TipoAcao; ordem: number; config: any; continuar_se_erro?: boolean }>;
    },
  ) {
    return this.prisma.automacao.create({
      data: {
        escritorioId,
        criadoPorId,
        nome: dto.nome,
        descricao: dto.descricao,
        ativa: dto.ativa,
        gatilho: { tipo: dto.gatilho.tipo, condicoes: dto.gatilho.condicoes || [] } as any,
        condicoes: dto.gatilho.condicoes || [],
        acoes: dto.acoes,
      },
    });
  }

  async get(escritorioId: string, id: string) {
    const automacao = await this.prisma.automacao.findFirst({
      where: { id, escritorioId },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!automacao) throw new NotFoundException('Automação não encontrada');
    return automacao;
  }

  async update(escritorioId: string, id: string, dto: any) {
    await this.get(escritorioId, id); // checks ownership

    const data: any = {};
    if (dto.nome)        data.nome        = dto.nome;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.ativa !== undefined)     data.ativa     = dto.ativa;
    if (dto.gatilho) {
      data.gatilho   = { tipo: dto.gatilho.tipo, condicoes: dto.gatilho.condicoes || [] };
      data.condicoes = dto.gatilho.condicoes || [];
    }
    if (dto.acoes) data.acoes = dto.acoes;

    return this.prisma.automacao.update({ where: { id }, data });
  }

  async toggle(escritorioId: string, id: string) {
    const automacao = await this.get(escritorioId, id);
    return this.prisma.automacao.update({
      where: { id },
      data: { ativa: !automacao.ativa },
    });
  }

  async remove(escritorioId: string, id: string) {
    await this.get(escritorioId, id);
    return this.prisma.automacao.delete({ where: { id } });
  }

  // ════════════════════════════════════════════════════════════
  // EXECUÇÕES
  // ════════════════════════════════════════════════════════════

  async getExecucoes(
    escritorioId: string,
    id: string,
    query: { status?: string; page?: string },
  ) {
    await this.get(escritorioId, id);

    const page  = parseInt(query.page || '1', 10);
    const limit = 20;
    const where: any = { automacaoId: id };
    if (query.status) where.status = query.status;

    const [total, items] = await Promise.all([
      this.prisma.automacaoLog.count({ where }),
      this.prisma.automacaoLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { total, page, limit, items };
  }

  async getExecouesRecentes(escritorioId: string) {
    const automacoes = await this.prisma.automacao.findMany({
      where: { escritorioId },
      select: { id: true },
    });

    const ids = automacoes.map((a) => a.id);

    return this.prisma.automacaoLog.findMany({
      where: { automacaoId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { automacao: { select: { nome: true } } },
    });
  }

  // ════════════════════════════════════════════════════════════
  // MOTOR DE EXECUÇÃO — coração do sistema
  // ════════════════════════════════════════════════════════════

  /**
   * dispararEvento()
   * Chamado por qualquer módulo que gera um evento:
   *   - StatusFlowService: esign.assinado, financeiro.pagamento_recebido
   *   - DatajudService: datajud.nova_movimentacao
   *   - PrazosService: prazo.D-7, prazo.hoje
   *   - TarefasService: tarefa.criada, tarefa.concluida
   *   - etc.
   */
  async dispararEvento(opts: DispararEventoOptions) {
    const { escritorioId, gatilho, dados, dryRun = false } = opts;

    this.logger.log(`[Motor] Disparando evento: ${gatilho} | escritorio: ${escritorioId} | dryRun: ${dryRun}`);

    // 1. Buscar automações ativas com esse gatilho
    const automacoes = await this.prisma.automacao.findMany({
      where: { escritorioId, ativa: true } as any,
    });

    if (automacoes.length === 0) {
      this.logger.debug(`[Motor] Nenhuma automação para ${gatilho}`);
      return { disparadas: 0 };
    }

    this.logger.log(`[Motor] ${automacoes.length} automação(ões) encontrada(s) para ${gatilho}`);

    let disparadas = 0;

    for (const automacao of automacoes) {
      // 2. Avaliar condições
      const condicoes: any[] = (automacao.condicoes as any[]) || [];
      if (!this.avaliarCondicoes(condicoes, dados)) {
        this.logger.debug(`[Motor] Automação ${automacao.id} ignorada — condições não atendidas`);
        continue;
      }

      // 3. Executar ações
      await this.executarAutomacao(automacao, dados, dryRun);
      disparadas++;
    }

    return { disparadas, totalEncontradas: automacoes.length };
  }

  /**
   * testar()
   * Dry-run de uma automação específica com dados de exemplo
   */
  async testar(escritorioId: string, id: string, dadosExemplo: Record<string, any>) {
    const automacao = await this.get(escritorioId, id);

    this.logger.log(`[Motor] Dry-run da automação: ${automacao.nome}`);

    const resultado = await this.executarAcoes(
      automacao.acoes as any[],
      dadosExemplo,
      escritorioId,
      true, // dryRun
    );

    return {
      automacao: { id: automacao.id, nome: automacao.nome },
      dryRun: true,
      acoes: resultado,
    };
  }

  // ════════════════════════════════════════════════════════════
  // INTERNOS — execução
  // ════════════════════════════════════════════════════════════

  private async executarAutomacao(automacao: any, dados: any, dryRun: boolean) {
    const inicio = Date.now();
    const acoes: any[] = (automacao.acoes as any[]) || [];

    let resultados: ResultadoAcao[] = [];
    let statusFinal: 'sucesso' | 'erro' | 'parcial' = 'sucesso';

    try {
      resultados = await this.executarAcoes(acoes, dados, automacao.escritorioId, dryRun);

      const temErro = resultados.some((r) => !r.sucesso);
      const temSucesso = resultados.some((r) => r.sucesso);

      if (temErro && temSucesso) statusFinal = 'parcial';
      else if (temErro)          statusFinal = 'erro';

    } catch (err) {
      statusFinal = 'erro';
      this.logger.error(`[Motor] Erro na automação ${automacao.id}: ${err.message}`);
    }

    const duracao = Date.now() - inicio;

    // Registrar log
    if (!dryRun) {
      await this.prisma.automacaoLog.create({
        data: {
          automacaoId: automacao.id,
          status:      statusFinal,
          input:       dados,
          output:      resultados as any,
          duracaoMs:   duracao,
          erroMsg:     statusFinal === 'erro' ? resultados.find((r) => r.erro)?.erro : null,
        },
      });

      // Incrementar contador e registrar última execução
      await this.prisma.automacao.update({
        where: { id: automacao.id },
        data: {
          execucoes:  { increment: 1 },
          erros:      statusFinal !== 'sucesso' ? { increment: 1 } : undefined,
          ultimaExec: new Date(),
        },
      });
    }

    this.logger.log(
      `[Motor] Automação "${automacao.nome}" finalizada em ${duracao}ms — ${statusFinal}`,
    );

    return { automacaoId: automacao.id, status: statusFinal, acoes: resultados, duracao };
  }

  private async executarAcoes(
    acoes: Array<{ tipo: TipoAcao; ordem: number; config: any; continuar_se_erro?: boolean }>,
    dados: any,
    escritorioId: string,
    dryRun: boolean,
  ): Promise<ResultadoAcao[]> {
    const ordenadas = [...acoes].sort((a, b) => a.ordem - b.ordem);
    const resultados: ResultadoAcao[] = [];

    for (const acao of ordenadas) {
      try {
        const output = await this.executarAcao(acao.tipo, acao.config, dados, escritorioId, dryRun);
        resultados.push({ tipo: acao.tipo, sucesso: true, output });
      } catch (err) {
        const erroMsg = err?.message || String(err);
        this.logger.error(`[Motor] Erro na ação ${acao.tipo}: ${erroMsg}`);
        resultados.push({ tipo: acao.tipo, sucesso: false, erro: erroMsg });

        if (!acao.continuar_se_erro) break; // abortar sequência
      }
    }

    return resultados;
  }

  // ─── Executor de ação individual ─────────────────────────────────────────

  private async executarAcao(
    tipo: TipoAcao,
    config: Record<string, any>,
    dados: any,
    escritorioId: string,
    dryRun: boolean,
  ): Promise<any> {
    // Interpolar variáveis {{campo}} nos valores de config
    const cfg = this.interpolarConfig(config, dados);

    if (dryRun) {
      this.logger.debug(`[DryRun] Ação ${tipo} com config: ${JSON.stringify(cfg)}`);
      return { dryRun: true, tipo, cfg };
    }

    switch (tipo) {

      // ─── Criar tarefa ────────────────────────────────────────
      case 'tarefa.criar': {
        const prazo = cfg.prazo_dias
          ? new Date(Date.now() + cfg.prazo_dias * 86400000)
          : (dados.data_prazo ? new Date(dados.data_prazo) : null);

        const tarefa = await this.prisma.tarefa.create({
          data: {
            escritorioId: escritorioId,
            titulo:        cfg.titulo,
            descricao:     cfg.descricao,
            prioridade:    cfg.prioridade || 'MEDIA',
            dataPrazo:     prazo,
            processoId:    dados.processo_id || null,
            responsavelId: cfg.responsavel  || dados.responsavel_id || null,
          } as any,
        });

        // Notificar responsável via WebSocket
        if ((tarefa as any).responsavelId) {
          this.notifications.notifyUser((tarefa as any).responsavelId, {
            id: `auto-tarefa-${tarefa.id}`,
            type: 'tarefa.atribuida' as any,
            title: '📋 Nova tarefa criada automaticamente',
            message: (tarefa as any).titulo,
            data: { tarefaId: tarefa.id },
            link: `/tarefas/${tarefa.id}`,
            priority: 'normal',
            created_at: new Date().toISOString(),
            read: false,
          });
        }

        return { tarefaId: tarefa.id, titulo: (tarefa as any).titulo };
      }

      // ─── Notificação push (WebSocket) ────────────────────────
      case 'notificacao.push': {
        // Buscar todos os usuários do escritório
        const usuarios = await this.prisma.usuario.findMany({
          where: { escritorioId, ativo: true } as any,
          select: { id: true },
        });

        for (const u of usuarios) {
          this.notifications.notifyUser(u.id, {
            id:         `auto-notif-${Date.now()}-${u.id}`,
            type:       'sistema.automacao' as any,
            title:      cfg.titulo,
            message:    cfg.mensagem,
            data:       dados,
            link:       cfg.link || null,
            priority:   cfg.prioridade || 'normal',
            created_at: new Date().toISOString(),
            read:       false,
          });
        }

        // Persistir no banco
        await this.prisma.notificacao.createMany({
          data: usuarios.map((u) => ({
            escritorioId,
            usuarioId:  u.id,
            tipo:       'automacao',
            titulo:     cfg.titulo,
            mensagem:   cfg.mensagem,
            dados:      dados,
            link:       cfg.link || null,
            prioridade: cfg.prioridade || 'normal',
            lida:       false,
          })),
        });

        return { enviadas: usuarios.length };
      }

      // ─── WhatsApp ────────────────────────────────────────────
      case 'whatsapp.enviar_mensagem': {
        const telefone = cfg.telefone || dados.cliente_telefone;
        if (!telefone) throw new Error('Telefone não disponível para envio WhatsApp');

        await this.prisma.whatsappMessage.create({
          data: {
            escritorioId,
            telefone:   telefone.replace(/\D/g, ''),
            tipo:       'texto',
            conteudo:   cfg.template,
            status:     'pendente',
            clienteId:  dados.cliente_id || null,
            processoId: dados.processo_id || null,
          },
        });

        return { telefone, mensagem: cfg.template };
      }

      // ─── Criar evento na agenda ──────────────────────────────
      case 'agenda.criar_evento': {
        const dataEvento = new Date(
          Date.now() + (cfg.dias_a_partir || 0) * 86400000,
        );

        const evento = await this.prisma.evento.create({
          data: {
            escritorioId,
            titulo:      cfg.titulo,
            data:        dataEvento,
            tipo:        cfg.tipo || 'OUTRO',
            processoId:  dados.processo_id || null,
            criadoPorId: dados.usuario_id || dados.responsavel_id || escritorioId,
          } as any,
        });

        return { eventoId: evento.id, titulo: (evento as any).titulo, data: (evento as any).data };
      }

      // ─── Criar cobrança financeira ───────────────────────────
      case 'financeiro.criar_cobranca': {
        const vencimento = new Date(
          Date.now() + (cfg.vencimento_dias || 30) * 86400000,
        );

        const lancamento = await this.prisma.lancamentoFinanceiro.create({
          data: {
            escritorioId,
            clienteId:      dados.cliente_id,
            processoId:     dados.processo_id || null,
            tipo:           'HONORARIO',
            descricao:      cfg.descricao,
            valor:          cfg.valor,
            formaPagamento: cfg.forma_pagamento || 'PIX',
            status:         'PENDENTE',
            dataVencimento: vencimento,
          },
        });

        return { lancamentoId: lancamento.id, valor: lancamento.valor };
      }

      // ─── Disparar webhook externo ────────────────────────────
      case 'webhook.disparar': {
        const res = await fetch(cfg.url, {
          method:  cfg.method || 'POST',
          headers: { 'Content-Type': 'application/json', ...(cfg.headers || {}) },
          body:    JSON.stringify({ evento: dados }),
          signal:  AbortSignal.timeout(10000),
        });

        if (!res.ok) throw new Error(`Webhook retornou ${res.status}`);
        return { status: res.status, url: cfg.url };
      }

      // ─── Delay ───────────────────────────────────────────────
      case 'esperar': {
        // Em produção: usar Bull queue com delay
        // Em dev: ignorar ou sleep curto
        const ms = Math.min((cfg.minutos || 1) * 60000, 5000); // cap 5s em dev
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { esperadoMin: cfg.minutos };
      }

      default:
        this.logger.warn(`[Motor] Ação não implementada: ${tipo}`);
        return { aviso: `Ação "${tipo}" reconhecida mas não implementada ainda.` };
    }
  }

  // ════════════════════════════════════════════════════════════
  // CONDIÇÕES — avaliador de filtros
  // ════════════════════════════════════════════════════════════

  private avaliarCondicoes(condicoes: any[], dados: any): boolean {
    if (!condicoes || condicoes.length === 0) return true;

    return condicoes.every((c) => {
      const valorDados = this.getNestedValue(dados, c.campo);
      switch (c.operador) {
        case 'igual':      return valorDados == c.valor;
        case 'diferente':  return valorDados != c.valor;
        case 'contem':     return String(valorDados || '').toLowerCase().includes(String(c.valor).toLowerCase());
        case 'maior_que':  return Number(valorDados) > Number(c.valor);
        case 'menor_que':  return Number(valorDados) < Number(c.valor);
        default:           return true;
      }
    });
  }

  // ════════════════════════════════════════════════════════════
  // INTERPOLAÇÃO de variáveis {{campo}}
  // ════════════════════════════════════════════════════════════

  private interpolarConfig(
    config: Record<string, any>,
    dados: any,
  ): Record<string, any> {
    const interpolado: Record<string, any> = {};

    for (const [k, v] of Object.entries(config)) {
      if (typeof v === 'string') {
        interpolado[k] = v.replace(/\{\{(\w+)\}\}/g, (_, campo) => {
          return this.getNestedValue(dados, campo) ?? `{{${campo}}}`;
        });
      } else {
        interpolado[k] = v;
      }
    }

    return interpolado;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
  }

  // ════════════════════════════════════════════════════════════
  // TEMPLATES
  // ════════════════════════════════════════════════════════════

  getTemplates() {
    return TEMPLATES_PRONTOS;
  }

  async usarTemplate(
    escritorioId: string,
    criadoPorId: string,
    templateId: string,
    customizacoes?: Record<string, any>,
  ) {
    const template = TEMPLATES_PRONTOS.find((t) => t.id === templateId);
    if (!template) throw new NotFoundException(`Template ${templateId} não encontrado`);

    const dto = {
      nome:     customizacoes?.nome     || template.nome,
      descricao: customizacoes?.descricao || template.descricao,
      ativa:    true,
      gatilho:  template.gatilho as any,
      acoes:    template.acoes  as any,
    };

    return this.create(escritorioId, criadoPorId, dto);
  }

  // ════════════════════════════════════════════════════════════
  // METADADOS
  // ════════════════════════════════════════════════════════════

  getGatilhosDisponiveis() {
    return GATILHOS_META;
  }

  getAcoesDisponiveis() {
    return ACOES_META;
  }

  // ════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════

  async getStats(escritorioId: string) {
    const automacoes = await this.prisma.automacao.findMany({
      where: { escritorioId },
      select: { id: true, ativa: true, execucoes: true, erros: true, nome: true },
    });

    const ids = automacoes.map((a) => a.id);

    const [execucoesMes, sucesso, erros] = await Promise.all([
      this.prisma.automacaoLog.count({
        where: {
          automacaoId: { in: ids },
          createdAt:   { gte: new Date(new Date().setDate(1)) },
        },
      }),
      this.prisma.automacaoLog.count({ where: { automacaoId: { in: ids }, status: 'sucesso' } }),
      this.prisma.automacaoLog.count({ where: { automacaoId: { in: ids }, status: 'erro' } }),
    ]);

    const total   = automacoes.length;
    const ativas  = automacoes.filter((a) => a.ativa).length;
    const totalExec = sucesso + erros || 1;

    return {
      total,
      ativas,
      inativas: total - ativas,
      execucoesMes,
      taxaSucesso: Math.round((sucesso / totalExec) * 100),
      erros,
      topAutomacoes: automacoes
        .sort((a, b) => b.execucoes - a.execucoes)
        .slice(0, 5)
        .map((a) => ({ id: a.id, nome: a.nome, execucoes: a.execucoes, erros: a.erros })),
    };
  }
}
