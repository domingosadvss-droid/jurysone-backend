import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS_INTERNOS } from '../../common/perfis';
import { ConhecimentoService } from './conhecimento.service';

/** Base de conhecimento do escritório: leitura para a equipe interna, escrita para a gestão */
@ApiTags('📚 Base de conhecimento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Perfis(...PERFIS_INTERNOS)
@Controller('conhecimento')
export class ConhecimentoController {
  constructor(private readonly svc: ConhecimentoService) {}

  /** ?q=texto&tipo=MODELO_PECA,PECA&limite=15 */
  @Get('busca')
  buscar(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.buscarApi(user, q);
  }

  @Get()
  listar(@CurrentUser() user: any, @Query() q: any) {
    return this.svc.listar(user, q);
  }

  @Get(':id')
  detalhe(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.detalhe(user, id);
  }

  /** { titulo, tipo, area?, texto, usoAtendimento? } */
  @Post('texto')
  criarTexto(@CurrentUser() user: any, @Body() dto: any) {
    return this.svc.criarTexto(user, dto);
  }

  /** multipart: arquivo (PDF/DOCX/TXT) + titulo, tipo, area?, usoAtendimento? */
  @Post('arquivo')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 25 * 1024 * 1024 } }))
  criarArquivo(@CurrentUser() user: any, @UploadedFile() arquivo: Express.Multer.File, @Body() dto: any) {
    return this.svc.criarArquivo(user, arquivo, dto);
  }

  /** { titulo?, tipo?, area?, usoAtendimento?, ativo? } */
  @Patch(':id')
  alterar(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: any) {
    return this.svc.alterar(user, id, dto);
  }

  @Delete(':id')
  remover(@CurrentUser() user: any, @Param('id') id: string) {
    return this.svc.remover(user, id);
  }
}
