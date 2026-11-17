import { Module } from '@nestjs/common';
import { IntimacoesController } from './intimacoes.controller';
import { IntimacoesService } from './intimacoes.service';
import { PublicacoesModule } from '../publicacoes/publicacoes.module';

@Module({
  imports: [PublicacoesModule],
  controllers: [IntimacoesController],
  providers: [IntimacoesService],
  exports: [IntimacoesService],
})
export class IntimacoesModule {}
