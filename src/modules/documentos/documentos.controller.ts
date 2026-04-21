import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentosService } from './documentos.service';

@ApiTags('Documentos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly documentosService: DocumentosService) {}

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
}
