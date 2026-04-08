import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentosService } from './documentos.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [ConfigModule],
  providers: [DocumentosService, PrismaService],
  exports: [DocumentosService],
})
export class DocumentosModule {}
