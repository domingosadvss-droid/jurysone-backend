import { Module } from '@nestjs/common';
import { ModelosPecaController } from './modelos-peca.controller';
import { ModelosPecaService } from './modelos-peca.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ModelosPecaController],
  providers: [ModelosPecaService, PrismaService],
  exports: [ModelosPecaService],
})
export class ModelosPecaModule {}
