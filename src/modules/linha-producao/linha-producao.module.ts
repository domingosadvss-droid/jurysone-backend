import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { LinhaProducaoController } from './linha-producao.controller';
import { LinhaProducaoService } from './linha-producao.service';

@Module({
  controllers: [LinhaProducaoController],
  providers: [LinhaProducaoService, PrismaService],
  exports: [LinhaProducaoService],
})
export class LinhaProducaoModule {}
