import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, NotFoundException, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Perfis, PermiteParceiro } from '../../common/decorators/perfis.decorator';
import { PERFIS, PERFIS_GESTAO, PERFIS_INTERNOS, perfisDo } from '../../common/perfis';
import { PrismaService } from '../../database/prisma.service';
import { PublicacoesService } from './publicacoes.service';
import { ImportacaoService } from './importacao.service';
import { AgendaPrazosService } from './agenda-prazos.service';
import { AvisosService } from './avisos.service';
import { DativaService } from '../dativa/dativa.service';
import { ErroDjen, agruparPorProcesso } from './djen-cliente';

@ApiTags('📰 Publicações (DJEN)')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('publicacoes')
export class PublicacoesController {
  constructor(
    private readonly svc: PublicacoesService,
    private readonly importacao: ImportacaoService,
    private readonly avisos: AvisosService,
    private readonly dativa: DativaService,
  ) {}

  @Get()
  @PermiteParceiro()
  @ApiOperation({ summary: 'Publicações visíveis para o usuário (filtros: semVinculo, minhas, categoria, processoId, status)' })
  listar(@Query() q: any, @CurrentUser() user: any) {
    return this.svc.listar(user, q);
  }

  @Get('saude')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Situação da captura do DJEN por OAB' })
  saude(@CurrentUser() user: any) {
    return this.svc.saude(user.officeId);
  }

  @Get('djen/consulta')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Consulta processual no DJEN (fonte única): processo, numeroOab+ufOab, nomeParte, nomeAdvogado, siglaTribunal, inicio, fim' })
  async consultaDjen(@Query() q: any) {
    const data = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : undefined);
    try {
      const r = await this.svc.djen.buscar({
        numeroProcesso: q.processo ?? q.numeroProcesso, numeroOab: q.numeroOab ?? q.oab, ufOab: q.ufOab ?? q.uf,
        nomeParte: q.nomeParte, nomeAdvogado: q.nomeAdvogado, siglaTribunal: q.siglaTribunal ?? q.tribunal,
        inicio: data(q.inicio), fim: data(q.fim),
      });
      const processos = agruparPorProcesso(r.itens);
      return { fonte: 'DJEN', periodo: r.inicio ? { inicio: r.inicio, fim: r.fim } : null, completo: r.completo, total: processos.length, processos };
    } catch (e: any) {
      if (e instanceof ErroDjen) throw new BadRequestException(e.message);
      throw e;
    }
  }

  @Get('coincidencias')
  @Perfis(PERFIS.ADMIN)
  @ApiOperation({ summary: 'Coincidências do cruzamento dos processos particulares de parceiros (só o titular)' })
  coincidencias(@CurrentUser() user: any) {
    return this.svc.coincidencias(user);
  }

  @Post('capturar')
  @HttpCode(200)
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Dispara a captura do DJEN agora (body opcional: inicio, fim, usuarioId)' })
  capturar(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.capturarEscritorio(user.officeId, { inicio: body?.inicio, fim: body?.fim, usuarioId: body?.usuarioId });
  }

  @Post('importar')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Importa os processos antigos pela OAB (DJEN): recentes entram direto, antigos vão para decisão' })
  importar(@Body() body: any, @CurrentUser() user: any) {
    return this.importacao.importar(user, body);
  }

  @Get('importacao/pendencias')
  @Perfis(...PERFIS_INTERNOS)
  pendencias(@Query() q: any, @CurrentUser() user: any) {
    return this.importacao.listarPendencias(user, q);
  }

  @Post('importacao/pendencias/:id')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Decide a pendência: { acao: IMPORTAR | DESCARTAR, clienteId?, novoCliente? }' })
  decidir(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.importacao.decidirPendencia(user, id, body);
  }

  /** Executa uma rotina agendada na hora (só fora de produção; usado nos testes) */
  @Post('rotinas/executar')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN)
  async rotina(@Body() body: any) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException('Indisponível em produção.');
    const agora = body?.agora ? new Date(body.agora) : new Date();
    switch (body?.rotina) {
      case 'alertarPrazos': return this.avisos.alertarPrazos(agora);
      case 'enviarAgendadas': return this.avisos.enviarAgendadas();
      case 'saudeCaptura': return this.avisos.verificarSaudeCaptura(agora);
      case 'preventivas': return this.dativa.alertarPreventivas(agora);
      default: throw new BadRequestException('rotina: alertarPrazos | enviarAgendadas | saudeCaptura | preventivas');
    }
  }

  @Get(':id')
  @PermiteParceiro()
  obter(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.obter(user, id);
  }

  @Post(':id/vincular')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Vincula a publicação (fila "sem vínculo") a um processo' })
  vincular(@Param('id') id: string, @Body('processoId') processoId: string, @CurrentUser() user: any) {
    if (!processoId) throw new BadRequestException('Informe processoId.');
    return this.svc.vincular(user, id, processoId);
  }
}

