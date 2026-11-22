import { Body, Controller, Get, NotFoundException, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO } from '../../common/perfis';
import { chamadaDeTeste, MODELO_CONVERSA, MODELO_PECAS, IaIndisponivel } from '../../common/ia-claude';
import { BadRequestException } from '@nestjs/common';
import { IaUsoService } from './ia-uso.service';

/** Etapa A — uso, custo e limite mensal da IA */
@UseGuards(JwtAuthGuard)
@Controller('ia')
export class IaUsoController {
  constructor(private readonly svc: IaUsoService) {}

  /** GET /api/ia/situacao — gasto do mês, limite e se as tarefas pesadas estão pausadas */
  @Get('situacao')
  @Perfis(...PERFIS_GESTAO)
  situacao(@CurrentUser() user: any) {
    return this.svc.situacao(user.escritorioId);
  }

  /** GET /api/ia/relatorio?mes=AAAA-MM */
  @Get('relatorio')
  @Perfis(...PERFIS_GESTAO)
  relatorio(@CurrentUser() user: any, @Query('mes') mes?: string) {
    return this.svc.relatorio(user.escritorioId, mes);
  }

  /** GET /api/ia/processos/:id/custo */
  @Get('processos/:id/custo')
  @Perfis(...PERFIS_GESTAO)
  custoDoProcesso(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.custoDoProcesso(user.escritorioId, id);
  }

  /** GET /api/ia/config */
  @Get('config')
  @Perfis(...PERFIS_GESTAO)
  async config(@CurrentUser() user: any) {
    const c = await this.svc.config(user.escritorioId);
    return { limiteMensalBrl: c.limiteMensalBrl, avisoPercentual: c.avisoPercentual };
  }

  /** PUT /api/ia/config — { limiteMensalBrl, avisoPercentual } (vazio = sem limite / sem aviso) */
  @Put('config')
  @Perfis(...PERFIS_GESTAO)
  salvarConfig(@CurrentUser() user: any, @Body() dto: any) {
    return this.svc.salvarConfig(user.escritorioId, dto);
  }

  /** POST /api/ia/liberar — libera as tarefas pesadas até o fim do mês */
  @Post('liberar')
  @Perfis(...PERFIS_GESTAO)
  liberar(@CurrentUser() user: any) {
    return this.svc.liberar(user.escritorioId, user.id);
  }

  /** POST /api/ia/liberar/cancelar */
  @Post('liberar/cancelar')
  @Perfis(...PERFIS_GESTAO)
  cancelarLiberacao(@CurrentUser() user: any) {
    return this.svc.cancelarLiberacao(user.escritorioId);
  }

  /** POST /api/ia/teste — { categoria } — só fora de produção, para testar o controle de uso */
  @Post('teste')
  @Perfis(...PERFIS_GESTAO)
  async teste(@CurrentUser() user: any, @Body() dto: any) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const categoria = dto?.categoria === 'CONVERSA' ? 'CONVERSA' : 'PESADA';
    try {
      const texto = await this.svc.executar(
        { escritorioId: user.escritorioId, tarefa: 'teste', categoria, usuarioId: user.id, processoId: dto?.processoId ?? null },
        (chave, aoUsar) => chamadaDeTeste(chave, categoria === 'CONVERSA' ? MODELO_CONVERSA : MODELO_PECAS, aoUsar),
      );
      return { ok: true, texto };
    } catch (e: any) {
      if (e instanceof IaIndisponivel) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
