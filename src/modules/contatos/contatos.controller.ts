/**
 * JURYSONE — Contatos Controller (CRM Jurídico)
 *
 * Endpoints reais capturados do Advbox:
 *   GET  /contacts               → página contatos
 *   GET  /content/contacts       → conteúdo AJAX
 *   GET  /crm                    → página CRM
 *   GET  /content/crm            → conteúdo AJAX CRM
 *   POST /crm-performance        → métricas de performance CRM
 *   POST /board-crm              → board Kanban CRM
 *   POST /pushes                 → notificações push
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ContatosService } from './contatos.service';

@ApiTags('👥 Contatos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('contatos')
export class ContatosController {
  constructor(private readonly svc: ContatosService) {}

  /**
   * GET /api/v1/contatos
   * Advbox: GET /content/contacts
   * Query: search, type (PF|PJ), status, page, per_page,
   *        order, sort, sEcho (DataTables)
   */
  @Get()
  @ApiOperation({ summary: 'Lista contatos/clientes' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'type', required: false, enum: ['PF', 'PJ'] })
  @ApiQuery({ name: 'status', required: false, enum: ['ativo', 'inativo'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'per_page', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll(query, user.officeId);
  }

  /**
   * GET /api/v1/contatos/datatable
   * Compatibilidade DataTables Advbox
   */
  @Get('datatable')
  @ApiOperation({ summary: 'Lista contatos — formato DataTables' })
  findDatatable(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findDatatable(query, user.officeId);
  }

  /**
   * GET /api/v1/contatos/:id
   * Detalhe do contato com processos, histórico financeiro, tarefas
   */
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe completo do contato' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  /**
   * POST /api/v1/contatos
   * Body: name, type (PF|PJ), cpf_cnpj, email, phone,
   *       address, responsible_id, notes, tags
   */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria novo contato' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create(body, user.officeId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza contato' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, body, user.officeId);
  }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove contato (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }

  /**
   * GET /api/v1/contatos/:id/processos
   * Processos vinculados ao contato
   */
  @Get(':id/processos')
  @ApiOperation({ summary: 'Processos do contato' })
  getProcessos(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getProcessos(id, user.officeId);
  }

  /**
   * GET /api/v1/contatos/:id/financeiro
   * Histórico financeiro do contato
   */
  @Get(':id/financeiro')
  @ApiOperation({ summary: 'Financeiro do contato' })
  getFinanceiro(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getFinanceiro(id, user.officeId);
  }

  /**
   * GET /api/v1/contatos/:id/tarefas
   */
  @Get(':id/tarefas')
  @ApiOperation({ summary: 'Tarefas do contato' })
  getTarefas(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getTarefas(id, user.officeId);
  }
}
