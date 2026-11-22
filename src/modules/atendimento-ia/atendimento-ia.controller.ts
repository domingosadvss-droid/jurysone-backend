import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO } from '../../common/perfis';
import { AtendimentoIaService } from './atendimento-ia.service';

/** Atendimento automático do WhatsApp: liga/desliga (gestão) e controle por conversa */
@ApiTags('🤖 Atendimento automático (WhatsApp)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('atendimento-ia')
export class AtendimentoIaController {
  constructor(private readonly svc: AtendimentoIaService) {}

  @Get('config')
  async config(@CurrentUser() user: any) {
    return { ...(await this.svc.config(user.officeId)), simulado: process.env.IA_ATENDIMENTO_SIMULADO === 'true' };
  }

  /** { ativo?, apenasNovosContatos?, esperaSegundos?, silencioAposHumanoHoras? } */
  @Patch('config')
  @Perfis(...PERFIS_GESTAO)
  salvar(@CurrentUser() user: any, @Body() dto: any) {
    return this.svc.salvarConfig(user.officeId, dto);
  }

  /** { status: 'AUTO' | 'PAUSADA' | null } — ligar, pausar ou devolver à regra geral nesta conversa */
  @Post('conversas/:id')
  @Perfis(...PERFIS_GESTAO)
  async naConversa(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    const status = dto?.status === undefined || dto?.status === '' ? null : dto.status;
    try { return await this.svc.definirNaConversa(user.officeId, id, status); }
    catch (e: any) { throw new BadRequestException(e?.message ?? 'Não foi possível.'); }
  }

  /** Testes: processa a conversa agora, sem esperar (fora de produção ou em modo simulado) */
  @Post('conversas/:id/responder')
  @Perfis(...PERFIS_GESTAO)
  async responderAgora(@CurrentUser() user: any, @Param('id') id: string) {
    if (process.env.NODE_ENV === 'production' && process.env.IA_ATENDIMENTO_SIMULADO !== 'true') throw new NotFoundException();
    const r = await this.svc.processar(id);
    return r;
  }
}
