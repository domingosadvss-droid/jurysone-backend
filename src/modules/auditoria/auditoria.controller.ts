import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS } from '../../common/perfis';
import { AuditoriaService } from './auditoria.service';

/** Só leitura e só para o administrador. Não existe rota para alterar ou apagar registros. */
@ApiTags('🔎 Auditoria')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Perfis(PERFIS.ADMIN)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  listar(@CurrentUser() user: any, @Query() q: any) {
    return this.auditoria.listar(user.officeId, q);
  }

  @Get('resumo')
  resumo(@CurrentUser() user: any) {
    return this.auditoria.resumoHoje(user.officeId);
  }
}
