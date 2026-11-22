import { Global, Module } from '@nestjs/common';
import { ChavesModule } from '../chaves/chaves.module';
import { IaUsoController } from './ia-uso.controller';
import { IaUsoService } from './ia-uso.service';

/** Global: qualquer módulo que chama o Claude injeta o IaUsoService */
@Global()
@Module({
  imports: [ChavesModule],
  controllers: [IaUsoController],
  providers: [IaUsoService],
  exports: [IaUsoService],
})
export class IaUsoModule {}
