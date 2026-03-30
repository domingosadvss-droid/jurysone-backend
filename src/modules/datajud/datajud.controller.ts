/**
 * ═══════════════════════════════════════════════════════════════
 * JURYSONE — Integração CNJ / DataJud
 * NOVA FUNCIONALIDADE — Advbox tem integração básica e paga
 *
 * Integração completa com o sistema do CNJ:
 *   - Busca e acompanhamento automático de processos no DataJud
 *   - Importação em lote de processos por OAB
 *   - Monitoramento de novas movimentações (polling + webhook)
 *   - Alertas automáticos de prazos e andamentos
 *   - Vinculação de processos encontrados ao cliente
 *   - Histórico de movimentações sincronizadas
 *   - Suporte a todos os tribunais: STF, STJ, TJs, TRTs, TRFs
 * ═══════════════════════════════════════════════════════════════
 */

import {
  Controller, Get, Post, Patch, Body,
  Param, Query, UseGuards, Request,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DatajudService } from './datajud.service';

@ApiTags('DataJud — CNJ')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('datajud')
export class DatajudController {

  constructor(private readonly service: DatajudService) {}

  /* ──────────────────── BUSCA PROCESSOS ─────────────────────── */

  /**
   * GET /datajud/buscar
   * Buscar processo no CNJ/DataJud por número
   * Query: { numero_processo } — formato: NNNNNNN-DD.AAAA.J.TT.OOOO
   * Ex: 0001234-55.2023.8.26.0100
   */
  @Get('buscar')
  async buscarProcesso(
    @Request() req: any,
    @Query() query: { numero_processo: string },
  ) {
    return this.service.buscarProcesso(query.numero_processo);
  }

  /**
   * GET /datajud/buscar/oab
   * Buscar todos os processos de um advogado por número OAB
   * Query: { numero_oab, estado, page }
   * NOVA FUNCIONALIDADE — Importação em lote
   */
  @Get('buscar/oab')
  async buscarPorOab(
    @Request() req: any,
    @Query() query: { numero_oab: string; estado: string; page?: string },
  ) {
    return this.service.buscarPorOab(query);
  }

  /**
   * GET /datajud/buscar/cpf-cnpj
   * Buscar processos por CPF/CNPJ de cliente (parte)
   * Query: { cpf_cnpj, tribunal?, page }
   */
  @Get('buscar/cpf-cnpj')
  async buscarPorCpfCnpj(
    @Request() req: any,
    @Query() query: { cpf_cnpj: string; tribunal?: string; page?: string },
  ) {
    return this.service.buscarPorCpfCnpj(query);
  }

  /* ──────────────────── IMPORTAÇÃO ──────────────────────────── */

  /**
   * POST /datajud/importar
   * Importar processo do DataJud para o Jurysone
   * Body: { numero_processo, cliente_id?, advogado_responsavel_id?, criar_cliente?: boolean }
   */
  @Post('importar')
  async importarProcesso(
    @Request() req: any,
    @Body() dto: {
      numero_processo: string;
      cliente_id?: string;
      advogado_responsavel_id?: string;
      criar_cliente?: boolean;
    },
  ) {
    return this.service.importarProcesso(req.user, dto);
  }

  /**
   * POST /datajud/importar/lote
   * Importar múltiplos processos em lote (job assíncrono)
   * Body: { processos: string[], cliente_id?, advogado_id? }
   */
  @Post('importar/lote')
  async importarLote(
    @Request() req: any,
    @Body() dto: {
      processos: string[];
      cliente_id?: string;
      advogado_id?: string;
    },
  ) {
    return this.service.importarLote(req.user, dto);
  }

  /**
   * POST /datajud/importar/oab
   * Importar todos os processos de um OAB (job assíncrono)
   * Body: { numero_oab, estado, filtros?: { status?, area? } }
   */
  @Post('importar/oab')
  async importarPorOab(
    @Request() req: any,
    @Body() dto: {
      numero_oab: string;
      estado: string;
      filtros?: { status?: string; area?: string };
    },
  ) {
    return this.service.importarPorOab(req.user, dto);
  }

