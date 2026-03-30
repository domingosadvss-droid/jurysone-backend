import { Module } from '@nestjs/common';
import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [TarefasController],
  providers: [TarefasService, PrismaService],
  exports: [TarefasService],
})
export class TarefasModule {}
