import { Module } from '@nestjs/common';
import { FinanceiroController } from './financeiro.controller';
import { FinanceiroService } from './financeiro.service';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [FinanceiroController],
  providers: [FinanceiroService, PrismaService],
  exports: [FinanceiroService],
})
export class FinanceiroModule {}