@ApiTags('⏰ Prazos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('prazos')
export class PrazosDjenController {
  constructor(private readonly agenda: AgendaPrazosService, private readonly prisma: PrismaService) {}

  private async permitido(user: any, id: string) {
    const p = await this.prisma.prazo.findFirst({ where: { id, escritorioId: user.officeId, deletedAt: null } });
    if (!p) throw new NotFoundException('Prazo não encontrado');
    const gestao = perfisDo(user).some((x) => (PERFIS_GESTAO as string[]).includes(x));
    if (!gestao && !p.responsaveisIds.includes(user.id)) throw new ForbiddenException('Prazo de outro advogado.');
    return p;
  }

  @Post(':id/cumprir')
  @HttpCode(200)
  @PermiteParceiro()
  @ApiOperation({ summary: 'Dá baixa no prazo (vale para todos os responsáveis)' })
  async cumprir(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    await this.permitido(user, id);
    return this.agenda.cumprir(user.officeId, id, user, body);
  }

  @Post(':id/ajustar')
  @HttpCode(200)
  @PermiteParceiro()
  @ApiOperation({ summary: 'Confere o prazo provisório ou ajusta o vencimento ({ vencimento?: AAAA-MM-DD })' })
  async ajustar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    await this.permitido(user, id);
    return this.agenda.ajustar(user.officeId, id, body, user);
  }
}

@ApiTags('📅 Calendário forense')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('calendario')
export class CalendarioController {
  constructor(private readonly agenda: AgendaPrazosService) {}

  @Get('feriados')
  @Perfis(...PERFIS_INTERNOS)
  listar(@Query() q: any, @CurrentUser() user: any) {
    return this.agenda.listarFeriados(user.officeId, q);
  }

  @Post('feriados')
  @Perfis(...PERFIS_GESTAO)
  @ApiOperation({ summary: 'Cadastra feriado municipal/estadual ou suspensão de expediente/prazos de um tribunal' })
  criar(@Body() body: any, @CurrentUser() user: any) {
    return this.agenda.criarFeriado(user.officeId, body, user);
  }

  @Delete('feriados/:id')
  @Perfis(...PERFIS_GESTAO)
  remover(@Param('id') id: string, @CurrentUser() user: any) {
    return this.agenda.removerFeriado(user.officeId, id);
  }

  @Get('simular')
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Simula o vencimento: disponibilizacao, dias, contagem, tribunal, comarca, penal, reuPreso' })
  simular(@Query() q: any, @CurrentUser() user: any) {
    return this.agenda.simular(user.officeId, q);
  }
}

@ApiTags('📅 Google Agenda do advogado')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('agenda-google')
export class AgendaGoogleController {
  constructor(private readonly agenda: AgendaPrazosService) {}

  @Get('conectar')
  @PermiteParceiro()
  conectar(@CurrentUser() user: any) {
    return this.agenda.urlConexaoAgenda(user);
  }

  @Get('status')
  @PermiteParceiro()
  status(@CurrentUser() user: any) {
    return this.agenda.statusAgenda(user);
  }

  @Delete()
  @PermiteParceiro()
  desconectar(@CurrentUser() user: any) {
    return this.agenda.desconectarAgenda(user);
  }
}

@ApiTags('📅 Google Agenda do advogado')
@Controller('agenda-google')
export class AgendaGoogleCallbackController {
  constructor(private readonly agenda: AgendaPrazosService) {}

  @Get('callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async callback(@Query('code') code: string, @Query('state') state: string) {
    try {
      await this.agenda.callbackAgenda(code, state);
      return '<h2>Google Agenda conectado ao JurysOne.</h2><p>Seus prazos e audiências passam a aparecer na sua agenda. Você já pode fechar esta janela.</p>';
    } catch (e: any) {
      const msg = String(e?.response?.message ?? e?.message ?? 'Erro').replace(/[<>&]/g, '');
      return `<h2>Não foi possível conectar o Google Agenda.</h2><p>${msg}</p>`;
    }
  }
}

@ApiTags('💬 Mensagens ao cliente')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('mensagens-cliente')
export class MensagensClienteController {
  constructor(private readonly avisos: AvisosService) {}

  @Get()
  @Perfis(...PERFIS_INTERNOS)
  listar(@Query() q: any, @CurrentUser() user: any) {
    return this.avisos.listar(user, q);
  }

  @Post(':id/aprovar')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO, PERFIS.ASSOCIADO)
  @ApiOperation({ summary: 'Aprova (pode editar texto/telefone) e envia pelo WhatsApp' })
  aprovar(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.avisos.aprovar(user, id, body);
  }

  @Post(':id/descartar')
  @HttpCode(200)
  @Perfis(PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO, PERFIS.ASSOCIADO)
  descartar(@Param('id') id: string, @CurrentUser() user: any) {
    return this.avisos.descartar(user, id);
  }
}

@ApiTags('🛡️ Conflitos e impedimentos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('conflitos')
export class ConciliacoesController {
  constructor(private readonly importacao: ImportacaoService) {}

  @Post('conciliacoes/por-numero')
  @HttpCode(200)
  @Perfis(...PERFIS_INTERNOS)
  @ApiOperation({ summary: 'Conciliador informa só os números; partes buscadas no DJEN e impedidas por 1 ano' })
  porNumero(@Body() body: any, @CurrentUser() user: any) {
    return this.importacao.conciliacoesPorNumero(user, body);
  }
}
