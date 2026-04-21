/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Asaas Service (completo conforme docs.asaas.com/reference)
 *
 * Recursos implementados:
 *   - Clientes (criar, buscar, atualizar, listar)
 *   - Cobranças avulsas (boleto / PIX / cartão / UNDEFINED)
 *   - Cobranças parceladas (installmentCount + totalValue)
 *   - Assinaturas recorrentes (semanal, mensal, anual, etc.)
 *   - Consultas e cancelamentos
 *
 * Autenticação: header "access_token" com a API key do Asaas
 * Documentação: https://docs.asaas.com/reference
 * ═══════════════════════════════════════════════════════════════
 */

import { Injectable, Logger } from '@nestjs/common';
import { ChavesService } from '../chaves/chaves.service';

// ── Status possíveis de uma cobrança ────────────────────────────────────────
export type AsaasPaymentStatus =
  | 'PENDING'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'RECEIVED_IN_CASH'
  | 'REFUND_REQUESTED'
  | 'REFUND_IN_PROGRESS'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED'
  | 'AWAITING_RISK_ANALYSIS';

export type AsaasBillingType = 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
export type AsaasSubscriptionCycle = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'BIMONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY';

// ── Interfaces ────────────────────────────────────────────────────────────────

/** Dados para criar/buscar cliente no Asaas */
export interface AsaasCliente {
  nome:                  string;          // obrigatório — name
  cpfCnpj?:             string;          // CPF ou CNPJ (recomendado para deduplicação)
  email?:               string;
  fone?:                string;          // celular — mobilePhone
  telefone?:            string;          // fixo — phone
  endereco?:            string;          // address
  numeroEndereco?:      string;          // addressNumber
  complemento?:         string;          // complement
  bairro?:              string;          // province
  cep?:                 string;          // postalCode
  empresa?:             string;          // company
  emailsAdicionais?:    string;          // additionalEmails (separados por vírgula)
  observacoes?:         string;          // observations
  grupoNome?:           string;          // groupName
  notificacaoDesabilitada?: boolean;     // notificationDisabled
  externalReference?:   string;          // ID do cliente no JurysOne
}

/** Desconto na cobrança */
export interface AsaasDesconto {
  value:       number;  // valor do desconto
  dueDateLimitDays: number; // dias antes do vencimento para aplicar
  type:        'FIXED' | 'PERCENTAGE';
}

/** Juros por atraso */
export interface AsaasJuros {
  value: number;  // percentual de juros ao mês
}

/** Multa por atraso */
export interface AsaasMulta {
  value: number;  // percentual de multa
  type:  'FIXED' | 'PERCENTAGE';
}

/** Split de pagamento */
export interface AsaasSplit {
  walletId:          string;
  fixedValue?:       number;
  percentualValue?:  number;
  totalFixedValue?:  number;
  externalReference?: string;
  description?:      string;
}

/** Callback após pagamento */
export interface AsaasCallback {
  successUrl:   string;
  autoRedirect: boolean;
}

/** Dados para criar cobrança avulsa ou parcelada */
export interface AsaasCobranca {
  clienteAsaasId:   string;              // customer — ID retornado pelo Asaas
  valor:            number;              // value (avulsa) ou totalValue (parcelada)
  vencimento:       string;             // dueDate — "YYYY-MM-DD"
  descricao?:       string;             // description (máx. 500 chars)
  billingType?:     AsaasBillingType;   // padrão: UNDEFINED (cliente escolhe)
  externalReference?: string;           // ID do lançamento no JurysOne
  parcelas?:        number;             // installmentCount (≥2 para parcelado)
  // Boleto
  diasCancelamentoBoleto?: number;      // daysAfterDueDateToRegistrationCancellation
  // Financeiro
  desconto?:        AsaasDesconto;
  juros?:           AsaasJuros;
  multa?:           AsaasMulta;
  // Split
  split?:           AsaasSplit[];
  // Callback
  callback?:        AsaasCallback;
}

