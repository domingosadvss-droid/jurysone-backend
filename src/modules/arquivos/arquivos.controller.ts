import {
  Body, Controller, Get, Header, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis, PermiteParceiro } from '../../common/decorators/perfis.decorator';
import { PERFIS, PERFIS_GESTAO } from '../../common/perfis';
import { ArquivosService } from './arquivos.service';

const LIMITE_BYTES = 25 * 1024 * 1024;

@ApiTags('📁 Arquivos do caso')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('arquivos')
export class ArquivosController {
  constructor(private readonly svc: ArquivosService) {}

  @Get('armazenamento')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Situação do armazenamento (Google Drive conectado ou pasta local)' })
  status(@CurrentUser() user: any) {
    return this.svc.status(user.officeId);
  }

  @Get('drive/conectar')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Gera o link para conectar o Google Drive do escritório' })
  conectar(@CurrentUser() user: any) {
    return this.svc.urlConexaoDrive(user.officeId);
  }

  @Post('processos/:processoId')
  @PermiteParceiro()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: LIMITE_BYTES } }))
  @ApiOperation({ summary: 'Envia arquivo para a pasta do processo (opcional: etapaId + itemChecklistId marca o item)' })
  enviar(
    @Param('processoId') processoId: string,
    @UploadedFile() arquivo: any,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.svc.enviar(user.officeId, processoId, arquivo, body, user);
  }

  @Get('processos/:processoId')
  @PermiteParceiro()
  listar(@Param('processoId') processoId: string, @Query() query: any, @CurrentUser() user: any) {
    return this.svc.listar(user.officeId, processoId, user, query);
  }

  @Get(':id/download')
  @PermiteParceiro()
  async baixar(@Param('id') id: string, @CurrentUser() user: any, @Res() res: any) {
    const { doc, conteudo } = await this.svc.baixar(user.officeId, id, user);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.nome)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(conteudo);
  }
}

/** Retorno do Google após o administrador autorizar o Drive (rota pública, validada pelo `state` assinado) */
@ApiTags('📁 Arquivos do caso')
@Controller('arquivos/drive')
export class DriveCallbackController {
  constructor(private readonly svc: ArquivosService) {}

  @Get('callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async callback(@Query('code') code: string, @Query('state') state: string) {
    try {
      await this.svc.callbackDrive(code, state);
      return '<h2>Google Drive conectado ao JurysOne.</h2><p>Você já pode fechar esta janela.</p>';
    } catch (e: any) {
      const msg = String(e?.response?.message ?? e?.message ?? 'Erro').replace(/[<>&]/g, '');
      return `<h2>Não foi possível conectar o Google Drive.</h2><p>${msg}</p>`;
    }
  }
}
