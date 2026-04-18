import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChavesService } from './chaves.service';

@UseGuards(JwtAuthGuard)
@Controller('chaves')
export class ChavesController {
  constructor(private readonly chaves: ChavesService) {}

  /** POST /api/chaves — salva chave de API para o escritório */
  @Post()
  async salvar(
    @CurrentUser() user: any,
    @Body() body: { id: string; chave: string },
  ) {
    return this.chaves.salvar(user.escritorioId, body.id, body.chave);
  }
}
