/**
 * JURYSONE — Configurações Controller
 *
 * Endpoints reais capturados do Advbox:
 *   GET /settings             → página configurações
 *   GET /content/settings     → conteúdo AJAX
 *   GET /content/users        → lista usuários do escritório
 *   GET /content/users_list   → DataTables usuários
 *       Params: sEcho, iColumns=5, sColumns=name,role,goal,financial,created_at
 *               iDisplayStart, iDisplayLength, mDataProp_0-4
 *               sSearch_0-4, bRegex_0-4, bSearchable_0-4, bSortable_0-4
 *               sSearch, bRegex, iSortCol_0, sSortDir_0=asc, iSortingCols=1
 *               _token, report=active, role, search
 *   GET /content/squads       → times/equipes (DataTables)
 *       Params: sEcho, iColumns=3, sColumns=name,role,created_at
 *               iDisplayStart, iDisplayLength, mDataProp_0-2
 *               sSearch, bRegex, iSortCol_0, sSortDir_0=asc, iSortingCols=1
 *               _token, report=active, search
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('⚙️ Configurações')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('configuracoes')
export class ConfiguracoesController {

  // ── Usuários ───────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/configuracoes/usuarios
   * Advbox: GET /content/users
   * Lista usuários do escritório
   */
  @Get('usuarios')
  @ApiOperation({ summary: 'Lista usuários do escritório' })
  @ApiQuery({ name: 'role', required: false, enum: ['ADMIN', 'ADVOGADO', 'ESTAGIARIO', 'SECRETARIA'] })
  @ApiQuery({ name: 'report', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'search', required: false })
  getUsuarios(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Usuários', query };
  }

  /**
   * GET /api/v1/configuracoes/usuarios/datatable
   * Advbox: GET /content/users_list
   * DataTables — colunas: name, role, goal, financial, created_at
   * Params: sEcho, iColumns=5, sColumns=name,role,goal,financial,created_at
   *         iDisplayStart, iDisplayLength, mDataProp_0-4, sSearch_0-4
   *         bRegex_0-4, bSearchable_0-4, bSortable_0-4
   *         sSearch, bRegex, iSortCol_0, sSortDir_0=asc, iSortingCols=1
   *         _token, report=active, role=, search=
   */
  @Get('usuarios/datatable')
  @ApiOperation({ summary: 'Lista usuários — formato DataTables (compatível Advbox)' })
  getUsuariosDatatable(@Query() query: any, @CurrentUser() user: any) {
    return { sEcho: query.sEcho, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] };
  }

  /**
   * POST /api/v1/configuracoes/usuarios/convidar
   * Convida usuário para o escritório
   * Body: name, email, role, goal (meta mensal), can_access_financial (bool)
   */
  @Post('usuarios/convidar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Convida usuário para o escritório' })
  convidarUsuario(@Body() body: any, @CurrentUser() user: any) {
    return { message: 'Convite enviado', email: body.email };
  }

  @Get('usuarios/:id')
  @ApiOperation({ summary: 'Detalhe do usuário' })
  getUsuario(@Param('id') id: string, @CurrentUser() user: any) {
    return { id };
  }

  @Patch('usuarios/:id')
  @ApiOperation({ summary: 'Atualiza usuário (role, meta, permissões)' })
  updateUsuario(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return { id, body };
  }

  @Delete('usuarios/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove usuário do escritório' })
  removeUsuario(@Param('id') id: string, @CurrentUser() user: any) {
    return { message: 'Usuário removido', id };
  }

  // ── Times/Equipes ──────────────────────────────────────────────────────────

  /**
   * GET /api/v1/configuracoes/squads
   * Advbox: GET /content/squads
   * DataTables — colunas: name, role, created_at
   * Params: sEcho, iColumns=3, sColumns=name,role,created_at
   *         _token, report=active, search
   */
  @Get('squads')
  @ApiOperation({ summary: 'Lista times/equipes' })
  @ApiQuery({ name: 'report', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'search', required: false })
  getSquads(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Squads', query };
  }

  /**
   * GET /api/v1/configuracoes/squads/datatable
   * Advbox: GET /content/squads
   * Params: sEcho, iColumns=3, sColumns=name,role,created_at
   *         iDisplayStart=0, iDisplayLength=50, mDataProp_0-2
   *         sSearch, bRegex, iSortCol_0, sSortDir_0=asc, iSortingCols=1
   *         _token, report=active, search
   */
  @Get('squads/datatable')
  @ApiOperation({ summary: 'Lista squads — formato DataTables (compatível Advbox)' })
  getSquadsDatatable(@Query() query: any, @CurrentUser() user: any) {
    return { sEcho: query.sEcho, iTotalRecords: 0, iTotalDisplayRecords: 0, aaData: [] };
  }

  @Post('squads')
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria time/equipe' })
  createSquad(@Body() body: any, @CurrentUser() user: any) {
    return { message: 'Squad criado', body };
  }

  @Patch('squads/:id')
  @ApiOperation({ summary: 'Atualiza squad' })
  updateSquad(@Param('id') id: string, @Body() body: any) {
    return { id, body };
  }

  @Delete('squads/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove squad' })
  removeSquad(@Param('id') id: string) {
    return { message: 'Squad removido', id };
  }

  // ── Configurações do Escritório ───────────────────────────────────────────

  /**
   * GET /api/v1/configuracoes/escritorio
   * Dados do escritório: nome, logo, CNPJ, endereço, plano
   */
  @Get('escritorio')
  @ApiOperation({ summary: 'Dados do escritório' })
  getEscritorio(@CurrentUser() user: any) {
    return { officeId: user.officeId };
  }

  @Patch('escritorio')
  @ApiOperation({ summary: 'Atualiza dados do escritório' })
  updateEscritorio(@Body() body: any, @CurrentUser() user: any) {
    return { message: 'Escritório atualizado', body };
  }

  /** GET /api/v1/configuracoes/plano — Dados do plano e assinatura */
  @Get('plano')
  @ApiOperation({ summary: 'Plano atual e assinatura' })
  getPlano(@CurrentUser() user: any) {
    return { plan: 'PRO', status: 'ACTIVE', officeId: user.officeId };
  }

  /** GET /api/v1/configuracoes/integrações — Lista integrações ativas */
  @Get('integracoes')
  @ApiOperation({ summary: 'Integrações ativas (WhatsApp, Google, etc.)' })
  getIntegracoes(@CurrentUser() user: any) {
    return { integrations: [] };
  }

  /** PATCH /api/v1/configuracoes/integracoes/:name — Configura integração */
  @Patch('integracoes/:name')
  @ApiOperation({ summary: 'Configura integração específica' })
  updateIntegracao(@Param('name') name: string, @Body() body: any) {
    return { name, body };
  }

  /** GET /api/v1/configuracoes/webhooks — Webhooks configurados */
  @Get('webhooks')
  @ApiOperation({ summary: 'Lista webhooks configurados' })
  getWebhooks(@CurrentUser() user: any) {
    return { webhooks: [] };
  }

  /**
   * POST /api/v1/configuracoes/webhooks
   * Body: url, events[], secret
   */
  @Post('webhooks')
  @HttpCode(201)
  @ApiOperation({ summary: 'Registra novo webhook' })
  createWebhook(@Body() body: any, @CurrentUser() user: any) {
    return { id: 'uuid', secret: 'whsec_...', body };
  }

  @Delete('webhooks/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove webhook' })
  removeWebhook(@Param('id') id: string) {
    return { message: 'Webhook removido', id };
  }
}
