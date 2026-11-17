import { Module } from '@nestjs/common';
import { LinhaProducaoController } from './linha-producao.controller';
import { LinhaProducaoService } from './linha-producao.service';

@Module({
  controllers: [LinhaProducaoController],
  providers: [LinhaProducaoService],
  exports: [LinhaProducaoService],
})
export class LinhaProducaoModule {}
