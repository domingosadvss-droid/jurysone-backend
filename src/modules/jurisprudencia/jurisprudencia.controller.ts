import {
  Controller, Get, Post, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JurisprudenciaService } from './jurisprudencia.service';

@ApiTags('⚖️ Jurisprudência')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('jurisprudencia')
export class JurisprudenciaController {
  constructor(private readonly svc: JurisprudenciaService) {}

  /**
   * GET /api/jurisprudencia/pesquisar
   * Pesquisa jurisprudência via DataJud + IA
   * Query: tese, tribunal?, area?, dataInicio?, dataFim?, pagina?
   */
  @Get('pesquisar')
  @ApiOperation({ summary: 'Pesquisa jurisprudência (DataJud + IA)' })
  pesquisar(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.pesquisar({
      tese:        query.tese       ?? query.q ?? '',
      tribunal:    query.tribunal,
      area:        query.area,
      dataInicio:  query.data_inicio ?? query.dataInicio,
      dataFim:     query.data_fim    ?? query.dataFim,
      pagina:      parseInt(query.pagina ?? '1', 10) || 1,
      officeId:    user.officeId,
    });
  }

  /**
   * GET /api/jurisprudencia/workspace/:processoId
   * Retorna o workspace completo de IA de um processo
   * (histórico de chats, análises, petições rascunho, ementas salvas)
   */
  @Get('workspace/:processoId')
  @ApiOperation({ summary: 'Workspace de IA por processo' })
  getWorkspace(@Param('processoId') processoId: string, @CurrentUser() user: any) {
    return this.svc.getWorkspace(processoId, user.officeId);
  }

  /**
   * GET /api/jurisprudencia/ementas
   * Lista ementas salvas do escritório (ou de um processo)
   * Query: processoId?, favoravel?
   */
  @Get('ementas')
  @ApiOperation({ summary: 'Lista ementas salvas' })
  listarEmentas(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.listarEmentas({
      officeId:   user.officeId,
      processoId: query.processo_id ?? query.processoId,
      favoravel:  query.favoravel !== undefined ? query.favoravel === 'true' : undefined,
    });
  }

  /**
   * POST /api/jurisprudencia/ementas
   * Salva ementa de jurisprudência (manualmente ou via pesquisa)
   */
  @Post('ementas')
  @HttpCode(201)
  @ApiOperation({ summary: 'Salva ementa de jurisprudência' })
  salvarEmenta(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.salvarEmenta({
      officeId:      user.officeId,
      userId:        user.id,
      processoId:    body.processoId     ?? body.processo_id,
      tribunal:      body.tribunal,
      numero:        body.numero,
      relator:       body.relator,
      dataJulgamento: body.dataJulgamento ?? body.data_julgamento,
      ementa:        body.ementa,
      favoravel:     body.favoravel,
      relevancia:    body.relevancia,
      tese:          body.tese,
    });
  }

  /**
   * DELETE /api/jurisprudencia/ementas/:id
   * Remove ementa salva
   */
  @Delete('ementas/:id')
  @ApiOperation({ summary: 'Remove ementa salva' })
  removerEmenta(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removerEmenta(id, user.officeId);
  }
}
