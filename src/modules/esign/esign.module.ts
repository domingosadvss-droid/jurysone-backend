import { Module } from '@nestjs/common';
import { EsignController } from './esign.controller';
import { EsignService } from './esign.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [EsignController],
  providers: [EsignService, PrismaService],
  exports: [EsignService],
})
export class EsignModule {}
