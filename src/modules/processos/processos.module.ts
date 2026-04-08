import { Module } from '@nestjs/common';
import { ProcessosController } from './processos.controller';
import { ProcessosService } from './processos.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ProcessosController],
  providers: [ProcessosService, PrismaService],
  exports: [ProcessosService],
})
export class ProcessosModule {}
