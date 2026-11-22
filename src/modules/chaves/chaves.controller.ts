import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_GESTAO } from '../../common/perfis';
import { ChavesService } from './chaves.service';

/**
 * Chaves de API do escritório.
 * Nenhuma rota devolve o valor de uma chave — só a situação (configurada, origem e os 4 últimos caracteres).
 * Salvar, remover e verificar: só advogados de gestão.
 */
@UseGuards(JwtAuthGuard)
@Controller('chaves')
export class ChavesController {
  constructor(private readonly chaves: ChavesService) {}

  /** GET /api/chaves — situação das integrações, sem os valores */
  @Get()
  async situacao(@CurrentUser() user: any) {
    return { chaves: await this.chaves.resumo(user.escritorioId) };
  }

  /** POST /api/chaves — salva (cifrada) ou, com valor vazio, remove a chave */
  @Post()
  @Perfis(...PERFIS_GESTAO)
  async salvar(@CurrentUser() user: any, @Body() body: { id: string; chave: string }) {
    return this.chaves.salvar(user.escritorioId, body?.id, body?.chave);
  }

  /** DELETE /api/chaves/:id */
  @Delete(':id')
  @Perfis(...PERFIS_GESTAO)
  async remover(@CurrentUser() user: any, @Param('id') id: string) {
    return this.chaves.remover(user.escritorioId, id);
  }

  /** POST /api/chaves/:id/verificar — testa a chave quando há teste disponível */
  @Post(':id/verificar')
  @Perfis(...PERFIS_GESTAO)
  async verificar(@CurrentUser() user: any, @Param('id') id: string) {
    return this.chaves.verificar(user.escritorioId, id);
  }
}
