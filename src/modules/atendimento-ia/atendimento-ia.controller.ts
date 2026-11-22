import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO, PERFIS_INTERNOS } from '../../common/perfis';
import { AtendimentoIaService } from './atendimento-ia.service';
import { AprendizadoAtendimentoService } from './aprendizado.service';
import { CaixaWhatsappService } from '../whatsapp-oficial/caixa.service';

/** Atendimento automático do WhatsApp: liga/desliga (gestão) e controle por conversa */
@ApiTags('🤖 Atendimento automático (WhatsApp)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('atendimento-ia')
export class AtendimentoIaController {
  constructor(
    private readonly svc: AtendimentoIaService,
    private readonly aprendizado: AprendizadoAtendimentoService,
    private readonly caixa: CaixaWhatsappService,
  ) {}

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

  // ── Aprendizado ───────────────────────────────────────────────────────────

  /** Números do atendimento nos últimos N dias (padrão 30) */
  @Get('painel')
  @Perfis(...PERFIS_GESTAO)
  painel(@CurrentUser() user: any, @Query('dias') dias?: string) {
    return this.aprendizado.painel(user, Math.min(365, Math.max(1, Number(dias) || 30)));
  }

  /** Respostas do advogado guardadas como exemplo (status: PENDENTE | APROVADO | DESCARTADO | TODOS) */
  @Get('exemplos')
  @Perfis(...PERFIS_GESTAO)
  exemplos(@CurrentUser() user: any, @Query() q: any) {
    return this.aprendizado.listarExemplos(user, q);
  }

  /** { status, perguntaCliente?, respostaAdvogado? } — aprovar (com edição), descartar ou voltar a pendente */
  @Patch('exemplos/:id')
  @Perfis(...PERFIS_GESTAO)
  decidirExemplo(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.aprendizado.decidirExemplo(user, id, dto);
  }

  /** Procura agora respostas do advogado para virar exemplo (também roda sozinho a cada 30 min) */
  @Post('aprendizado/capturar')
  @Perfis(...PERFIS_GESTAO)
  capturar(@CurrentUser() user: any) {
    return this.aprendizado.capturarExemplos(user.officeId);
  }

  /** A IA lê esta conversa e manda sugestões para o catálogo (vão para aprovação) */
  @Post('conversas/:id/aprender')
  @Perfis(...PERFIS_GESTAO)
  async aprender(@CurrentUser() user: any, @Param('id') id: string) {
    await this.caixa.conversaVisivel(user, id);
    return this.aprendizado.sugerirParaCatalogo(id);
  }

  /** Testes: roda os lembretes agora, gravando na caixa como "simulada" (nada é enviado) */
  @Post('lembretes/simular')
  @Perfis(...PERFIS_GESTAO)
  simularLembretes(@CurrentUser() user: any) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    return this.svc.processarLembretes({ escritorioId: user.officeId, simular: true });
  }

  /** Testes: processa a conversa agora, sem esperar (fora de produção ou em modo simulado) */
  @Post('conversas/:id/responder')
  @Perfis(...PERFIS_GESTAO)
  async responderAgora(@CurrentUser() user: any, @Param('id') id: string) {
    if (process.env.NODE_ENV === 'production' && process.env.IA_ATENDIMENTO_SIMULADO !== 'true') throw new NotFoundException();
    return this.svc.responderAgora(user, id);
  }
}
