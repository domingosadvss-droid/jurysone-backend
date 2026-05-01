import { Module } from '@nestjs/common';
import { ProcessosController } from './processos.controller';
import { ProcessosService } from './processos.service';
import { PrismaService } from '../../database/prisma.service';
import { DatajudModule } from '../datajud/datajud.module';

@Module({
  imports: [DatajudModule],
  controllers: [ProcessosController],
  providers: [ProcessosService, PrismaService],
  exports: [ProcessosService],
})
export class ProcessosModule {}
