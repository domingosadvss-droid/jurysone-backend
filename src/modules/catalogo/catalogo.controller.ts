import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO, PERFIS_INTERNOS } from '../../common/perfis';
import { CatalogoService } from './catalogo.service';

/** Etapa B — catálogo de serviços e fila de sugestões */
@ApiTags('🗂️ Catálogo de serviços')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('catalogo')
export class CatalogoController {
  constructor(private readonly svc: CatalogoService) {}

  @Get()
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Lista os serviços (status: ATIVO padrão | INATIVO | TODOS; area)' })
  listar(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.listar(user, q);
  }

  @Get('sugestoes')
  @Perfis(...PERFIS_GESTAO)
  listarSugestoes(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.listarSugestoes(user, q);
  }

  @Get('para-atendimento')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'O catálogo como a IA do atendimento vê (sem preço)' })
  paraAtendimento(@CurrentUser() user: any) {
    return this.svc.paraAtendimento(user.officeId);
  }

  @Get(':id')
  @Perfis(...PERFIS_INTERNOS)
  detalhe(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.detalhe(user, id);
  }

  @Post('carga-inicial')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Cria os 8 serviços da linha de produção, sem preço (não duplica)' })
  cargaInicial(@CurrentUser() user: any) {
    return this.svc.cargaInicial(user);
  }

  @Post()
  @Perfis(...PERFIS_GESTAO)
  criar(@CurrentUser() user: any, @Body() dto: any) {
    return this.svc.criar(user, dto);
  }

  @Patch(':id')
  @Perfis(...PERFIS_GESTAO)
  alterar(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.svc.alterar(user, id, dto);
  }

  @Post(':id/desativar')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  desativar(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.definirStatus(user, id, 'INATIVO');
  }

  @Post(':id/reativar')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  reativar(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.definirStatus(user, id, 'ATIVO');
  }

  /** Qualquer pessoa da equipe pode sugerir; só a gestão aprova */
  @Post('sugestoes')
  @Perfis(...PERFIS_INTERNOS)
  sugerir(@CurrentUser() user: any, @Body() dto: any) {
    return this.svc.sugerir(user.officeId, {
      tipo: dto?.tipo, servicoId: dto?.servicoId ?? null, dados: dto?.dados ?? {}, justificativa: dto?.justificativa ?? null,
      origem: 'USUARIO', criadoPorId: user.id,
    });
  }

  @Post('sugestoes/:id/aprovar')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  aprovar(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.svc.aprovarSugestao(user, id, dto);
  }

  @Post('sugestoes/:id/recusar')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  recusar(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.svc.recusarSugestao(user, id, dto);
  }
}
