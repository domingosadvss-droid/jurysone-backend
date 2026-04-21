/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Asaas Service
 *
 * Cria clientes e cobranças (boleto/PIX/cartão) no Asaas.
 * A chave de API vem de ASAAS_API_KEY (env var) ou da tabela
 * de configurações do escritório (aba Integrações).
 *
 * Documentação: https://docs.asaas.com/reference
 * ═══════════════════════════════════════════════════════════════
 */

import { Injectable, Logger } from '@nestjs/common';
import { ChavesService } from '../chaves/chaves.service';

export interface AsaasCliente {
  nome:   string;
  cpfCnpj?: string;
  email?: string;
  fone?:  string;
  externalReference?: string; // ID do cliente no JurysOne
}

export interface AsaasCobranca {
  clienteAsaasId:  string;          // customer.id retornado pelo Asaas
  valor:           number;
  vencimento:      string;          // "YYYY-MM-DD"
  descricao:       string;
  billingType:     'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED';
  externalReference?: string;       // ID do lançamento no JurysOne
  parcelas?:       number;          // para parcelamento no cartão
  mensagemPix?:    string;
}

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);

  constructor(private readonly chavesService: ChavesService) {}

  // ── helpers ──────────────────────────────────────────────────────────────

  private async getApiKey(escritorioId: string): Promise<string | null> {
    return this.chavesService.getChave(escritorioId, 'asaas');
  }

  private baseUrl(): string {
    // sandbox: https://sandbox.asaas.com/api/v3
    // produção: https://api.asaas.com/api/v3
    return process.env.ASAAS_ENV === 'sandbox'
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/api/v3';
  }

  private async fetch(escritorioId: string, path: string, method = 'GET', body?: any) {
    const apiKey = await this.getApiKey(escritorioId);
    if (!apiKey) throw new Error('ASAAS_API_KEY não configurada');

    const url = `${this.baseUrl()}${path}`;
    this.logger.log(`[Asaas] ${method} ${url}`);

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'access_token':  apiKey,
        'User-Agent':    'JurysOne/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const text = await res.text();
    this.logger.log(`[Asaas] Resposta ${res.status}: ${text.substring(0, 200)}`);

    if (!res.ok) {
      throw new Error(`Asaas ${res.status}: ${text}`);
    }

    try { return JSON.parse(text); }
    catch { return { raw: text }; }
  }

  // ── CLIENTES ─────────────────────────────────────────────────────────────

  /**
   * Cria ou atualiza cliente no Asaas.
   * Primeiro tenta buscar por CPF/CNPJ para evitar duplicatas.
   */
  async criarOuBuscarCliente(escritorioId: string, dados: AsaasCliente): Promise<string> {
    // Busca por CPF se informado
    if (dados.cpfCnpj) {
      const cpfLimpo = dados.cpfCnpj.replace(/\D/g, '');
      if (cpfLimpo.length >= 11) {
        try {
          const busca = await this.fetch(escritorioId, `/customers?cpfCnpj=${cpfLimpo}`);
          if (busca?.data?.length > 0) {
            const existente = busca.data[0];
            this.logger.log(`[Asaas] Cliente já existe: ${existente.id}`);
            return existente.id;
          }
        } catch (e) {
          this.logger.warn(`[Asaas] Erro ao buscar cliente por CPF: ${e.message}`);
        }
      }
    }

    // Cria novo cliente
    const payload: any = {
      name:              dados.nome,
      notificationDisabled: false,
    };
    if (dados.cpfCnpj)          payload.cpfCnpj          = dados.cpfCnpj.replace(/\D/g, '');
    if (dados.email)             payload.email            = dados.email;
    if (dados.fone)              payload.mobilePhone      = dados.fone.replace(/\D/g, '');
    if (dados.externalReference) payload.externalReference = dados.externalReference;

    const criado = await this.fetch(escritorioId, '/customers', 'POST', payload);
    this.logger.log(`[Asaas] Cliente criado: ${criado.id}`);
    return criado.id;
  }

  // ── COBRANÇAS ────────────────────────────────────────────────────────────

  /**
   * Cria cobrança (boleto / PIX / cartão) no Asaas.
   * Retorna o objeto completo da cobrança.
   */
  async criarCobranca(escritorioId: string, dados: AsaasCobranca) {
    const payload: any = {
      customer:          dados.clienteAsaasId,
      billingType:       dados.billingType || 'PIX',
      value:             dados.valor,
      dueDate:           dados.vencimento,
      description:       dados.descricao,
    };
    if (dados.externalReference) payload.externalReference = dados.externalReference;
    if (dados.mensagemPix)       payload.pixAddressKeyType  = 'EMAIL';

    const cobranca = await this.fetch(escritorioId, '/payments', 'POST', payload);
    this.logger.log(`[Asaas] ✅ Cobrança criada: id=${cobranca.id} | invoiceUrl=${cobranca.invoiceUrl}`);
    return cobranca;
  }

  /**
   * Fluxo completo: cria cliente + cobrança de uma vez.
   * Usado pelo AtendimentosService no Novo Atendimento.
   */
  async criarClienteECobranca(
    escritorioId: string,
    cliente: AsaasCliente,
    cobranca: Omit<AsaasCobranca, 'clienteAsaasId'>,
  ) {
    const clienteId = await this.criarOuBuscarCliente(escritorioId, cliente);
    const pagamento = await this.criarCobranca(escritorioId, {
      ...cobranca,
      clienteAsaasId: clienteId,
    });
    return { clienteId, pagamento };
  }

  // ── CONSULTAS ────────────────────────────────────────────────────────────

  async buscarCobranca(escritorioId: string, paymentId: string) {
    return this.fetch(escritorioId, `/payments/${paymentId}`);
  }

  async listarCobrancas(escritorioId: string, filtros?: { status?: string; offset?: number; limit?: number }) {
    const qs = new URLSearchParams({
      offset: String(filtros?.offset || 0),
      limit:  String(filtros?.limit  || 20),
      ...(filtros?.status ? { status: filtros.status } : {}),
    });
    return this.fetch(escritorioId, `/payments?${qs}`);
  }

  async cancelarCobranca(escritorioId: string, paymentId: string) {
    return this.fetch(escritorioId, `/payments/${paymentId}`, 'DELETE');
  }
}
