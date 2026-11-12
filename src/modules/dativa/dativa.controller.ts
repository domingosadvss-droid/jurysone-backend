import {
  Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS } from '../../common/perfis';
import { DativaService } from './dativa.service';
import { diaLocal } from '../publicacoes/agenda-prazos.service';

const ADVOGADOS = [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO, PERFIS.ASSOCIADO];

@ApiTags('⚖️ Advocacia dativa')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('dativa')
@Perfis(...ADVOGADOS)
export class DativaController {
  constructor(private readonly svc: DativaService) {}

  @Get()
  listar(@Query() q: any, @CurrentUser() user: any) {
    return this.svc.listar(user, q);
  }

  @Get('financeiro')
  @ApiOperation({ summary: 'Honorários da dativa do próprio advogado (fora do caixa do escritório)' })
  financeiro(@CurrentUser() user: any) {
    return this.svc.financeiro(user);
  }

  @Post('email-ajg/token')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Gera o token do endereço que recebe os e-mails do AJG encaminhados' })
  token(@CurrentUser() user: any) {
    return this.svc.gerarTokenEmail(user);
  }

  @Post('manual')
  @ApiOperation({ summary: 'Cadastra uma nomeação recebida por outro canal (ex.: intimação no eproc)' })
  manual(@Body() b: any, @CurrentUser() user: any) {
    return this.svc.criarDaNomeacao({
      escritorioId: user.officeId, advogadoId: user.id, fonte: 'MANUAL', numeroProcesso: String(b?.numeroProcesso ?? ''),
      orgao: b?.orgao ?? (b?.comarca ? `Comarca de ${b.comarca}` : null), classe: b?.classe ?? null,
      nomeadoEm: /^\d{4}-\d{2}-\d{2}$/.test(String(b?.nomeadoEm ?? '')) ? b.nomeadoEm : diaLocal(new Date()),
      texto: `${b?.reuPreso ? 'Réu preso. ' : ''}${b?.observacao ?? ''}`, destinatarios: (b?.partesContrarias ?? []).map((n: string) => ({ nome: n, polo: 'A' })),
      assistidoNome: b?.assistido ?? null, telefone: b?.telefone ?? null, comarca: b?.comarca ?? null,
    });
  }

  @Post('varreduras/:vid/decisao')
  @HttpCode(200)
  @ApiOperation({ summary: 'Arquivo com achados na varredura: { decisao: LIBERADO | DESCARTADO }' })
  decidirVarredura(@Param('vid') vid: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.decidirVarredura(user, vid, body);
  }

  @Get('rascunhos/:rid')
  rascunho(@Param('rid') rid: string, @CurrentUser() user: any) {
    return this.svc.obterRascunho(user, rid);
  }

  @Get(':id')
  obter(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.obter(user, id);
  }

  @Post(':id/aceitar')
  @HttpCode(200)
  aceitar(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.aceitar(user, id);
  }

  @Post(':id/recusar')
  @HttpCode(200)
  recusar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.recusar(user, id, body);
  }

  @Patch(':id/prisao')
  @ApiOperation({ summary: 'Réu preso: { reuPreso, presoDesde, ultimaRevisaoPreventiva }' })
  prisao(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.atualizarPrisao(user, id, body);
  }

  @Post(':id/fixacao')
  @HttpCode(200)
  fixacao(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.registrarFixacao(user, id, body);
  }

  @Post(':id/certidao')
  @HttpCode(200)
  certidao(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.registrarCertidao(user, id, body);
  }

  @Post(':id/pedido-pagamento')
  @HttpCode(200)
  pedido(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.registrarPedidoPagamento(user, id, body);
  }

  @Post(':id/pagamento')
  @HttpCode(200)
  pagamento(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.registrarPagamento(user, id, body);
  }

  @Post(':id/autos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 32 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Envia a cópia dos autos (PDF): varredura de prompt injection e rascunho da 1ª peça' })
  autos(@Param('id') id: string, @UploadedFile() arquivo: any, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.enviarAutos(user, id, arquivo, body);
  }
}

/** Recebe os e-mails do AJG encaminhados (sem login; autenticado pelo token do escritório) */
@ApiTags('⚖️ Advocacia dativa')
@Controller('dativa')
export class DativaEmailController {
  constructor(private readonly svc: DativaService) {}

  @Post('email-ajg')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  receber(@Headers('x-jurysone-token') token: string, @Body() body: any) {
    return this.svc.receberEmailAjg(token, body);
  }
}
