import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChavesService } from './chaves.service';

@UseGuards(JwtAuthGuard)
@Controller('chaves')
export class ChavesController {
  constructor(private readonly chaves: ChavesService) {}

  /** GET /api/chaves — carrega todas as chaves de API do escritório */
  @Get()
  async carregar(@CurrentUser() user: any) {
    const keys = await this.chaves.carregar(user.escritorioId);
    // Retorna objeto com chaves mascaradas para exibição (mostra que estão configuradas)
    // e as chaves reais para preencher os inputs do usuário autenticado
    return { keys };
  }

  /** POST /api/chaves — salva chave de API para o escritório */
  @Post()
  async salvar(
    @CurrentUser() user: any,
    @Body() body: { id: string; chave: string },
  ) {
    return this.chaves.salvar(user.escritorioId, body.id, body.chave);
  }
}
