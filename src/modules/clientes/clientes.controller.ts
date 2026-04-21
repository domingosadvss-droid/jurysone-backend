import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Request,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientesService } from './clientes.service';

@ApiTags('Clientes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  async findAll(
    @Request() req: any,
    @Query('tipo')   tipo?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page')   page   = 1,
    @Query('limit')  limit  = 20,
  ) {
    const escritorioId = req.user.escritorioId ?? req.user.officeId;
    return this.clientesService.findAll({ escritorioId, tipo, status, search, page: +page, limit: +limit });
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.clientesService.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: any, @Body() dto: any) {
    const escritorioId = req.user.escritorioId ?? req.user.officeId;
    return this.clientesService.create({ ...dto, escritorioId });
  }

  @Patch(':id')
  async update(@Request() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.clientesService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.clientesService.remove(id);
  }
}
