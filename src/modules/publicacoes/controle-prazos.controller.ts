import { Controller, Get, HttpCode, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO, PERFIS_INTERNOS } from '../../common/perfis';
import { ControlePrazosService } from './controle-prazos.service';

/** Controle de prazos no formato da planilha do escritório */
@ApiTags('⏰ Controle de prazos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('controle-prazos')
export class ControlePrazosController {
  constructor(private readonly svc: ControlePrazosService) {}

  @Get()
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Painel de prazos (filtro: abertos | conferir | cumpridos | todos)' })
  painel(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.painel(user, q);
  }

  @Post('calendario-padrao')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Carrega o calendário por tribunal (TJSC, TRT12, TRF4) e recalcula os prazos em aberto' })
  calendarioPadrao(@CurrentUser() user: any) {
    return this.svc.importarCalendarioPadrao(user.officeId, user);
  }

  @Post('recalcular')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  recalcular(@CurrentUser() user: any) {
    return this.svc.recalcularAbertos(user.officeId, 'recálculo pedido pelo advogado');
  }

  @Post('importar-planilha')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Importa o .xlsx da planilha de prazos (abas Feriados, Prazos e Audiências e sessões) sem duplicar' })
  importarPlanilha(@CurrentUser() user: any, @UploadedFile() arquivo: any) {
    return this.svc.importarPlanilha(user, arquivo);
  }
}
