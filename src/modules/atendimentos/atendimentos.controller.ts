import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AtendimentosService } from './atendimentos.service';
import { CreateAtendimentoDto } from './dto/create-atendimento.dto';
import { UpdateAtendimentoStatusDto } from './dto/update-atendimento-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('atendimentos')
@UseGuards(JwtAuthGuard)
export class AtendimentosController {
  constructor(private readonly atendimentosService: AtendimentosService) {}

  /**
   * POST /atendimentos
   * Create a complete intake (client + case + financial + docs)
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCompleteAtendimento(
    @Request() req,
    @Body() createAtendimentoDto: CreateAtendimentoDto,
  ) {
    const escritorioId = req.user.escritorioId;
    return this.atendimentosService.createCompleteAtendimento(
      escritorioId,
      createAtendimentoDto,
    );
  }

  /**
   * GET /atendimentos
   * List all atendimentos with optional filtering
   */
  @Get()
  async listAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('area') area?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const escritorioId = req.user.escritorioId;
    return this.atendimentosService.listAtendimentos(
      escritorioId,
      { status, area, page, limit },
    );
  }

  /**
   * GET /atendimentos/:id
   * Get a single atendimento by ID
   */
  @Get(':id')
  async getOne(@Request() req, @Param('id') id: string) {
    const escritorioId = req.user.escritorioId;
    return this.atendimentosService.getAtendimentoById(escritorioId, id);
  }

  /**
   * PATCH /atendimentos/:id/status
   * Update atendimento status
   */
  @Patch(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() updateDto: UpdateAtendimentoStatusDto,
  ) {
    const escritorioId = req.user.escritorioId;
    return this.atendimentosService.updateStatus(
      escritorioId,
      id,
      updateDto.status,
    );
  }

  /**
   * GET /atendimentos/status/:status
   * Filter atendimentos by status
   */
  @Get('status/:status')
  async filterByStatus(
    @Request() req,
    @Param('status') status: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const escritorioId = req.user.escritorioId;
    return this.atendimentosService.filterByStatus(
      escritorioId,
      status,
      page,
      limit,
    );
  }
}