  /**
   * GET /datajud/jobs/:id
   * Status de um job de importação em lote
   */
  @Get('jobs/:id')
  async getJobStatus(@Request() req: any, @Param('id') id: string) {
    return this.service.getJobStatus(req.user.officeId, id);
  }

  /* ──────────────────── MONITORAMENTO ───────────────────────── */

  /**
   * GET /datajud/monitoramentos
   * Lista processos monitorados automaticamente
   * Query: { ativo, tribunal, page }
   */
  @Get('monitoramentos')
  async listMonitoramentos(
    @Request() req: any,
    @Query() query: { ativo?: string; tribunal?: string; page?: string },
  ) {
    return this.service.listMonitoramentos(req.user.officeId, query);
  }

  /**
   * POST /datajud/monitoramentos
   * Ativar monitoramento de processo (verificação automática a cada 6h)
   * Body: { processo_id, alertar_movimentacao: bool, alertar_prazo: bool, usuarios_alertar: string[] }
   */
  @Post('monitoramentos')
  async ativarMonitoramento(
    @Request() req: any,
    @Body() dto: {
      processo_id: string;
      alertar_movimentacao: boolean;
      alertar_prazo: boolean;
      usuarios_alertar: string[];
    },
  ) {
    return this.service.ativarMonitoramento(req.user.officeId, dto);
  }

  /**
   * PATCH /datajud/monitoramentos/:id
   * Atualizar configurações de monitoramento
   */
  @Patch('monitoramentos/:id')
  async updateMonitoramento(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: any,
  ) {
    return this.service.updateMonitoramento(req.user.officeId, id, dto);
  }

  /**
   * POST /datajud/monitoramentos/:id/sync
   * Forçar sincronização imediata de um processo monitorado
   */
  @Post('monitoramentos/:id/sync')
  @HttpCode(HttpStatus.OK)
  async syncManual(@Request() req: any, @Param('id') id: string) {
    return this.service.syncManual(req.user, id);
  }

  /* ──────────────────── ANDAMENTOS ──────────────────────────── */

  /**
   * GET /datajud/andamentos
   * Últimas movimentações sincronizadas de todos os processos monitorados
   * Query: { data_inicio?, data_fim?, tribunal?, page }
   */
  @Get('andamentos')
  async getAndamentos(
    @Request() req: any,
    @Query() query: {
      data_inicio?: string;
      data_fim?: string;
      tribunal?: string;
      page?: string;
    },
  ) {
    return this.service.getAndamentos(req.user.officeId, query);
  }

  /**
   * GET /datajud/andamentos/nao-vinculados
   * Andamentos capturados que ainda não foram vinculados a processo no Jurysone
   */
  @Get('andamentos/nao-vinculados')
  async getAndamentosNaoVinculados(@Request() req: any) {
    return this.service.getAndamentosNaoVinculados(req.user.officeId);
  }

  /* ──────────────────── TRIBUNAIS ───────────────────────────── */

  /**
   * GET /datajud/tribunais
   * Lista de tribunais suportados com status de API
   */
  @Get('tribunais')
  async getTribunais() {
    return this.service.getTribunais();
  }

  /**
   * GET /datajud/tribunais/:sigla/status
   * Status da API do tribunal (online/degradado/offline)
   */
  @Get('tribunais/:sigla/status')
  async getTribunalStatus(@Param('sigla') sigla: string) {
    return this.service.getTribunalStatus(sigla);
  }

  /* ──────────────────── CONFIGURAÇÕES ───────────────────────── */

  /**
   * GET /datajud/config
   * Configurações de integração DataJud do escritório
   * (credenciais, frequência de sync, tribunais ativos)
   */
  @Get('config')
  async getConfig(@Request() req: any) {
    return this.service.getConfig(req.user.officeId);
  }

  /**
   * Patch /datajud/config
   * Atualizar configurações
   * Body: { api_key?, frequencia_sync_horas, tribunais_ativos: string[], auto_importar: bool }
   */
  @Patch('config')
  async updateConfig(@Request() req: any, @Body() dto: any) {
    return this.service.updateConfig(req.user.officeId, dto);
  }
}
