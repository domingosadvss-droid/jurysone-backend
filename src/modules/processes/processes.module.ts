import { Module } from '@nestjs/common';
import { ProcessesService } from './processes.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [ProcessesService, PrismaService],
  exports: [ProcessesService],
})
export class ProcessesModule {}
