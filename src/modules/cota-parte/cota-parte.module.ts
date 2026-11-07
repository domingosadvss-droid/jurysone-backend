import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CotaParteController } from './cota-parte.controller';
import { CotaParteService } from './cota-parte.service';

@Module({
  controllers: [CotaParteController],
  providers: [CotaParteService, PrismaService],
  exports: [CotaParteService],
})
export class CotaParteModule {}
