import { Module } from '@nestjs/common';
import { ContatosController } from './contatos.controller';
import { ContatosService } from './contatos.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ContatosController],
  providers: [ContatosService, PrismaService],
  exports: [ContatosService],
})
export class ContatosModule {}
