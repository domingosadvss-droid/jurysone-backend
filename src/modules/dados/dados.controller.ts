import { Controller, Get, Post, Body, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DadosService } from './dados.service';

@UseGuards(JwtAuthGuard)
@Controller('dados')
export class DadosController {
  constructor(private readonly dados: DadosService) {}

  /** GET /api/dados — carrega payload do dashboard para o escritório */
  @Get()
  async carregar(@CurrentUser() user: any) {
    return this.dados.carregar(user.escritorioId);
  }

  /**
   * POST /api/dados — persiste payload completo do dashboard
   * ValidationPipe desabilitado aqui: o body é um objeto livre (Record<string,any>)
   * e o whitelist global apagaria todas as propriedades sem decorators.
   */
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: false, transform: false }))
  async salvar(@CurrentUser() user: any, @Body() body: any) {
    return this.dados.salvar(user.escritorioId, body);
  }
}
