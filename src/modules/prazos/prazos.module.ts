import { Module } from '@nestjs/common';
import { PrazosService } from './prazos.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  providers: [PrazosService, PrismaService],
  exports: [PrazosService],
})
export class PrazosModule {}
