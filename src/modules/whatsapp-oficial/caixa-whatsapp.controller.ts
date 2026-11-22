import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS, PERFIS_INTERNOS } from '../../common/perfis';
import { CaixaWhatsappService } from './caixa.service';
import { ConexoesWhatsappService } from './conexoes.service';
import { MidiaWhatsappService } from './midia.service';
import { WhatsappWebService } from './whatsapp-web.service';

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
  @ApiOperation({ summary: 'Situação da conexão do WhatsApp do escritório' })
  status(@CurrentUser() user: any) {
    return this.conexoes.status(user.officeId);
  }

  @Post('conexao')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Conecta um número informado à mão (número de teste da Meta ou token de usuário do sistema): phoneNumberId, wabaId, token, origem' })
  conectar(@Body() body: any, @CurrentUser() user: any) {
    return this.conexoes.salvarManual(user.officeId, body);
  }

  @Delete('conexao')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Desconecta o WhatsApp do escritório (as conversas ficam guardadas)' })
  desconectar(@CurrentUser() user: any) {
    return this.conexoes.desconectar(user.officeId);
  }

  // ── WhatsApp Web (QR Code) — modo de testes ─────────────────────────────────

  @Get('web')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'WhatsApp Web: situação da conexão e QR Code (quando aguardando leitura)' })
  webSituacao(@CurrentUser() user: any) {
    return this.web.situacao(user.officeId);
  }

  @Post('web/conectar')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'WhatsApp Web: inicia a conexão e gera o QR Code para ler no celular' })
  webConectar(@CurrentUser() user: any) {
    return this.web.iniciar(user.officeId);
  }

  @Get('web/pessoais')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'WhatsApp Web: conversas gravadas de contatos da agenda que não são clientes (prévia da limpeza)' })
  webPessoais(@CurrentUser() user: any) {
    return this.web.previaLimpeza(user.officeId);
  }

  @Post('web/pessoais/apagar')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'WhatsApp Web: apaga do JurysOne as conversas pessoais já gravadas (mensagens e anexos)' })
  webApagarPessoais(@CurrentUser() user: any) {
    return this.web.limparPessoais(user.officeId);
  }

  @Delete('web')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'WhatsApp Web: desconecta e apaga a sessão (as conversas ficam guardadas)' })
  webDesconectar(@CurrentUser() user: any) {
    return this.web.desconectar(user.officeId);
  }

  @Get('conversas')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Conversas do escritório, da mais recente para a mais antiga (filtro: busca)' })
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
    const a = await this.midia.conteudo(user.officeId, id);
    res.setHeader('Content-Type', a.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`);
    res.send(a.buffer);
  }
}
