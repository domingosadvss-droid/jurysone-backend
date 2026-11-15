import { Module } from '@nestjs/common';
import { JurisprudenciaController } from './jurisprudencia.controller';
import { JurisprudenciaService } from './jurisprudencia.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [JurisprudenciaController],
  providers: [JurisprudenciaService, PrismaService],
  exports: [JurisprudenciaService],
})
export class JurisprudenciaModule {}
