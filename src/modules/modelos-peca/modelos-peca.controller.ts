import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModelosPecaService } from './modelos-peca.service';

@ApiTags('📄 Modelos de Peças')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('modelos-peca')
export class ModelosPecaController {
  constructor(private readonly svc: ModelosPecaService) {}

  @Get('tipos')
  @ApiOperation({ summary: 'Lista áreas e tipos de peça disponíveis' })
  getTipos() {
    return this.svc.getTipos();
  }

  @Get()
  @ApiOperation({ summary: 'Lista modelos de peças do escritório' })
  findAll(@Query() query: any, @CurrentUser() user: any) {
    return this.svc.findAll(query, user.officeId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do modelo de peça' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.officeId);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Cria modelo de peça' })
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create(body, user.id, user.officeId);
  }

  @Post(':id/usar')
  @ApiOperation({ summary: 'Usa modelo substituindo variáveis' })
  usar(
    @Param('id') id: string,
    @Body('variaveis') variaveis: Record<string, string>,
    @CurrentUser() user: any,
  ) {
    return this.svc.usarModelo(id, variaveis, user.officeId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza modelo de peça' })
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, body, user.officeId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Arquiva modelo de peça' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.svc.remove(id, user.officeId);
  }
}
