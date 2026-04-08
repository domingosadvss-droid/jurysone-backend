import { Module } from '@nestjs/common';
import { PrazosService } from './prazos.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [PrazosService, PrismaService],
  exports: [PrazosService],
})
export class PrazosModule {}
