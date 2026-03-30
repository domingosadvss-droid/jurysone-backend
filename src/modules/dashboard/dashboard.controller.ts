/**
 * JURYSONE — Dashboard Controller
 *
 * Endpoints reais capturados do Advbox:
 *   GET  /content/home   → conteúdo AJAX do painel
 *   POST /chart          → dados do gráfico (Taskscore mensal/diário)
 *   POST /overview       → resumo KPIs (tarefas, pontos, metas)
 *   POST /pushes         → notificações urgentes
 */
import { Controller, Get, Post, Query, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('🏠 Dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {

  /**
   * GET /api/v1/dashboard
   * Advbox: GET /content/home
   * Painel completo: KPIs, tarefas, agenda, compromissos
   */
  @Get()
  @ApiOperation({ summary: 'Dashboard completo do painel' })
  getHome(@CurrentUser() user: any) {
    return {
      user: user.name,
      kpis: {},
      tasks_pending: 0,
      deadlines_week: 0,
      month_revenue: 0,
    };
  }

  /**
   * GET /api/v1/dashboard/overview
   * Advbox: POST /overview
   * KPIs: tarefas concluídas, pontos, tarefas pendentes, alcance da meta
   * Query: period (month|day), user_id (opcional para admin)
   */
  @Get('overview')
  @ApiOperation({ summary: 'Overview KPIs (tarefas, pontos, meta)' })
  @ApiQuery({ name: 'period', required: false, enum: ['today', 'week', 'month'] })
  @ApiQuery({ name: 'user_id', required: false })
  getOverview(@Query() query: any, @CurrentUser() user: any) {
    return {
      tasks_completed: 0,
      points: 0,
      tasks_pending: 0,
      goal_reach: null,
      vs_last_period: { tasks: 0, points: 0 },
    };
  }

  /**
   * GET /api/v1/dashboard/chart
   * Advbox: POST /chart
   * Dados do gráfico Taskscore
   * Query: view (mensal|diario), user_id
   */
  @Get('chart')
  @ApiOperation({ summary: 'Dados do gráfico Taskscore' })
  @ApiQuery({ name: 'view', required: false, enum: ['mensal', 'diario'] })
  @ApiQuery({ name: 'user_id', required: false })
  getChart(@Query() query: any, @CurrentUser() user: any) {
    return {
      labels: [],
      datasets: [
        { label: 'Mês Atual', data: [] },
        { label: 'Mês Passado', data: [] },
        { label: 'Meta', data: [] },
      ],
    };
  }

  /**
   * GET /api/v1/dashboard/pushes
   * Advbox: POST /pushes
   * Notificações urgentes: prazos vencidos, intimações não lidas, tarefas atrasadas
   */
  @Get('pushes')
  @ApiOperation({ summary: 'Notificações urgentes do painel' })
  getPushes(@CurrentUser() user: any) {
    return {
      overdue_tasks: [],
      unread_intimacoes: 0,
      urgent_deadlines: [],
      financial_alerts: [],
    };
  }

  /**
   * GET /api/v1/dashboard/compromissos
   * Lista compromissos do dia (tarefas + agenda)
   * Query: date (YYYY-MM-DD, default hoje)
   */
  @Get('compromissos')
  @ApiOperation({ summary: 'Compromissos do dia (tarefas + agenda)' })
  @ApiQuery({ name: 'date', required: false })
  getCompromissos(@Query() query: any, @CurrentUser() user: any) {
    return { date: query.date || new Date().toISOString().split('T')[0], events: [], tasks: [] };
  }

  /**
   * GET /api/v1/dashboard/taskscore
   * Advbox: gráfico Taskscore (pontuação de produtividade)
   * Ranking da equipe por pontos no período
   */
  @Get('taskscore')
  @ApiOperation({ summary: 'Ranking Taskscore da equipe' })
  @ApiQuery({ name: 'period', required: false, enum: ['week', 'month', 'quarter'] })
  getTaskscore(@Query() query: any, @CurrentUser() user: any) {
    return { ranking: [], period: query.period || 'month' };
  }

  /**
   * GET /api/v1/dashboard/atividades-concluidas
   * Atividades concluídas no mês (widget do painel)
   */
  @Get('atividades-concluidas')
  @ApiOperation({ summary: 'Atividades concluídas no período' })
  getAtividadesConcluidas(@CurrentUser() user: any) {
    return { count: 0, items: [] };
  }
}
