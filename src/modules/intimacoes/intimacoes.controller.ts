/**
 * JURYSONE — IntimacoesController
 * Intimações capturadas automaticamente dos Diários da Justiça
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IntimacoesService } from './intimacoes.service';

@ApiTags('📬 Intimações')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('intimacoes')
export class IntimacoesController {
  constructor(private readonly svc: IntimacoesService) {}

  // ── Intimações ────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/intimacoes
   * Lista intimações com filtros
   */
  @Get()
  @ApiOperation({ summary: 'Lista intimações capturadas dos Diários Oficiais' })
  @ApiQuery({ name: 'status',      required: false, enum: ['NAO_LIDA', 'LIDA', 'RESPONDIDA', 'ARQUIVADA', 'PRAZO_CRIADO'] })
  @ApiQuery({ name: 'tribunal',    required: false })
  @ApiQuery({ name: 'process_id',  required: false })
  @ApiQuery({ name: 'lida',        required: false })
  @ApiQuery({ name: 'fonte',       required: false })
  @ApiQuery({ name: 'start_date',  required: false })
  @ApiQuery({ name: 'end_date',    required: false })
  @ApiQuery({ name: 'search',      required: false })
  @ApiQuery({ name: 'page',        required: false })
  @ApiQuery({ name: 'per_page',    required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll(query, user.officeId);
  }

  /** GET /api/v1/intimacoes/count — Badge de não lidas */
  @Get('nao-lidas/count')
  @ApiOperation({ summary: 'Contagem de intimações não lidas (badge)' })
  getUnreadCount(@CurrentUser() user: any) {
    return this.svc.getUnreadCount(user.officeId);
  }

  /** GET /api/v1/intimacoes/estatisticas */
  @Get('estatisticas')
  @ApiOperation({ summary: 'Estatísticas gerais de intimações' })
  getEstatisticas(@CurrentUser() user: any) {
    return this.svc.getEstatisticas(user.officeId);
  }

  /** GET /api/v1/intimacoes/tribunais — Lista tribunais suportados */
  @Get('tribunais')
  @ApiOperation({ summary: 'Lista tribunais suportados para monitoramento' })
  getTribunais() {
    return this.svc.getTribunais();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da intimação' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  /** POST /api/v1/intimacoes/:id/marcar-lida */
  @Post(':id/marcar-lida')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca intimação como lida' })
  marcarLida(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.marcarLida(id, user.id, user.officeId);
  }

  /** POST /api/v1/intimacoes/:id/vincular-processo */
  @Post(':id/vincular-processo')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vincula intimação a um processo' })
  vincularProcesso(
    @Param('id') id: string,
    @Body('process_id') processId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.vincularProcesso(id, processId, user.officeId);
  }

  /** POST /api/v1/intimacoes/:id/providencia */
  @Post(':id/providencia')
  @HttpCode(200)
  @ApiOperation({ summary: 'Registra providência tomada na intimação' })
  registrarProvidencia(
    @Param('id') id: string,
    @Body('providencia') providencia: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.registrarProvidencia(id, providencia, user.officeId);
  }

  /** POST /api/v1/intimacoes/:id/arquivar */
  @Post(':id/arquivar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Arquiva intimação' })
  arquivar(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.arquivar(id, user.officeId);
  }

  /**
   * POST /api/v1/intimacoes/sync
   * Dispara sincronização manual com os Diários Oficiais
   */
  @Post('sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sincroniza intimações com os Diários da Justiça (DataJud/CNJ)' })
  sync(@CurrentUser() user: any) {
    return this.svc.sincronizar(user.officeId);
  }

  // ── Monitoramentos ────────────────────────────────────────────────────────

  /**
   * GET /api/v1/intimacoes/monitoramentos
   * Lista configurações de monitoramento do escritório
   */
  @Get('monitoramentos')
  @ApiOperation({ summary: 'Lista monitoramentos de Diário Oficial configurados' })
  listarMonitoramentos(@CurrentUser() user: any) {
    return this.svc.listarMonitoramentos(user.officeId);
  }

  /**
   * POST /api/v1/intimacoes/monitoramentos
   * Cria novo monitoramento
   * Body: { nome, tipo, termoBusca, oabNumero?, oabEstado?, nomeAdvogado?,
   *         cpfCnpj?, tribunais[], notificarEmail, notificarWhatsapp }
   */
  @Post('monitoramentos')
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria monitoramento de Diário Oficial por OAB, nome ou CPF/CNPJ' })
  criarMonitoramento(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.criarMonitoramento(body, user.id, user.officeId);
  }

  /** PATCH /api/v1/intimacoes/monitoramentos/:id */
  @Patch('monitoramentos/:id')
  @ApiOperation({ summary: 'Atualiza configurações do monitoramento' })
  atualizarMonitoramento(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.svc.atualizarMonitoramento(id, body, user.officeId);
  }

  /** DELETE /api/v1/intimacoes/monitoramentos/:id */
  @Delete('monitoramentos/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove monitoramento' })
  removerMonitoramento(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removerMonitoramento(id, user.officeId);
  }

  /**
   * POST /api/v1/intimacoes/monitoramentos/:id/sync
   * Força sincronização imediata de um monitoramento específico
   */
  @Post('monitoramentos/:id/sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Força sincronização de um monitoramento específico' })
  async syncMonitoramento(@Param('id') id: string, @CurrentUser() user: any) {
    const mon = await this.svc.listarMonitoramentos(user.officeId);
    const monitoramento = mon.find((m: any) => m.id === id);
    if (!monitoramento) return { error: 'Monitoramento não encontrado' };
    return this.svc.sincronizarMonitoramento(monitoramento, user.officeId);
  }
}
