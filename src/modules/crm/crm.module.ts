import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [CrmController],
  providers: [CrmService, PrismaService],
  exports: [CrmService],
})
export class CrmModule {}
