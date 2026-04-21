import { Module } from '@nestjs/common';
import { AsaasService } from './asaas.service';
import { ChavesModule } from '../chaves/chaves.module';

@Module({
  imports:  [ChavesModule],
  providers: [AsaasService],
  exports:   [AsaasService],
})
export class AsaasModule {}
