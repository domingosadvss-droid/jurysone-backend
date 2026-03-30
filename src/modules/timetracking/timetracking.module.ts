import { Module } from '@nestjs/common';
import { TimetrackingController } from './timetracking.controller';
import { TimetrackingService } from './timetracking.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [TimetrackingController],
  providers: [TimetrackingService, PrismaService],
  exports: [TimetrackingService],
})
export class TimetrackingModule {}
