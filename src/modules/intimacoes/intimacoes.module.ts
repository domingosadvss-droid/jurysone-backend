import { Module } from '@nestjs/common';
import { IntimacoesController } from './intimacoes.controller';
import { IntimacoesService } from './intimacoes.service';
import { DiarioOficialService } from './diario-oficial.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [IntimacoesController],
  providers: [IntimacoesService, DiarioOficialService, PrismaService],
  exports: [IntimacoesService, DiarioOficialService],
})
export class IntimacoesModule {}
