import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis, PermiteParceiro } from '../../common/decorators/perfis.decorator';
import { PERFIS, PERFIS_FINANCEIRO, PERFIS_GESTAO } from '../../common/perfis';
import { CotaParteService } from './cota-parte.service';

@ApiTags('🤝 Cota-parte e repasses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('cota-parte')
export class CotaParteController {
  constructor(private readonly svc: CotaParteService) {}

  // ── Configuração (alíquota de imposto) ──
  @Get('config')
  @Perfis(...PERFIS_FINANCEIRO)
  getConfig(@CurrentUser() user: any) {
    return this.svc.getAliquota(user.officeId);
  }

  @Put('config')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Define a alíquota fixa de imposto (%) usada no cálculo da cota-parte' })
  setConfig(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.setAliquota(user.officeId, body?.aliquotaImposto ?? body?.percentual);
  }

  // ── Regras papel × tipo de honorário ──
  @Get('regras')
  @Perfis(...PERFIS_FINANCEIRO)
  listarRegras(@CurrentUser() user: any) {
    return this.svc.listarRegras(user.officeId);
  }

  @Post('regras')
  @Perfis(PERFIS.ADMIN)
  criarRegra(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.criarRegra(user.officeId, body);
  }

  @Patch('regras/:id')
  @Perfis(PERFIS.ADMIN)
  atualizarRegra(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.atualizarRegra(user.officeId, id, body);
  }

  @Delete('regras/:id')
  @Perfis(PERFIS.ADMIN)
  removerRegra(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removerRegra(user.officeId, id);
  }

  // ── Papéis no processo ──
  @Get('processos/:processoId/participacoes')
  @Perfis(...PERFIS_GESTAO)
  listarParticipacoes(@Param('processoId') processoId: string, @CurrentUser() user: any) {
    return this.svc.listarParticipacoes(user.officeId, processoId);
  }

  @Post('processos/:processoId/participacoes')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Registra quem indicou ou participou do processo' })
  adicionarParticipacao(@Param('processoId') processoId: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.adicionarParticipacao(user.officeId, processoId, body);
  }

  @Delete('participacoes/:id')
  @Perfis(...PERFIS_GESTAO)
  removerParticipacao(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.removerParticipacao(user.officeId, id);
  }

  // ── Ficha financeira do processo ──
  @Get('processos/:processoId/ficha-financeira')
  @Perfis(...PERFIS_FINANCEIRO)
  @ApiOperation({ summary: 'Resumo financeiro do processo: contratado, recebido, a receber, atrasos, despesas e cotas' })
  ficha(@Param('processoId') processoId: string, @CurrentUser() user: any) {
    return this.svc.fichaFinanceira(user.officeId, processoId);
  }

  // ── Fechamentos e repasses ──
  @Get('previa')
  @Perfis(...PERFIS_FINANCEIRO)
  @ApiOperation({ summary: 'Prévia do fechamento: valores em aberto por beneficiário' })
  previa(@Query('ate') ate: string, @CurrentUser() user: any) {
    return this.svc.previa(user.officeId, ate);
  }

  @Get('fechamentos')
  @Perfis(...PERFIS_FINANCEIRO)
  listarFechamentos(@CurrentUser() user: any) {
    return this.svc.listarFechamentos(user.officeId);
  }

  @Post('fechamentos')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Fecha o período (manual) e congela os valores de repasse' })
  fechar(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.fechar(user.officeId, body?.ate, user.id);
  }

  @Get('fechamentos/:id')
  @Perfis(...PERFIS_FINANCEIRO)
  detalhe(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.detalheFechamento(user.officeId, id);
  }

  @Post('fechamentos/:id/repassar')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Marca como repassado o valor de um beneficiário, com comprovante' })
  repassar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.marcarRepassado(user.officeId, id, body);
  }

  // ── Visão do próprio associado ou parceiro ──
  @Get('minha')
  @Perfis(PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO, PERFIS.ASSOCIADO)
  @PermiteParceiro()
  @ApiOperation({ summary: 'Minha cota-parte: em apuração, disponível para repasse e já repassada' })
  minha(@CurrentUser() user: any) {
    return this.svc.minhaCota(user.officeId, user);
  }
}
