import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO, PERFIS_INTERNOS } from '../../common/perfis';
import { ConflitosService } from './conflitos.service';

@ApiTags('🛡️ Conflitos e impedimentos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('conflitos')
export class ConflitosController {
  constructor(private readonly svc: ConflitosService) {}

  @Post('verificar')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Verifica conflito de interesses e impedimentos antes de aceitar um caso' })
  verificar(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.verificar(user.officeId, body);
  }

  @Get('impedimentos')
  @Perfis(...PERFIS_INTERNOS)
  listar(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.listar(user.officeId, query);
  }

  @Post('impedimentos')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Cadastra impedimento (CONCILIACAO, TJD, JUIZO, OUTRO)' })
  criar(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.criar(user.officeId, body, user);
  }

  @Post('impedimentos/sessao-conciliacao')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Lança as partes de uma sessão de conciliação (bloqueio de 1 ano)' })
  sessao(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.registrarSessaoConciliacao(user.officeId, body, user);
  }

  @Delete('impedimentos/:id')
  @Perfis(...PERFIS_GESTAO)
  remover(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remover(user.officeId, id);
  }
}
