import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PeticionamentoController } from './peticionamento.controller';
import { PeticionamentoService } from './peticionamento.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [PeticionamentoController],
  providers: [PeticionamentoService, PrismaService],
  exports: [PeticionamentoService],
})
export class PeticionamentoModule {}
