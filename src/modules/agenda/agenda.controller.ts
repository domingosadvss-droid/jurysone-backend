/**
 * JURYSONE — Agenda Controller
 * FIX B-004: rotas estáticas SEMPRE antes de @Get(':id')
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AgendaService } from './agenda.service';

@ApiTags('📅 Agenda')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('agenda')
export class AgendaController {
  constructor(private readonly svc: AgendaService) {}

  // ── Rotas ESTÁTICAS (devem vir antes de :id) ──────────────────────────────

  /**
   * GET /api/v1/agenda
   * Lista eventos com filtros de data, tipo e view
   */
  @Get()
  @ApiOperation({ summary: 'Lista eventos da agenda' })
  @ApiQuery({ name: 'start',   required: false })
  @ApiQuery({ name: 'end',     required: false })
  @ApiQuery({ name: 'type',    required: false, enum: ['PRAZO','AUDIENCIA','REUNIAO','TAREFA','OUTRO'] })
  @ApiQuery({ name: 'view',    required: false, enum: ['month','week','day','list'] })
  @ApiQuery({ name: 'search',  required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll(query, user.officeId);
  }

  /** GET /api/v1/agenda/hoje */
  @Get('hoje')
  @ApiOperation({ summary: 'Eventos de hoje' })
  getHoje(@CurrentUser() user: any) {
    return this.svc.getHoje(user.officeId);
  }

  /** GET /api/v1/agenda/semana */
  @Get('semana')
  @ApiOperation({ summary: 'Próximos 7 dias' })
  getSemana(@CurrentUser() user: any) {
    return this.svc.getSemana(user.officeId);
  }

  /** GET /api/v1/agenda/prazos */
  @Get('prazos')
  @ApiOperation({ summary: 'Prazos processuais' })
  @ApiQuery({ name: 'days_ahead', required: false })
  getPrazos(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.getPrazos(query, user.officeId);
  }

  // ── Google Calendar ───────────────────────────────────────────────────────

  /** GET /api/v1/agenda/google/auth-url — URL para OAuth com Google */
  @Get('google/auth-url')
  @ApiOperation({ summary: 'Retorna URL de autorização OAuth 2.0 do Google Calendar' })
  getGoogleAuthUrl() {
    return this.svc.getGoogleAuthUrl();
  }

  /** GET /api/v1/agenda/google/callback?code=... — Troca code OAuth por tokens */
  @Get('google/callback')
  @ApiOperation({ summary: 'Callback OAuth Google — retorna access_token e refresh_token' })
  googleCallback(@Query('code') code: string) {
    return this.svc.googleOAuthCallback(code);
  }

  /** GET /api/v1/agenda/google/calendarios — Lista calendários do usuário */
  @Get('google/calendarios')
  @ApiOperation({ summary: 'Lista calendários disponíveis na conta Google do usuário' })
  @ApiQuery({ name: 'token', required: true, description: 'Google access_token' })
  listCalendarios(@Query('token') token: string) {
    return this.svc.listGoogleCalendarios(token);
  }

  /**
   * GET /api/v1/agenda/export/ical
   * FIX B-004: movido para ANTES de @Get(':id')
   * Exporta agenda no formato iCal RFC 5545 (.ics)
   */
  @Get('export/ical')
  @ApiOperation({ summary: 'Exporta agenda em formato iCal (.ics)' })
  async exportICal(
    @Query() query: any,
    @CurrentUser() user: any,
    @Res() res: Response,
  ) {
    const ical = await this.svc.exportICal(query, user.officeId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="jurysone-agenda.ics"');
    res.send(ical);
  }

  // ── Rotas DINÂMICAS (:id) — sempre após as estáticas ─────────────────────

  /** POST /api/v1/agenda */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria evento na agenda' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create(body, user.id, user.officeId);
  }

  /** POST /api/v1/agenda/sync/google — estática, antes de :id/concluir */
  @Post('sync/google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sincroniza com Google Calendar' })
  syncGoogle(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.syncGoogle(body, user.id);
  }

  /** GET /api/v1/agenda/:id */
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do evento' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  /** PATCH /api/v1/agenda/:id */
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza evento' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, body, user.officeId);
  }

  /** DELETE /api/v1/agenda/:id */
  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove evento' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }

  /** POST /api/v1/agenda/:id/concluir */
  @Post(':id/concluir')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca evento como concluído' })
  concluir(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.concluir(id, user.officeId);
  }
}
