import { Module } from '@nestjs/common';
import { CotaParteController } from './cota-parte.controller';
import { CotaParteService } from './cota-parte.service';

@Module({
  controllers: [CotaParteController],
  providers: [CotaParteService],
  exports: [CotaParteService],
})
export class CotaParteModule {}
