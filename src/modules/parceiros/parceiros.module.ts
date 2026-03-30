import { Module } from '@nestjs/common';
import { ParceirosController } from './parceiros.controller';
import { ParceirosService } from './parceiros.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ParceirosController],
  providers: [ParceirosService, PrismaService],
  exports: [ParceirosService],
})
export class ParceirosModule {}
