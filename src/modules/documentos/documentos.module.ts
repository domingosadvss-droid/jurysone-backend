import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports:     [ConfigModule],
  controllers: [DocumentosController],
  providers:   [DocumentosService, PrismaService],
  exports:     [DocumentosService],
})
export class DocumentosModule {}
