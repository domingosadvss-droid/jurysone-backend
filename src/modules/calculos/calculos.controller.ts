import {
  Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis } from '../../common/decorators/perfis.decorator';
import { PERFIS } from '../../common/perfis';
import { CalculosService } from './calculos.service';

const INTERNOS = [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO, PERFIS.ASSOCIADO, PERFIS.ESTAGIARIO];

@ApiTags('🧮 Calculadoras')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('calculos')
@Perfis(...INTERNOS)
export class CalculosController {
  constructor(private readonly svc: CalculosService) {}

  @Get('catalogo')
  @ApiOperation({ summary: 'Calculadoras disponíveis e o esquema de parâmetros de cada uma' })
  catalogo() {
    return this.svc.catalogo();
  }

  @Post('simular')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula sem guardar: { tipo, parametros }' })
  simular(@Body() b: any, @CurrentUser() user: any) {
    return this.svc.simular(user, b);
  }

  @Get('custas')
  custas(@Query() q: any, @CurrentUser() user: any) {
    return this.svc.listarCustas(user, q);
  }

  @Post('custas')
  @Perfis(PERFIS.ADMIN, PERFIS.SOCIO)
  @ApiOperation({ summary: 'Cadastra a tabela de custas vigente: { tribunal, ato, vigenciaDe, fonte, faixas[] }' })
  cadastrarCustas(@Body() b: any, @CurrentUser() user: any) {
    return this.svc.cadastrarCustas(user, b);
  }

  @Post('atualizar-agora')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Roda a atualização mensal agora para o escritório (normalmente roda no dia 16)' })
  atualizarAgora(@Body() b: any, @CurrentUser() user: any) {
    return this.svc.atualizarEscritorio(user.officeId, /^\d{4}-\d{2}-\d{2}$/.test(String(b?.dataBase ?? '')) ? b.dataBase : undefined);
  }

  @Post('extracoes')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: 32 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Envia contrato, extrato ou comprovantes (PDF): varredura e leitura dos pagamentos pela IA' })
  enviar(@UploadedFile() arquivo: any, @Body() b: any, @CurrentUser() user: any) {
    return this.svc.enviarParaLeitura(user, arquivo, b);
  }

  @Get('extracoes/:id')
  extracao(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.obterExtracao(user, id);
  }

  @Post('extracoes/:id/decisao')
  @HttpCode(200)
  @ApiOperation({ summary: 'Documento com achados na varredura: { decisao: LIBERADO | DESCARTADO }' })
  decidir(@Param('id') id: string, @Body() b: any, @CurrentUser() user: any) {
    return this.svc.decidirExtracao(user, id, b);
  }

  @Post('extracoes/:id/conferir')
  @HttpCode(200)
  @ApiOperation({ summary: 'O advogado confere (e corrige) a tabela de pagamentos: { pagamentos[] }' })
  conferir(@Param('id') id: string, @Body() b: any, @CurrentUser() user: any) {
    return this.svc.conferirExtracao(user, id, b);
  }

  @Get()
  listar(@Query() q: any, @CurrentUser() user: any) {
    return this.svc.listar(user, q);
  }

  @Post()
  @ApiOperation({ summary: 'Cria e guarda um cálculo: { tipo, parametros, processoId?, titulo?, extracaoId? }' })
  criar(@Body() b: any, @CurrentUser() user: any) {
    return this.svc.criar(user, b);
  }

  @Get(':id')
  obter(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.obter(user, id);
  }

  @Get(':id/versoes/:n')
  versao(@Param('id') id: string, @Param('n', ParseIntPipe) n: number, @CurrentUser() user: any) {
    return this.svc.obterVersao(user, id, n);
  }

  @Post(':id/ajuste')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ajuste manual: { parametros } (substitui) ou { alteracoes: [{ caminho, valor }] }' })
  ajuste(@Param('id') id: string, @Body() b: any, @CurrentUser() user: any) {
    return this.svc.ajustarManual(user, id, b);
  }

  @Post(':id/chat')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ajuste por conversa: { mensagem } — a IA só muda parâmetros; o sistema recalcula' })
  chat(@Param('id') id: string, @Body() b: any, @CurrentUser() user: any) {
    return this.svc.ajustarChat(user, id, b);
  }

  @Post(':id/versoes/:n/juntar')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca a versão como juntada aos autos (fica congelada) e guarda PDF, Word e Excel no processo' })
  juntar(@Param('id') id: string, @Param('n', ParseIntPipe) n: number, @CurrentUser() user: any) {
    return this.svc.juntar(user, id, n);
  }

  @Post(':id/arquivar')
  @HttpCode(200)
  arquivar(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.arquivar(user, id);
  }

  @Get(':id/arquivo/:formato')
  @ApiOperation({ summary: 'Baixa a versão (atual ou ?versao=N) em xlsx, docx ou pdf' })
  async arquivo(@Param('id') id: string, @Param('formato') formato: string, @Query('versao') versao: string, @CurrentUser() user: any) {
    const a = await this.svc.arquivo(user, id, versao ? Number(versao) : null, formato);
    return new StreamableFile(a.buffer, { type: a.mime, disposition: `attachment; filename="${a.nome}"` });
  }
}
