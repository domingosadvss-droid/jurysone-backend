/**
 * JURYSONE — Processos Controller
 *
 * Endpoints reais capturados do Advbox:
 *   GET  /processes              → página de processos
 *   GET  /content/processes      → conteúdo AJAX (DataTables)
 *
 * Jurysone expande com CRUD completo REST:
 */
import {
  Controller, Get, Post, Patch, Delete, Body,
  Param, Query, UseGuards, HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProcessosService } from './processos.service';
import { DataTableQueryDto } from '../../common/dto/datatable-query.dto';

@ApiTags('⚖️ Processos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('processos')
export class ProcessosController {
  constructor(private readonly svc: ProcessosService) {}

  /**
   * GET /api/v1/processos
   * Advbox: GET /content/processes
   * Params DataTables: sEcho, iDisplayStart, iDisplayLength, sSearch,
   *                    iSortCol_0, sSortDir_0, _token, report, search
   */
  @Get()
  @ApiOperation({ summary: 'Lista processos (paginado, filtros, ordenação)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'per_page', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['ativo', 'arquivado', 'encerrado', 'suspenso'] })
  @ApiQuery({ name: 'tribunal', required: false })
  @ApiQuery({ name: 'client_id', required: false })
  @ApiQuery({ name: 'responsible_id', required: false })
  @ApiQuery({ name: 'order', required: false })
  @ApiQuery({ name: 'sort', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'start_from', required: false })
  @ApiQuery({ name: 'start_until', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any): Promise<any> {
    return this.svc.findAll(query, user.officeId);
  }

  /**
   * GET /api/v1/processos/datatable
   * Compatibilidade com DataTables do Advbox
   * Advbox params: sEcho, iColumns, sColumns, iDisplayStart, iDisplayLength,
   *                mDataProp_*, sSearch_*, bRegex_*, bSearchable_*, bSortable_*
   *                sSearch, bRegex, iSortCol_0, sSortDir_0, iSortingCols
   *                _token, report, search
   */
  @Get('datatable')
  @ApiOperation({ summary: 'Lista processos — formato DataTables (compatível Advbox)' })
  findDatatable(@Query() query: DataTableQueryDto, @CurrentUser() user: any) {
    return this.svc.findDatatable(query, user.officeId);
  }

  /**
   * GET /api/v1/processos/:id
   * Detalhe completo do processo com andamentos, documentos, tarefas
   */
  @Get(':id')
  @ApiParam({ name: 'id', description: 'UUID do processo' })
  @ApiOperation({ summary: 'Detalhe completo do processo' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  /**
   * POST /api/v1/processos
   * Cria novo processo
   * Body: number, tribunal, type, client_id, responsible_id, value,
   *       started_at, custom_fields
   */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria novo processo' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create(body, user.id, user.officeId);
  }

  /**
   * PATCH /api/v1/processos/:id
   * Atualiza dados do processo
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza processo' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, body, user.officeId);
  }

  /**
   * DELETE /api/v1/processos/:id
   * Arquiva processo (soft delete — status = ARQUIVADO)
   */
  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Arquiva processo (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }

  // ── Andamentos ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/processos/:id/andamentos
   * Lista andamentos do processo (manual + scraping tribunal)
   */
  @Get(':id/andamentos')
  @ApiOperation({ summary: 'Andamentos do processo' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'source', required: false, enum: ['manual', 'tribunal', 'pje'] })
  getAndamentos(
    @Param('id') id: string,
    @Query() query: any,
    @CurrentUser() user: any,
  ) {
    return this.svc.getAndamentos(id, query, user.officeId);
  }

  /**
   * POST /api/v1/processos/:id/andamentos
   * Adiciona andamento manual
   * Body: date, description, source
   */
  @Post(':id/andamentos')
  @HttpCode(201)
  @ApiOperation({ summary: 'Adiciona andamento manual' })
  addAndamento(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.addAndamento(id, body, user.officeId);
  }

  /**
   * POST /api/v1/processos/:id/sync-tribunal
   * Sincroniza andamentos com o tribunal (scraping DataJud/CNJ)
   */
  @Post(':id/sync-tribunal')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sincroniza andamentos com tribunal' })
  syncTribunal(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.syncTribunal(id, user.officeId);
  }

  // ── Documentos do Processo ─────────────────────────────────────────────────

  /**
   * GET /api/v1/processos/:id/documentos
   */
  @Get(':id/documentos')
  @ApiOperation({ summary: 'Documentos vinculados ao processo' })
  getDocumentos(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getDocumentos(id, user.officeId);
  }

  // ── Tarefas do Processo ────────────────────────────────────────────────────

  /**
   * GET /api/v1/processos/:id/tarefas
   */
  @Get(':id/tarefas')
  @ApiOperation({ summary: 'Tarefas vinculadas ao processo' })
  getTarefas(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getTarefas(id, user.officeId);
  }

  // ── Partes do Processo ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/processos/:id/partes
   * Lista partes do processo (autores, réus, advogados adversários)
   */
  @Get(':id/partes')
  @ApiOperation({ summary: 'Partes do processo (autores, réus, etc.)' })
  getPartes(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getPartes(id, user.officeId);
  }

  /**
   * POST /api/v1/processos/:id/partes
   * Adiciona parte ao processo
   * Body: name, type (autor|reu|advogado_adversario), cpf_cnpj
   */
  @Post(':id/partes')
  @HttpCode(201)
  @ApiOperation({ summary: 'Adiciona parte ao processo' })
  addParte(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.addParte(id, body, user.officeId);
  }

  // ── Prazos do Processo ─────────────────────────────────────────────────────

  /**
   * GET /api/v1/processos/:id/prazos
   */
  @Get(':id/prazos')
  @ApiOperation({ summary: 'Prazos vinculados ao processo' })
  getPrazos(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getPrazos(id, user.officeId);
  }

  // ── Honorários do Processo ─────────────────────────────────────────────────

  /**
   * GET /api/v1/processos/:id/honorarios
   */
  @Get(':id/honorarios')
  @ApiOperation({ summary: 'Honorários vinculados ao processo' })
  getHonorarios(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getHonorarios(id, user.officeId);
  }

  // ── IA — Copiloto Jurídico ─────────────────────────────────────────────────

  /**
   * POST /api/v1/processos/:id/ai/analyze
   * Análise do processo via GPT-4o
   * Body: question
   */
  @Post(':id/ai/analyze')
  @HttpCode(200)
  @ApiOperation({ summary: 'Copiloto IA — analisa o processo' })
  analyzeWithAI(@Param('id') id: string, @Body('question') question: string, @CurrentUser() user: any) {
    return this.svc.analyzeWithAI(id, question, user.officeId);
  }

  /**
   * GET /api/v1/processos/:id/ai/risk
   * Análise de risco processual via IA
   */
  @Get(':id/ai/risk')
  @ApiOperation({ summary: 'Análise de risco processual via IA' })
  getRiskAnalysis(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getRiskAnalysis(id, user.officeId);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/processos/dashboard/kpis
   * Advbox: POST /overview (KPIs do painel)
   */
  @Get('dashboard/kpis')
  @ApiOperation({ summary: 'KPIs do painel de processos' })
  getDashboardKPIs(@CurrentUser() user: any) {
    return this.svc.getDashboardKPIs(user.officeId);
  }
}
