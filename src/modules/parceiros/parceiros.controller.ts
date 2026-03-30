/**
 * JURYSONE — ParceirosController
 * REST API para gestão de parceiros e correspondentes
 */
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParceirosService } from './parceiros.service';

@ApiTags('🤝 Parceiros')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('parceiros')
export class ParceirosController {
  constructor(private readonly svc: ParceirosService) {}

  /** GET /api/v1/parceiros */
  @Get()
  @ApiOperation({ summary: 'Lista parceiros e correspondentes do escritório' })
  @ApiQuery({ name: 'search',      required: false })
  @ApiQuery({ name: 'areaAtuacao', required: false })
  @ApiQuery({ name: 'estado',      required: false })
  @ApiQuery({ name: 'ativo',       required: false })
  @ApiQuery({ name: 'page',        required: false })
  @ApiQuery({ name: 'per_page',    required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll(query, user.officeId);
  }

  /** GET /api/v1/parceiros/estatisticas */
  @Get('estatisticas')
  @ApiOperation({ summary: 'Estatísticas de parceiros' })
  getEstatisticas(@CurrentUser() user: any) {
    return this.svc.getEstatisticas(user.officeId);
  }

  /** GET /api/v1/parceiros/:id */
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do parceiro' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  /** POST /api/v1/parceiros */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cadastra novo parceiro/correspondente' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create(body, user.id, user.officeId);
  }

  /** PATCH /api/v1/parceiros/:id */
  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza dados do parceiro' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, body, user.officeId);
  }

  /** DELETE /api/v1/parceiros/:id */
  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove parceiro' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }
}
