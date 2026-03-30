import { Module } from '@nestjs/common';
import { ProcessosController } from './processos.controller';
import { ProcessosService } from './processos.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [ProcessosController],
  providers: [ProcessosService, PrismaService],
  exports: [ProcessosService],
})
export class ProcessosModule {}
