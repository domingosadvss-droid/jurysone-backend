import {
  Controller, Get, Post, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PeticionamentoService } from './peticionamento.service';

@ApiTags('Peticionamento Eletrônico')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('protocolos')
export class PeticionamentoController {
  constructor(private readonly svc: PeticionamentoService) {}

  /**
   * GET /api/protocolos — lista protocolos do escritório
   * Query: page, limit, status, tribunal, processo_id
   */
  @Get()
  @ApiOperation({ summary: 'Lista protocolos de petição' })
  @ApiQuery({ name: 'page',        required: false })
  @ApiQuery({ name: 'limit',       required: false })
  @ApiQuery({ name: 'status',      required: false, enum: ['pendente', 'enviado', 'protocolado', 'erro', 'requer_automacao'] })
  @ApiQuery({ name: 'tribunal',    required: false })
  @ApiQuery({ name: 'processo_id', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll(user.officeId, query);
  }

  /**
   * GET /api/protocolos/:id — detalhe de um protocolo
   */
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do protocolo' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findById(id, user.officeId);
  }

  /**
   * POST /api/protocolos — protocola nova petição
   * Body:
   *   processo_id  — UUID do processo (opcional)
   *   tribunal     — sigla (TJSP, TRF1, etc.)
   *   tipo_peticao — 'inicial' | 'intermediaria' | 'recurso' | etc.
   *   arquivo_url  — URL do PDF no Supabase Storage
   */
  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Protocola nova petição eletrônica',
    description:
      'Envia a petição ao tribunal via API PJe/PCP quando disponível. ' +
      'Para tribunais sem API (TJSP e-SAJ, PROJUDI), registra com status "requer_automacao".',
  })
  protocolar(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.protocolar(user, body);
  }

  /**
   * GET /api/protocolos/:id/comprovante — comprovante de protocolo
   */
  @Get(':id/comprovante')
  @ApiOperation({ summary: 'Comprovante do protocolo (disponível após confirmação)' })
  getComprovante(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.getComprovante(id, user.officeId);
  }

  /**
   * DELETE /api/protocolos/:id — remove protocolo (soft delete)
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Remove protocolo (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }
}
