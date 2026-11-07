import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS, PERFIS_GESTAO } from '../../common/perfis';
import { EquipeService } from './equipe.service';

@ApiTags('👥 Equipe')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('equipe')
export class EquipeController {
  constructor(private readonly svc: EquipeService) {}

  @Get()
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Lista a equipe do escritório com perfis' })
  listar(@CurrentUser() user: any) {
    return this.svc.listar(user.officeId);
  }

  @Post()
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Cadastra usuário (ADMIN, SOCIO, ASSOCIADO, ESTAGIARIO, PARCEIRO)' })
  criar(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.criar(body, user.officeId);
  }

  @Patch(':id')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Altera perfil, dados ou ativa/desativa um usuário' })
  atualizar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.atualizar(id, body, user.officeId, user);
  }

  @Post(':id/termo')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Registra o termo de ciência e responsabilidade assinado' })
  registrarTermo(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.registrarTermo(id, body, user.officeId);
  }
}
