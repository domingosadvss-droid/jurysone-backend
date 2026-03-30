/**
 * JURYSONE — CRM Controller
 *
 * Endpoints reais capturados do Advbox:
 *   GET  /crm                 → página CRM
 *   GET  /content/crm         → conteúdo AJAX
 *   POST /crm-performance     → métricas de performance (funil, conversão)
 *   POST /board-crm           → board Kanban com estágios
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CrmService } from './crm.service';

@ApiTags('📊 CRM')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('crm')
export class CrmController {
  constructor(private readonly svc: CrmService) {}

  /**
   * GET /api/v1/crm
   * Advbox: GET /content/crm
   * Lista oportunidades/leads do CRM
   */
  @Get()
  @ApiOperation({ summary: 'Lista oportunidades/leads CRM' })
  @ApiQuery({ name: 'stage', required: false })
  @ApiQuery({ name: 'responsible_id', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll(query, user.officeId);
  }

  /**
   * GET /api/v1/crm/board
   * Advbox: POST /board-crm
   * Board Kanban com estágios do funil
   * Response: { stages: [{ id, name, color, opportunities: [...] }] }
   */
  @Get('board')
  @ApiOperation({ summary: 'Board Kanban do CRM com estágios' })
  getBoard(@CurrentUser() user: any) {
    return this.svc.getBoard(user.officeId);
  }

  /**
   * GET /api/v1/crm/performance
   * Advbox: POST /crm-performance
   * Métricas: taxa de conversão, tempo médio no funil, valor potencial
   * Query: period (month|quarter|year), responsible_id
   */
  @Get('performance')
  @ApiOperation({ summary: 'Métricas de performance do CRM' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'quarter', 'year'] })
  @ApiQuery({ name: 'responsible_id', required: false })
  getPerformance(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getPerformance(query, user.officeId);
  }

  /**
   * GET /api/v1/crm/stages
   * Lista estágios do funil de vendas
   */
  @Get('stages')
  @ApiOperation({ summary: 'Estágios do funil CRM' })
  getStages(@CurrentUser() user: any) {
    return this.svc.getStages(user.officeId);
  }

  /**
   * POST /api/v1/crm/stages
   * Cria novo estágio
   * Body: name, color, order, is_won (bool), is_lost (bool)
   */
  @Post('stages')
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria estágio no funil' })
  createStage(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.createStage(body, user.officeId);
  }

  /**
   * PATCH /api/v1/crm/stages/:id
   * Atualiza estágio (nome, cor, ordem)
   */
  @Patch('stages/:id')
  @ApiOperation({ summary: 'Atualiza estágio do funil' })
  updateStage(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.updateStage(id, body, user.officeId);
  }

  /**
   * GET /api/v1/crm/:id
   * Detalhe da oportunidade
   */
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da oportunidade CRM' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  /**
   * POST /api/v1/crm
   * Cria oportunidade/lead
   * Body: title, contact_id, value, stage_id, responsible_id,
   *       expected_close_date, description, source, tags
   */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria oportunidade/lead no CRM' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create(body, user.id, user.officeId);
  }

  /**
   * PATCH /api/v1/crm/:id
   * Atualiza oportunidade (campos, estágio)
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza oportunidade' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, body, user.officeId);
  }

  /**
   * PATCH /api/v1/crm/:id/stage
   * Move oportunidade de estágio (drag & drop do Kanban)
   * Body: stage_id
   */
  @Patch(':id/stage')
  @HttpCode(200)
  @ApiOperation({ summary: 'Move oportunidade para outro estágio (Kanban)' })
  moveStage(@Param('id') id: string, @Body('stage_id') stageId: string, @CurrentUser() user: any) {
    return this.svc.moveStage(id, stageId, user.officeId);
  }

  /**
   * POST /api/v1/crm/:id/won
   * Marca oportunidade como ganha → cria processo automaticamente
   */
  @Post(':id/won')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca oportunidade como GANHA — cria processo' })
  markWon(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.markWon(id, body, user.officeId);
  }

  /**
   * POST /api/v1/crm/:id/lost
   * Marca oportunidade como perdida
   * Body: lost_reason
   */
  @Post(':id/lost')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca oportunidade como PERDIDA' })
  markLost(@Param('id') id: string, @Body('lost_reason') reason: string, @CurrentUser() user: any) {
    return this.svc.markLost(id, reason, user.officeId);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove oportunidade' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }
}
