/**
 * JURYSONE — Financeiro Controller
 *
 * Endpoints reais capturados do Advbox:
 *   GET  /financial                → página financeiro
 *   GET  /content/financial        → conteúdo AJAX
 *   GET  /content/categories       → categorias financeiras (DataTables)
 *         Params: sEcho, iColumns, sColumns, iDisplayStart, iDisplayLength,
 *                 mDataProp_*, sSearch_*, bRegex_*, bSearchable_*, bSortable_*
 *                 sSearch, bRegex, iSortCol_0, sSortDir_0, iSortingCols
 *                 _token, report=custom, indexes_id, search
 *   GET  /content/bank_accounts    → contas bancárias (DataTables)
 *         Params: mesmos acima + report=active
 *   GET  /content/cost_centers     → centros de custo (DataTables)
 *         Params: mesmos acima + report=active
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FinanceiroService } from './financeiro.service';

@ApiTags('💰 Financeiro')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('financeiro')
export class FinanceiroController {
  constructor(private readonly svc: FinanceiroService) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // LANÇAMENTOS (receitas e despesas)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/financeiro/lancamentos
   * Advbox: GET /content/financial
   * Query: type (receita|despesa), status (pendente|pago|vencido),
   *        category_id, bank_account_id, cost_center_id, process_id,
   *        client_id, start_date, end_date, page, per_page, search
   */
  @Get('lancamentos')
  @ApiOperation({ summary: 'Lista lançamentos financeiros' })
  @ApiQuery({ name: 'type', required: false, enum: ['receita', 'despesa'] })
  @ApiQuery({ name: 'status', required: false, enum: ['pendente', 'pago', 'vencido', 'cancelado'] })
  @ApiQuery({ name: 'start_date', required: false })
  @ApiQuery({ name: 'end_date', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  getLancamentos(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getLancamentos(query, user.officeId);
  }

  /**
   * GET /api/v1/financeiro/lancamentos/datatable
   * Compatibilidade DataTables Advbox
   */
  @Get('lancamentos/datatable')
  @ApiOperation({ summary: 'Lista lançamentos — formato DataTables' })
  getLancamentosDatatable(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getLancamentosDatatable(query, user.officeId);
  }

  /**
   * POST /api/v1/financeiro/lancamentos
   * Body: type, description, value, due_date, paid_at, status,
   *       category_id, bank_account_id, cost_center_id,
   *       process_id, client_id, recurrence (none|weekly|monthly|yearly),
   *       installments, notes
   */
  @Post('lancamentos')
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria lançamento financeiro' })
  createLancamento(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.createLancamento(body, user.id, user.officeId);
  }

  @Get('lancamentos/:id')
  @ApiOperation({ summary: 'Detalhe do lançamento' })
  getLancamento(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getLancamento(id, user.officeId);
  }

  @Patch('lancamentos/:id')
  @ApiOperation({ summary: 'Atualiza lançamento' })
  updateLancamento(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.updateLancamento(id, body, user.officeId);
  }

  /**
   * POST /api/v1/financeiro/lancamentos/:id/pagar
   * Marca lançamento como pago
   * Body: paid_at, bank_account_id, value (pode ser diferente)
   */
  @Post('lancamentos/:id/pagar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca lançamento como pago' })
  pagarLancamento(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.pagarLancamento(id, body, user.officeId);
  }

  @Delete('lancamentos/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove lançamento' })
  removeLancamento(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removeLancamento(id, user.officeId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIAS
  // Advbox: GET /content/categories?report=custom&indexes_id=&search=
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/financeiro/categorias
   * Advbox: GET /content/categories
   * Query: report=custom|active|inactive, indexes_id, search, sEcho (DataTables)
   */
  @Get('categorias')
  @ApiOperation({ summary: 'Lista categorias financeiras' })
  @ApiQuery({ name: 'type', required: false, enum: ['receita', 'despesa', 'ambos'] })
  @ApiQuery({ name: 'search', required: false })
  getCategorias(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getCategorias(query, user.officeId);
  }

  /**
   * GET /api/v1/financeiro/categorias/datatable
   * Compatibilidade DataTables Advbox
   * Params: sEcho, iColumns=4, sColumns=category,index,type,created_at
   *         iDisplayStart, iDisplayLength, mDataProp_*, sSearch_*
   *         bRegex_*, bSearchable_*, bSortable_*, sSearch, bRegex
   *         iSortCol_0, sSortDir_0, iSortingCols=1
   *         _token, report=custom, indexes_id, search
   */
  @Get('categorias/datatable')
  @ApiOperation({ summary: 'Lista categorias — formato DataTables (compatível Advbox)' })
  getCategoriasDatatable(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getCategoriasDatatable(query, user.officeId);
  }

  @Post('categorias')
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria categoria financeira' })
  createCategoria(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.createCategoria(body, user.officeId);
  }

  @Patch('categorias/:id')
  @ApiOperation({ summary: 'Atualiza categoria' })
  updateCategoria(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.updateCategoria(id, body, user.officeId);
  }

  @Delete('categorias/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove categoria' })
  removeCategoria(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removeCategoria(id, user.officeId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTAS BANCÁRIAS
  // Advbox: GET /content/bank_accounts?report=active
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/financeiro/contas
   * Advbox: GET /content/bank_accounts
   * Columns: name, institution, default, created_at
   * Query: report=active|inactive, search
   */
  @Get('contas')
  @ApiOperation({ summary: 'Lista contas bancárias' })
  @ApiQuery({ name: 'report', required: false, enum: ['active', 'inactive'] })
  getContas(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getContas(query, user.officeId);
  }

  /**
   * GET /api/v1/financeiro/contas/datatable
   * Params: sEcho, iColumns=4, sColumns=name,institution,default,created_at
   *         iDisplayStart, iDisplayLength, mDataProp_0-3
   *         sSearch_0-3, bRegex_0-3, bSearchable_0-3, bSortable_0-3
   *         sSearch, bRegex, iSortCol_0, sSortDir_0=asc, iSortingCols=1
   *         _token, report=active, search
   */
  @Get('contas/datatable')
  @ApiOperation({ summary: 'Lista contas bancárias — formato DataTables (compatível Advbox)' })
  getContasDatatable(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getContasDatatable(query, user.officeId);
  }

  /**
   * POST /api/v1/financeiro/contas
   * Body: name, institution, agency, account_number, type (corrente|poupanca|investimento),
   *       initial_balance, is_default (bool)
   */
  @Post('contas')
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria conta bancária' })
  createConta(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.createConta(body, user.officeId);
  }

  @Patch('contas/:id')
  @ApiOperation({ summary: 'Atualiza conta bancária' })
  updateConta(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.updateConta(id, body, user.officeId);
  }

  @Delete('contas/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove conta bancária' })
  removeConta(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removeConta(id, user.officeId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CENTROS DE CUSTO
  // Advbox: GET /content/cost_centers?report=active
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/financeiro/centros-custo
   * Advbox: GET /content/cost_centers
   * Columns: cost_center, created_at
   * Query: report=active|inactive, search
   */
  @Get('centros-custo')
  @ApiOperation({ summary: 'Lista centros de custo' })
  getCentrosCusto(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getCentrosCusto(query, user.officeId);
  }

  /**
   * GET /api/v1/financeiro/centros-custo/datatable
   * Params: sEcho, iColumns=2, sColumns=cost_center,created_at
   *         iDisplayStart, iDisplayLength, mDataProp_0-1
   *         sSearch, bRegex, iSortCol_0, sSortDir_0=asc, iSortingCols=1
   *         _token, report=active, search
   */
  @Get('centros-custo/datatable')
  @ApiOperation({ summary: 'Lista centros de custo — formato DataTables (compatível Advbox)' })
  getCentrosCustoDatatable(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getCentrosCustoDatatable(query, user.officeId);
  }

  @Post('centros-custo')
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria centro de custo' })
  createCentroCusto(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.createCentroCusto(body, user.officeId);
  }

  @Patch('centros-custo/:id')
  @ApiOperation({ summary: 'Atualiza centro de custo' })
  updateCentroCusto(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.updateCentroCusto(id, body, user.officeId);
  }

  @Delete('centros-custo/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove centro de custo' })
  removeCentroCusto(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removeCentroCusto(id, user.officeId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESUMO / DASHBOARD FINANCEIRO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/financeiro/overview
   * Advbox: POST /overview (KPIs do painel)
   * Response: { revenue, expenses, profit, pending, overdue, by_month: [] }
   */
  @Get('overview')
  @ApiOperation({ summary: 'Resumo financeiro do período' })
  @ApiQuery({ name: 'month', required: false, description: 'YYYY-MM' })
  @ApiQuery({ name: 'year', required: false })
  getOverview(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getOverview(query, user.officeId);
  }

  /**
   * GET /api/v1/financeiro/chart
   * Advbox: POST /chart
   * Dados do gráfico de evolução financeira
   * Query: period (monthly|weekly|daily), type (all|receita|despesa)
   */
  @Get('chart')
  @ApiOperation({ summary: 'Dados do gráfico financeiro' })
  @ApiQuery({ name: 'period', required: false, enum: ['daily', 'weekly', 'monthly', 'yearly'] })
  @ApiQuery({ name: 'type', required: false, enum: ['all', 'receita', 'despesa'] })
  getChartData(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getChartData(query, user.officeId);
  }

  /**
   * GET /api/v1/financeiro/dre
   * Demonstrativo de Resultados do Exercício
   */
  @Get('dre')
  @ApiOperation({ summary: 'DRE — Demonstrativo de Resultados' })
  @ApiQuery({ name: 'start_date', required: false })
  @ApiQuery({ name: 'end_date', required: false })
  getDRE(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getDRE(query, user.officeId);
  }

  /**
   * GET /api/v1/financeiro/fluxo-caixa
   * Fluxo de caixa projetado
   */
  @Get('fluxo-caixa')
  @ApiOperation({ summary: 'Fluxo de caixa' })
  @ApiQuery({ name: 'months', required: false, description: 'Número de meses (default: 3)' })
  getFluxoCaixa(@Query() query: any, @CurrentUser() user: any): Promise<any> {
    return this.svc.getFluxoCaixa(query, user.officeId);
  }
}
