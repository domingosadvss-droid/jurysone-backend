/**
 * JURYSONE — Relatórios Controller
 * Advbox: GET /content/reports
 */
import { Controller, Get, Post, Param, Query, UseGuards, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('📊 Relatórios')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('relatorios')
export class RelatoriosController {
  /**
   * GET /api/v1/relatorios
   * Advbox: GET /content/reports
   * Lista relatórios disponíveis
   */
  @Get()
  @ApiOperation({ summary: 'Lista tipos de relatórios disponíveis' })
  findAll(@CurrentUser() user: any) {
    return {
      reports: [
        { id: 'processos', name: 'Processos', description: 'Relatório de processos por período' },
        { id: 'financeiro', name: 'Financeiro', description: 'DRE, fluxo de caixa, honorários' },
        { id: 'tarefas', name: 'Tarefas', description: 'Performance e produtividade' },
        { id: 'clientes', name: 'Clientes', description: 'Base de clientes e CRM' },
        { id: 'prazos', name: 'Prazos', description: 'Controle de prazos processuais' },
        { id: 'honorarios', name: 'Honorários', description: 'Honorários por processo e cliente' },
        { id: 'usuarios', name: 'Usuários', description: 'Performance por usuário (taskscore)' },
      ]
    };
  }

  /**
   * POST /api/v1/relatorios/gerar
   * Gera relatório assíncrono (BullMQ job)
   * Body: type, format (pdf|xlsx|csv), filters{}, period
   * Response: { job_id, status: 'queued' }
   */
  @Post('gerar')
  @HttpCode(202)
  @ApiOperation({ summary: 'Gera relatório assíncrono (PDF/Excel)' })
  gerar(@Body() body: any, @CurrentUser() user: any) {
    return { job_id: 'uuid-job', status: 'queued', message: 'Relatório em geração, aguarde...' };
  }

  /**
   * GET /api/v1/relatorios/job/:jobId
   * Verifica status do job de geração
   * Response: { status: queued|processing|done|failed, download_url? }
   */
  @Get('job/:jobId')
  @ApiOperation({ summary: 'Verifica status do relatório em geração' })
  getJobStatus(@Param('jobId') jobId: string, @CurrentUser() user: any) {
    return { jobId, status: 'done', download_url: `https://cdn.jurysone.com/reports/${jobId}.pdf` };
  }

  /** GET /api/v1/relatorios/processos — Relatório de processos */
  @Get('processos')
  @ApiOperation({ summary: 'Relatório de processos' })
  @ApiQuery({ name: 'start_date', required: false })
  @ApiQuery({ name: 'end_date', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'tribunal', required: false })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'pdf', 'xlsx'] })
  getProcessos(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Relatório processos', query };
  }

  /** GET /api/v1/relatorios/financeiro — Relatório financeiro */
  @Get('financeiro')
  @ApiOperation({ summary: 'Relatório financeiro' })
  @ApiQuery({ name: 'start_date', required: false })
  @ApiQuery({ name: 'end_date', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'format', required: false })
  getFinanceiro(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Relatório financeiro', query };
  }

  /** GET /api/v1/relatorios/tarefas — Relatório de tarefas (Taskscore) */
  @Get('tarefas')
  @ApiOperation({ summary: 'Relatório de tarefas e performance (Taskscore)' })
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'period', required: false, enum: ['month', 'quarter', 'year'] })
  @ApiQuery({ name: 'format', required: false })
  getTarefas(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Relatório tarefas', query };
  }

  /** GET /api/v1/relatorios/prazos — Relatório de prazos */
  @Get('prazos')
  @ApiOperation({ summary: 'Relatório de prazos processuais' })
  getPrazos(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Relatório prazos', query };
  }
}
