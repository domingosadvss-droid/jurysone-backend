import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AtendimentosController } from './atendimentos.controller';
import { AtendimentosService } from './atendimentos.service';

@Module({
  controllers: [AtendimentosController],
  providers: [AtendimentosService, PrismaService],
  exports: [AtendimentosService],
})
export class AtendimentosModule {}
