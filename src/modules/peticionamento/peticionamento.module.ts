import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PeticionamentoController } from './peticionamento.controller';
import { PeticionamentoService } from './peticionamento.service';

@Module({
  imports: [ConfigModule],
  controllers: [PeticionamentoController],
  providers: [PeticionamentoService],
  exports: [PeticionamentoService],
})
export class PeticionamentoModule {}
