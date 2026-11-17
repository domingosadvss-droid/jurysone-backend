import { Module } from '@nestjs/common';
import { ArquivosModule } from '../arquivos/arquivos.module';
import { ChavesModule } from '../chaves/chaves.module';
import { PublicacoesModule } from '../publicacoes/publicacoes.module';
import { CalculosController } from './calculos.controller';
import { CalculosService } from './calculos.service';
import { IndicesService } from './indices.service';

@Module({
  imports: [ArquivosModule, ChavesModule, PublicacoesModule],
  controllers: [CalculosController],
  providers: [CalculosService, IndicesService],
  exports: [CalculosService, IndicesService],
})
export class CalculosModule {}
