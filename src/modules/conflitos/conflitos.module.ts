import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConflitosController } from './conflitos.controller';
import { ConflitosService } from './conflitos.service';

@Module({
  controllers: [ConflitosController],
  providers: [ConflitosService, PrismaService],
  exports: [ConflitosService],
})
export class ConflitosModule {}
