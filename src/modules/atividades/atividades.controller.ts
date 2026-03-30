/**
 * JURYSONE — Atividades Controller
 * Advbox: GET /content/activities
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('📋 Atividades')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('atividades')
export class AtividadesController {
  /**
   * GET /api/v1/atividades
   * Advbox: GET /content/activities
   * Registros de atividades dos usuários no escritório
   * Query: user_id, type, process_id, start_date, end_date, page
   */
  @Get()
  @ApiOperation({ summary: 'Lista atividades do escritório' })
  @ApiQuery({ name: 'user_id', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'process_id', required: false })
  @ApiQuery({ name: 'start_date', required: false })
  @ApiQuery({ name: 'end_date', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Atividades', query, officeId: user.officeId };
  }

  /** POST /api/v1/atividades — Registra atividade manual */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Registra atividade (horas, reunião, ligação)' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return { message: 'Atividade criada', body };
  }
}
