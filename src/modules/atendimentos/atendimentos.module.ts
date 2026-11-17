import { Module } from '@nestjs/common';
import { AtendimentosController } from './atendimentos.controller';
import { AtendimentosService } from './atendimentos.service';
import { AsaasModule } from '../asaas/asaas.module';
import { EsignModule } from '../esign/esign.module';

@Module({
  imports:     [AsaasModule, EsignModule],
  controllers: [AtendimentosController],
  providers:   [AtendimentosService],
  exports:     [AtendimentosService],
})
export class AtendimentosModule {}
