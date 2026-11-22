import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS, PERFIS_INTERNOS } from '../../common/perfis';
import { CaixaWhatsappService } from './caixa.service';
import { ConexoesWhatsappService } from './conexoes.service';
import { MidiaWhatsappService } from './midia.service';
import { Dono, WhatsappWebService } from './whatsapp-web.service';

/** O login que faz o pedido é o dono do número (cada login conecta o próprio WhatsApp) */
const dono = (user: any): Dono => ({ escritorioId: user.officeId, usuarioId: user.id });

@ApiTags('💬 WhatsApp oficial — caixa de conversas')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('whatsapp-oficial')
export class CaixaWhatsappController {
  constructor(
    private readonly caixa: CaixaWhatsappService,
    private readonly conexoes: ConexoesWhatsappService,
    private readonly midia: MidiaWhatsappService,
    private readonly web: WhatsappWebService,
  ) {}

  @Get('conexao')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'O WhatsApp do meu login e os números liberados para mim' })
  status(@CurrentUser() user: any) {
    return this.conexoes.status(user);
  }

  @Post('conexao')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Conecta no meu login um número da API oficial informado à mão: phoneNumberId, wabaId, token, origem' })
  conectar(@Body() body: any, @CurrentUser() user: any) {
    return this.conexoes.salvarManual(user, body);
  }

  @Delete('conexao')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Desconecta o WhatsApp do meu login (as conversas ficam guardadas)' })
  desconectar(@CurrentUser() user: any) {
    return this.conexoes.desconectar(user);
  }

  // ── Quem mais pode ver a caixa do meu número ────────────────────────────────

  @Get('acessos')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Quem pode ver a caixa do meu número, e a equipe para escolher' })
  acessos(@CurrentUser() user: any) {
    return this.conexoes.acessos(user);
  }

  @Put('acessos')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Define quem pode ver e responder a caixa do meu número: { usuarioIds: [] }' })
  definirAcessos(@Body() body: any, @CurrentUser() user: any) {
    return this.conexoes.definirAcessos(user, body);
  }

  // ── WhatsApp Web (QR Code) — modo de testes, um por login ───────────────────

  @Get('web')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'WhatsApp Web do meu login: situação e QR Code (quando aguardando leitura)' })
  webSituacao(@CurrentUser() user: any) {
    return this.web.situacao(dono(user));
  }

  @Post('web/conectar')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'WhatsApp Web: conecta o MEU número (gera o QR Code para ler no meu celular)' })
  webConectar(@CurrentUser() user: any) {
    return this.web.iniciar(dono(user));
  }

  @Get('web/pessoais')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'WhatsApp Web: conversas gravadas do meu número com contatos da agenda que não são clientes (prévia da limpeza)' })
  webPessoais(@CurrentUser() user: any) {
    return this.web.previaLimpeza(dono(user));
  }

  @Post('web/pessoais/apagar')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'WhatsApp Web: apaga do JurysOne as conversas pessoais já gravadas do meu número' })
  webApagarPessoais(@CurrentUser() user: any) {
    return this.web.limparPessoais(dono(user));
  }

  @Delete('web')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'WhatsApp Web: desconecta o meu número e apaga a sessão (as conversas ficam guardadas)' })
  webDesconectar(@CurrentUser() user: any) {
    return this.web.desconectar(dono(user));
  }

  // ── Caixa ───────────────────────────────────────────────────────────────────

  @Get('conversas')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Conversas dos números que posso ver, da mais recente para a mais antiga (filtros: busca, conexaoId)' })
  conversas(@Query() q: any, @CurrentUser() user: any) {
    return this.caixa.conversas(user, q);
  }

  @Get('conversas/:id/mensagens')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Mensagens de uma conversa (zera as não lidas)' })
  mensagens(@Param('id') id: string, @Query() q: any, @CurrentUser() user: any) {
    return this.caixa.mensagens(user, id, q);
  }

  @Post('conversas/:id/enviar')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Envia texto ao contato (dentro da janela de 24 h): texto' })
  enviar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.caixa.enviarTexto(user, id, body);
  }

  @Get('mensagens/:id/anexo')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Abre o anexo guardado de uma mensagem' })
  async anexo(@Param('id') id: string, @CurrentUser() user: any, @Res() res: Response) {
    const a = await this.midia.conteudo(user, id);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
    res.send(a.buffer);
  }
}
