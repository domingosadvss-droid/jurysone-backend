import { Module } from '@nestjs/common';
import { ChavesController } from './chaves.controller';
import { ChavesService } from './chaves.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ChavesController],
  providers: [ChavesService, PrismaService],
  exports: [ChavesService],
})
export class ChavesModule {}
