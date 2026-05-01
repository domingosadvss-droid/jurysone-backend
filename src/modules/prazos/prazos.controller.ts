import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrazosService } from './prazos.service';

@ApiTags('Prazos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('prazos')
export class PrazosController {
  constructor(private readonly svc: PrazosService) {}

  /** GET /api/prazos — lista prazos do escritório (paginado) */
  @Get()
  @ApiOperation({ summary: 'Lista prazos com filtros e paginação' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'processo_id', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll({
      escritorioId: user.officeId,
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 20,
      processoId: query.processo_id,
    });
  }

  /** GET /api/prazos/hoje — prazos vencendo hoje */
  @Get('hoje')
  @ApiOperation({ summary: 'Prazos vencendo hoje' })
  findHoje(@CurrentUser() user: any) {
    return this.svc.findHoje(user.officeId);
  }

  /** GET /api/prazos/semana — prazos nos próximos 7 dias */
  @Get('semana')
  @ApiOperation({ summary: 'Prazos vencendo nos próximos 7 dias' })
  findSemana(@CurrentUser() user: any) {
    return this.svc.findProximos(user.officeId, 7);
  }

  /** GET /api/prazos/atrasados — prazos vencidos */
  @Get('atrasados')
  @ApiOperation({ summary: 'Prazos já vencidos' })
  findAtrasados(@CurrentUser() user: any) {
    return this.svc.findAtrasados(user.officeId);
  }

  /** GET /api/prazos/urgentes/count — contadores de urgência */
  @Get('urgentes/count')
  @ApiOperation({ summary: 'Contador de prazos urgentes (hoje / amanhã / semana)' })
  countUrgentes(@CurrentUser() user: any) {
    return this.svc.countUrgentes(user.officeId);
  }

  /**
   * POST /api/prazos/calcular — calcula data de vencimento sem salvar
   * Body: { dataPublicacao, diasPrazo, tipoPrazo?: 'util'|'corrido'|'fatal' }
   */
  @Post('calcular')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula data de vencimento (sem persistir)' })
  calcular(@Body() body: any) {
    return this.svc.calcular(body);
  }

  /** GET /api/prazos/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /** POST /api/prazos — cria prazo manual */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria prazo processual' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create({ ...body, escritorioId: user.officeId });
  }

  /** PATCH /api/prazos/:id — atualiza prazo */
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body);
  }

  /** PATCH /api/prazos/:id/status — atualiza status (cumprido / suspenso / etc.) */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Atualiza status do prazo' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.svc.update(id, { status });
  }

  /** DELETE /api/prazos/:id — remove prazo (soft delete) */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