/** Dados para criar assinatura recorrente */
export interface AsaasAssinatura {
  clienteAsaasId:   string;              // customer
  billingType:      AsaasBillingType;
  valor:            number;              // value
  proximoVencimento: string;            // nextDueDate — "YYYY-MM-DD"
  ciclo:            AsaasSubscriptionCycle; // cycle
  descricao?:       string;
  dataFim?:         string;             // endDate
  maxCobranças?:    number;             // maxPayments
  externalReference?: string;
  desconto?:        AsaasDesconto;
  juros?:           AsaasJuros;
  multa?:           AsaasMulta;
  split?:           AsaasSplit[];
  callback?:        AsaasCallback;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);

  constructor(private readonly chavesService: ChavesService) {}

  // ── Infraestrutura ────────────────────────────────────────────────────────

  private async getApiKey(escritorioId: string): Promise<string | null> {
    return this.chavesService.getChave(escritorioId, 'asaas');
  }

  private baseUrl(): string {
    // Sandbox: https://sandbox.asaas.com/api/v3
    // Produção: https://api.asaas.com/v3  (sem /api — conforme docs.asaas.com)
    return process.env.ASAAS_ENV === 'sandbox'
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';
  }

  private async request(
    escritorioId: string,
    path: string,
    method = 'GET',
    body?: any,
  ): Promise<any> {
    const apiKey = await this.getApiKey(escritorioId);
    if (!apiKey) throw new Error('ASAAS_API_KEY não configurada — acesse Configurações → Integrações');

    const url = `${this.baseUrl()}${path}`;
    this.logger.log(`[Asaas] ${method} ${url}`);

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
        'User-Agent':   'JurysOne/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    this.logger.log(`[Asaas] ${res.status}: ${text.substring(0, 300)}`);

    if (!res.ok) throw new Error(`Asaas ${res.status}: ${text}`);

    try { return JSON.parse(text); }
    catch { return { raw: text }; }
  }

  // ── CLIENTES ─────────────────────────────────────────────────────────────

  /**
   * Busca cliente por CPF/CNPJ para evitar duplicatas.
   * Retorna null se não encontrado.
   */
  async buscarClientePorCpf(escritorioId: string, cpfCnpj: string): Promise<string | null> {
    const cpfLimpo = cpfCnpj.replace(/\D/g, '');
    if (cpfLimpo.length < 11) return null;
    try {
      const res = await this.request(escritorioId, `/customers?cpfCnpj=${cpfLimpo}&limit=1`);
      return res?.data?.[0]?.id ?? null;
    } catch (e) {
      this.logger.warn(`[Asaas] Erro ao buscar por CPF: ${e.message}`);
      return null;
    }
  }

  /**
   * Cria cliente no Asaas com todos os campos da API.
   */
  async criarCliente(escritorioId: string, dados: AsaasCliente): Promise<any> {
    const payload: any = { name: dados.nome, notificationDisabled: dados.notificacaoDesabilitada ?? false };

    if (dados.cpfCnpj)             payload.cpfCnpj             = dados.cpfCnpj.replace(/\D/g, '');
    if (dados.email)               payload.email               = dados.email;
    if (dados.fone)                payload.mobilePhone          = dados.fone.replace(/\D/g, '');
    if (dados.telefone)            payload.phone               = dados.telefone.replace(/\D/g, '');
    if (dados.endereco)            payload.address             = dados.endereco;
    if (dados.numeroEndereco)      payload.addressNumber       = dados.numeroEndereco;
    if (dados.complemento)         payload.complement          = dados.complemento;
    if (dados.bairro)              payload.province            = dados.bairro;
    if (dados.cep)                 payload.postalCode          = dados.cep.replace(/\D/g, '');
    if (dados.empresa)             payload.company             = dados.empresa;
    if (dados.emailsAdicionais)    payload.additionalEmails    = dados.emailsAdicionais;
    if (dados.observacoes)         payload.observations        = dados.observacoes;
    if (dados.grupoNome)           payload.groupName           = dados.grupoNome;
    if (dados.externalReference)   payload.externalReference   = dados.externalReference;

    const criado = await this.request(escritorioId, '/customers', 'POST', payload);
    this.logger.log(`[Asaas] ✅ Cliente criado: ${criado.id}`);
    return criado;
  }

  /**
   * Cria ou reaproveita cliente existente (busca por CPF primeiro).
   * Retorna o ID do cliente no Asaas.
   */
  async criarOuBuscarCliente(escritorioId: string, dados: AsaasCliente): Promise<string> {
    if (dados.cpfCnpj) {
      const existente = await this.buscarClientePorCpf(escritorioId, dados.cpfCnpj);
      if (existente) {
        this.logger.log(`[Asaas] Cliente já existe: ${existente}`);
        return existente;
      }
    }
    const criado = await this.criarCliente(escritorioId, dados);
    return criado.id;
  }

  async listarClientes(
    escritorioId: string,
    filtros?: { name?: string; email?: string; cpfCnpj?: string; offset?: number; limit?: number },
  ) {
    const qs = new URLSearchParams({
      offset: String(filtros?.offset ?? 0),
      limit:  String(filtros?.limit  ?? 20),
      ...(filtros?.name    ? { name:    filtros.name }    : {}),
      ...(filtros?.email   ? { email:   filtros.email }   : {}),
      ...(filtros?.cpfCnpj ? { cpfCnpj: filtros.cpfCnpj.replace(/\D/g,'') } : {}),
    });
    return this.request(escritorioId, `/customers?${qs}`);
  }

  async buscarCliente(escritorioId: string, clienteId: string) {
    return this.request(escritorioId, `/customers/${clienteId}`);
  }

  async atualizarCliente(escritorioId: string, clienteId: string, dados: Partial<AsaasCliente>) {
    return this.request(escritorioId, `/customers/${clienteId}`, 'PUT', dados);
  }

  // ── COBRANÇAS ─────────────────────────────────────────────────────────────

  /**
   * Cria cobrança avulsa ou parcelada no Asaas.
   *
   * Regras da API:
   *  - Avulsa (1 parcela):   enviar `value`
   *  - Parcelada (≥2):       enviar `installmentCount` + `totalValue`
   *  - billingType UNDEFINED: cliente escolhe PIX, boleto ou cartão
   */
  async criarCobranca(escritorioId: string, dados: AsaasCobranca): Promise<any> {
    const isParcelado = dados.parcelas && dados.parcelas > 1;

    const payload: any = {
      customer:    dados.clienteAsaasId,
      billingType: dados.billingType ?? 'UNDEFINED',
      dueDate:     dados.vencimento,
    };

    if (dados.descricao)       payload.description = dados.descricao.substring(0, 500);

    // Valor — avulsa x parcelada
    if (isParcelado) {
      payload.installmentCount = dados.parcelas;
      payload.totalValue       = dados.valor;
    } else {
      payload.value = dados.valor;
    }

    // Boleto — cancelamento automático após vencimento
    if (dados.diasCancelamentoBoleto != null) {
      payload.daysAfterDueDateToRegistrationCancellation = dados.diasCancelamentoBoleto;
    }

    if (dados.externalReference) payload.externalReference = dados.externalReference;
    if (dados.desconto)          payload.discount           = dados.desconto;
    if (dados.juros)             payload.interest           = dados.juros;
    if (dados.multa)             payload.fine               = dados.multa;
    if (dados.split?.length)     payload.split              = dados.split;
    if (dados.callback)          payload.callback           = dados.callback;

    const cobranca = await this.request(escritorioId, '/payments', 'POST', payload);
    this.logger.log(`[Asaas] ✅ Cobrança criada: id=${cobranca.id} status=${cobranca.status} invoiceUrl=${cobranca.invoiceUrl}`);
    return cobranca;
  }

  /**
   * Fluxo completo: cria cliente (ou reaproveita) + cobrança.
   * Usado pelo AtendimentosService no Novo Atendimento.
   */
  async criarClienteECobranca(
    escritorioId: string,
    cliente: AsaasCliente,
    cobranca: Omit<AsaasCobranca, 'clienteAsaasId'>,
  ): Promise<{ clienteId: string; pagamento: any }> {
    const clienteId = await this.criarOuBuscarCliente(escritorioId, cliente);
    const pagamento = await this.criarCobranca(escritorioId, { ...cobranca, clienteAsaasId: clienteId });
    return { clienteId, pagamento };
  }

  async buscarCobranca(escritorioId: string, paymentId: string) {
    return this.request(escritorioId, `/payments/${paymentId}`);
  }

  async listarCobrancas(
    escritorioId: string,
    filtros?: {
      status?:        AsaasPaymentStatus;
      billingType?:   AsaasBillingType;
      customer?:      string;
      externalReference?: string;
      dueDateStart?:  string;   // "YYYY-MM-DD"
      dueDateEnd?:    string;
      paymentDateStart?: string;
      paymentDateEnd?:   string;
      offset?:        number;
      limit?:         number;
    },
  ) {
    const params: Record<string, string> = {
      offset: String(filtros?.offset ?? 0),
      limit:  String(filtros?.limit  ?? 20),
    };
    if (filtros?.status)             params.status             = filtros.status;
    if (filtros?.billingType)        params.billingType        = filtros.billingType;
    if (filtros?.customer)           params.customer           = filtros.customer;
    if (filtros?.externalReference)  params.externalReference  = filtros.externalReference;
    if (filtros?.dueDateStart)       params.dueDateStart       = filtros.dueDateStart;
    if (filtros?.dueDateEnd)         params.dueDateEnd         = filtros.dueDateEnd;
    if (filtros?.paymentDateStart)   params.paymentDateStart   = filtros.paymentDateStart;
    if (filtros?.paymentDateEnd)     params.paymentDateEnd     = filtros.paymentDateEnd;

    return this.request(escritorioId, `/payments?${new URLSearchParams(params)}`);
  }

  async cancelarCobranca(escritorioId: string, paymentId: string) {
    return this.request(escritorioId, `/payments/${paymentId}`, 'DELETE');
  }

  async estornarCobranca(escritorioId: string, paymentId: string) {
    return this.request(escritorioId, `/payments/${paymentId}/refund`, 'POST');
  }

  // ── ASSINATURAS (recorrência) ─────────────────────────────────────────────

  /**
   * Cria assinatura recorrente.
   * Ciclos: WEEKLY, BIWEEKLY, MONTHLY, BIMONTHLY, QUARTERLY, SEMIANNUALLY, YEARLY
   */
  async criarAssinatura(escritorioId: string, dados: AsaasAssinatura): Promise<any> {
    const payload: any = {
      customer:    dados.clienteAsaasId,
      billingType: dados.billingType,
      value:       dados.valor,
      nextDueDate: dados.proximoVencimento,
      cycle:       dados.ciclo,
    };

    if (dados.descricao)        payload.description       = dados.descricao.substring(0, 500);
    if (dados.dataFim)          payload.endDate           = dados.dataFim;
    if (dados.maxCobranças)     payload.maxPayments       = dados.maxCobranças;
    if (dados.externalReference) payload.externalReference = dados.externalReference;
    if (dados.desconto)         payload.discount          = dados.desconto;
    if (dados.juros)            payload.interest          = dados.juros;
    if (dados.multa)            payload.fine              = dados.multa;
    if (dados.split?.length)    payload.split             = dados.split;
    if (dados.callback)         payload.callback          = dados.callback;

    const assinatura = await this.request(escritorioId, '/subscriptions', 'POST', payload);
    this.logger.log(`[Asaas] ✅ Assinatura criada: id=${assinatura.id}`);
    return assinatura;
  }

  async buscarAssinatura(escritorioId: string, subscriptionId: string) {
    return this.request(escritorioId, `/subscriptions/${subscriptionId}`);
  }

  async listarAssinaturas(escritorioId: string, filtros?: { customer?: string; status?: string; offset?: number; limit?: number }) {
    const params: Record<string, string> = {
      offset: String(filtros?.offset ?? 0),
      limit:  String(filtros?.limit  ?? 20),
    };
    if (filtros?.customer) params.customer = filtros.customer;
    if (filtros?.status)   params.status   = filtros.status;
    return this.request(escritorioId, `/subscriptions?${new URLSearchParams(params)}`);
  }

  async cancelarAssinatura(escritorioId: string, subscriptionId: string) {
    return this.request(escritorioId, `/subscriptions/${subscriptionId}`, 'DELETE');
  }

  async listarCobrancasAssinatura(escritorioId: string, subscriptionId: string) {
    return this.request(escritorioId, `/subscriptions/${subscriptionId}/payments`);
  }
}
