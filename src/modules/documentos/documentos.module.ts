import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DocumentosController } from './documentos.controller';
import { DocumentosService } from './documentos.service';
import { DocxGerarService } from './docx-gerar.service';

@Module({
  imports:     [ConfigModule],
  controllers: [DocumentosController],
  providers:   [DocumentosService, DocxGerarService],
  exports:     [DocumentosService, DocxGerarService],
})
export class DocumentosModule {}
