import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus,
  Res, Logger,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentosService } from './documentos.service';
import { DocxGerarService, DadosCliente } from './docx-gerar.service';

@ApiTags('Documentos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('documentos')
export class DocumentosController {
  private readonly logger = new Logger(DocumentosController.name);

  constructor(
    private readonly documentosService: DocumentosService,
    private readonly docxGerarService: DocxGerarService,
  ) {}

  @Get()
  async findAll(
    @Request() req: any,
    @Query('processoId') processoId?: string,
    @Query('tipo')       tipo?: string,
    @Query('status')     status?: string,
    @Query('page')       page   = 1,
    @Query('limit')      limit  = 20,
  ) {
    const escritorioId = req.user.escritorioId ?? req.user.officeId;
    return this.documentosService.findAll({ escritorioId, processoId, tipo, status, page: +page, limit: +limit });
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    const officeId = req.user.escritorioId ?? req.user.officeId;
    return this.documentosService.findById(id, officeId);
  }

  @Get('processo/:processoId')
  async findByProcesso(@Param('processoId') processoId: string) {
    return this.documentosService.findByProcesso(processoId);
  }

  /**
   * POST /documentos/gerar/:tipo
   * Gera documento jurídico .docx preenchido com dados do cliente.
   * Tipos: contrato | procuracao | hipossuficiencia | renuncia
   * Body: DadosCliente (objeto com dados do formulário)
   */
  @Post('gerar/:tipo')
  @HttpCode(200)
  async gerarDocumento(
    @Param('tipo') tipo: string,
    @Body() dados: DadosCliente,
    @Res() res: Response,
  ) {
    const tiposValidos = ['contrato', 'procuracao', 'hipossuficiencia', 'renuncia'];
    if (!tiposValidos.includes(tipo)) {
      res.status(400).json({ error: `Tipo inválido. Use: ${tiposValidos.join(', ')}` });
      return;
    }

    try {
      const buffer = await this.docxGerarService.gerarDocumento(tipo, dados);
      const nomeArquivo = `Domingos_${tipo}_${(dados.clienteNome || 'cliente').replace(/\s+/g, '_')}.docx`;
      this.logger.log(`[DocxGerar] ${tipo} gerado para ${dados.clienteNome}`);

      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch (err) {
      this.logger.error(`[DocxGerar] Erro ao gerar ${tipo}: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }
}
