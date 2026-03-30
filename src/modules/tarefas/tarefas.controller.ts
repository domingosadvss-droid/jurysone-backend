/**
 * JURYSONE — Tarefas Controller
 *
 * Endpoints reais capturados do Advbox:
 *   GET /content/posts  → lista tarefas/atividades (painel + módulo)
 *
 * Query params reais do Advbox /content/posts:
 *   _token, search, column=start, start_from, start_until,
 *   tasks_id, page=posts, sender=0, completed=pendentes,
 *   steps_id, priority[]=1,2,3, future=1, sEcho=1,
 *   report_url=report/tasks, _dashboard_unique=1,
 *   iDisplayStart=1, order=start, sort=asc,
 *   limit_deadline=100, limit_publication=100,
 *   limit_unread=100, limit_urgent=100, limit_important=100, limit_others=100
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TarefasService } from './tarefas.service';

@ApiTags('✅ Tarefas')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('tarefas')
export class TarefasController {
  constructor(private readonly svc: TarefasService) {}

  /**
   * GET /api/v1/tarefas
   * Advbox: GET /content/posts (com parâmetros completos)
   * Query: search, column, start_from, start_until, tasks_id,
   *        sender, completed (pendentes|concluidas|todas),
   *        steps_id, priority (1=baixa|2=media|3=alta|4=urgente),
   *        future, order, sort, iDisplayStart, page, per_page,
   *        limit_deadline, limit_urgent, limit_important, limit_others
   */
  @Get()
  @ApiOperation({ summary: 'Lista tarefas/atividades' })
  @ApiQuery({ name: 'completed', required: false, enum: ['pendentes', 'concluidas', 'todas'] })
  @ApiQuery({ name: 'priority', required: false, description: 'Array: 1=baixa, 2=media, 3=alta, 4=urgente' })
  @ApiQuery({ name: 'start_from', required: false })
  @ApiQuery({ name: 'start_until', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'assignee_id', required: false })
  @ApiQuery({ name: 'process_id', required: false })
  @ApiQuery({ name: 'future', required: false, description: '1 = incluir futuras' })
  @ApiQuery({ name: 'order', required: false, enum: ['start', 'deadline', 'priority', 'created_at'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'per_page', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any): Promise<any> {
    return this.svc.findAll(query, user.officeId);
  }

  /**
   * GET /api/v1/tarefas/datatable
   * Compatibilidade total com DataTables do Advbox
   * Inclui todos os parâmetros originais: sEcho, iDisplayStart,
   * limit_deadline, limit_publication, limit_unread, limit_urgent,
   * limit_important, limit_others, _dashboard_unique, report_url
   */
  @Get('datatable')
  @ApiOperation({ summary: 'Lista tarefas — formato DataTables (compatível Advbox)' })
  findDatatable(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findDatatable(query, user.officeId);
  }

  /**
   * GET /api/v1/tarefas/kanban
   * Board Kanban de tarefas (pendente → em andamento → concluída)
   */
  @Get('kanban')
  @ApiOperation({ summary: 'Board Kanban de tarefas' })
  getKanban(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getKanban(query, user.officeId);
  }

  /**
   * GET /api/v1/tarefas/pushes
   * Advbox: POST /pushes — notificações urgentes para o painel
   * Retorna tarefas vencidas, prazos próximos, intimações
   */
  @Get('pushes')
  @ApiOperation({ summary: 'Notificações push — tarefas urgentes e prazos vencidos' })
  getPushes(@CurrentUser() user: any) {
    return this.svc.getPushes(user.id, user.officeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da tarefa' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  /**
   * POST /api/v1/tarefas
   * Body: title, description, due_date, start_date,
   *       priority (1-4), assignee_id, process_id, client_id,
   *       steps_id (etapa do workflow), tags, estimated_hours
   */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria tarefa' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create(body, user.id, user.officeId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza tarefa' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, body, user.officeId);
  }

  /**
   * POST /api/v1/tarefas/:id/concluir
   * Marca tarefa como concluída
   * Body: completed_at (opcional), notes
   */
  @Post(':id/concluir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Conclui tarefa' })
  concluir(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.concluir(id, body, user.id, user.officeId);
  }

  /**
   * POST /api/v1/tarefas/:id/reabrir
   * Reabre tarefa concluída
   */
  @Post(':id/reabrir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reabre tarefa concluída' })
  reabrir(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.reabrir(id, user.officeId);
  }

  /**
   * POST /api/v1/tarefas/:id/comentarios
   * Adiciona comentário na tarefa
   * Body: comment
   */
  @Post(':id/comentarios')
  @HttpCode(201)
  @ApiOperation({ summary: 'Adiciona comentário na tarefa' })
  addComentario(@Param('id') id: string, @Body('comment') comment: string, @CurrentUser() user: any) {
    return this.svc.addComentario(id, comment, user.id, user.officeId);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove tarefa' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }
}
