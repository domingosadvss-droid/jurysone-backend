/**
 * JURYSONE — Modelos Controller
 * Advbox: GET /content/models
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('📄 Modelos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('modelos')
export class ModelosController {
  /**
   * GET /api/v1/modelos
   * Advbox: GET /content/models
   * Query: type (peticao|contrato|parecer|procuracao|outros), search, page
   */
  @Get()
  @ApiOperation({ summary: 'Lista modelos de documentos jurídicos' })
  @ApiQuery({ name: 'type', required: false, enum: ['peticao', 'contrato', 'parecer', 'procuracao', 'outros'] })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return { message: 'Modelos', query };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do modelo' })
  findOne(@Param('id') id: string) { return { id }; }

  /**
   * POST /api/v1/modelos
   * Body: name, type, content (HTML/DOCX base64), variables[], category
   */
  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria modelo de documento' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return { message: 'Modelo criado', body };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza modelo' })
  update(@Param('id') id: string, @Body() body: any) { return { id, body }; }

  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove modelo' })
  remove(@Param('id') id: string) { return { message: 'Removido', id }; }

  /**
   * POST /api/v1/modelos/:id/gerar
   * Gera documento preenchido com dados do processo/cliente
   * Body: process_id, client_id, custom_fields{}
   * Response: { download_url, filename }
   */
  @Post(':id/gerar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Gera documento a partir do modelo' })
  gerarDocumento(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return { message: 'Gerando documento...', id, body };
  }

  /**
   * POST /api/v1/modelos/:id/ai-fill
   * Preenche modelo com IA baseado nos dados do processo
   * Body: process_id
   */
  @Post(':id/ai-fill')
  @HttpCode(200)
  @ApiOperation({ summary: 'Preenche modelo com IA (GPT-4o)' })
  aiFill(@Param('id') id: string, @Body('process_id') processId: string, @CurrentUser() user: any) {
    return { message: 'Gerando com IA...', id, processId };
  }
}
