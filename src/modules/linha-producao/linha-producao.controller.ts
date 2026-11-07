import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis, PermiteParceiro } from '../../common/decorators/perfis.decorator';
import { PERFIS, PERFIS_GESTAO, PERFIS_INTERNOS } from '../../common/perfis';
import { LinhaProducaoService } from './linha-producao.service';

@ApiTags('🏭 Linha de produção')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('linhas')
export class LinhaProducaoController {
  constructor(private readonly svc: LinhaProducaoService) {}

  // ── Modelos ──
  @Post('modelos/instalar-padrao')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Instala os modelos padrão das áreas (não sobrescreve modelos editados)' })
  instalarPadrao(@CurrentUser() user: any) {
    return this.svc.instalarPadrao(user.officeId);
  }

  @Get('modelos')
  @Perfis(...PERFIS_INTERNOS)
  listarModelos(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.listarModelos(user.officeId, query);
  }

  @Get('modelos/:id')
  @Perfis(...PERFIS_INTERNOS)
  obterModelo(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.obterModelo(user.officeId, id);
  }

  @Post('modelos')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Cria um modelo de linha de produção' })
  criarModelo(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.criarModelo(user.officeId, body);
  }

  @Patch('modelos/:id')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Edita um modelo (alterar etapas sobe a versão)' })
  atualizarModelo(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.atualizarModelo(user.officeId, id, body);
  }

  // ── Linha no processo ──
  @Post('processos/:processoId')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Inicia a linha de produção de um processo a partir de um modelo' })
  iniciar(@Param('processoId') processoId: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.iniciar(user.officeId, processoId, body, user);
  }

  @Get('processos/:processoId')
  @PermiteParceiro()
  @ApiOperation({ summary: 'Linha(s) de produção do processo, com etapa atual e progresso' })
  doProcesso(@Param('processoId') processoId: string, @CurrentUser() user: any) {
    return this.svc.doProcesso(user.officeId, processoId, user);
  }

  @Post(':linhaId/cancelar')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  cancelar(@Param('linhaId') linhaId: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.cancelarLinha(user.officeId, linhaId, body);
  }

  // ── Etapas ──
  @Post('etapas/:id/checklist')
  @HttpCode(200)
  @PermiteParceiro()
  @ApiOperation({ summary: 'Marca ou desmarca um item do checklist da etapa' })
  marcarItem(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.marcarItem(user.officeId, id, body, user);
  }

  @Post('etapas/:id/concluir')
  @HttpCode(200)
  @PermiteParceiro()
  @ApiOperation({ summary: 'Conclui a etapa (exige os itens obrigatórios) e abre a próxima' })
  concluir(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.concluir(user.officeId, id, body, user);
  }

  @Post('etapas/:id/pular')
  @HttpCode(200)
  @ApiOperation({ summary: 'Pula uma etapa opcional, com motivo' })
  pular(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.pular(user.officeId, id, body, user);
  }

  @Patch('etapas/:id')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Troca o responsável e/ou o prazo da etapa' })
  reatribuir(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.reatribuir(user.officeId, id, body);
  }

  // ── Painéis ──
  @Get('minhas')
  @PermiteParceiro()
  @ApiOperation({ summary: 'Minhas etapas em andamento' })
  minhas(@CurrentUser() user: any) {
    return this.svc.minhas(user.officeId, user);
  }

  @Post('paradas/alertar')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Dispara agora o alerta de etapas paradas (o mesmo das 8h)' })
  alertarAgora(@CurrentUser() user: any) {
    return this.svc.alertarParadas(user.officeId);
  }

  @Get('paradas')
  @PermiteParceiro()
  @ApiOperation({ summary: 'Casos parados: etapas com prazo vencido' })
  paradas(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.paradas(user.officeId, user, query);
  }
}
