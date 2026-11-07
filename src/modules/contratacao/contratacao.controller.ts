import { Body, Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO } from '../../common/perfis';
import { ContratacaoService } from './contratacao.service';

@ApiTags('✍️ Contratação e assinatura')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Perfis(...PERFIS_GESTAO)
@Controller('contratacao')
export class ContratacaoController {
  constructor(private readonly svc: ContratacaoService) {}

  @Post('processos/:processoId/pacote')
  @ApiOperation({ summary: 'Gera contrato, procuração, termo de entrevista (e hipossuficiência) como rascunho na pasta do processo' })
  gerar(@Param('processoId') processoId: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.gerarPacote(user.officeId, processoId, body, user);
  }

  @Get('processos/:processoId/pacotes')
  listar(@Param('processoId') processoId: string, @CurrentUser() user: any) {
    return this.svc.listar(user.officeId, processoId);
  }

  @Post('pacotes/:id/enviar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envia o pacote revisado para assinatura e devolve o link do cliente' })
  enviar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.enviar(user.officeId, id, body);
  }

  @Post('pacotes/:id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.cancelar(user.officeId, id);
  }
}

/** Webhook público da plataforma de assinatura (validado por token) */
@ApiTags('✍️ Contratação e assinatura')
@Controller('contratacao/webhook')
export class ContratacaoWebhookController {
  constructor(private readonly svc: ContratacaoService) {}

  @Post(':provedor')
  @HttpCode(200)
  webhook(@Param('provedor') provedor: string, @Body() body: any, @Headers('x-jurysone-token') token?: string) {
    return this.svc.processarWebhook(provedor, body, token);
  }
}
