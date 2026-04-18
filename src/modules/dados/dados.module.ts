import { Module } from '@nestjs/common';
import { DadosController } from './dados.controller';
import { DadosService } from './dados.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [DadosController],
  providers: [DadosService, PrismaService],
})
export class DadosModule {}
