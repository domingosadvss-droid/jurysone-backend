import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO, PERFIS_INTERNOS } from '../../common/perfis';
import { AtendimentoIaService } from './atendimento-ia.service';

/** Atendimento automático do WhatsApp: liga/desliga (gestão) e controle por conversa */
@ApiTags('🤖 Atendimento automático (WhatsApp)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('atendimento-ia')
export class AtendimentoIaController {
  constructor(private readonly svc: AtendimentoIaService) {}

  /** Ajustes do escritório + se a IA está ligada no número do meu login */
  @Get('config')
  config(@CurrentUser() user: any) {
    return this.svc.configDoUsuario(user);
  }

  /** { ativo? } no MEU número; { apenasNovosContatos?, esperaSegundos?, silencioAposHumanoHoras? } só gestão */
  @Patch('config')
  @Perfis(...PERFIS_INTERNOS)
  salvar(@CurrentUser() user: any, @Body() dto: any) {
    return this.svc.salvarConfig(user, dto);
  }

  /** { status: 'AUTO' | 'PAUSADA' | null } — ligar, pausar ou devolver à regra geral nesta conversa */
  @Post('conversas/:id')
  @Perfis(...PERFIS_INTERNOS)
  async naConversa(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const status = dto?.status === undefined || dto?.status === '' ? null : dto.status;
    try { return await this.svc.definirNaConversa(user, id, status); }
    catch (e: any) {
      if (e?.status === 404) throw e;
      throw new BadRequestException(e?.message ?? 'Não foi possível.');
    }
  }

  /** Testes: processa a conversa agora, sem esperar (fora de produção ou em modo simulado) */
  @Post('conversas/:id/responder')
  @Perfis(...PERFIS_GESTAO)
  async responderAgora(@CurrentUser() user: any, @Param('id') id: string) {
    if (process.env.NODE_ENV === 'production' && process.env.IA_ATENDIMENTO_SIMULADO !== 'true') throw new NotFoundException();
    return this.svc.responderAgora(user, id);
  }
}
