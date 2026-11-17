import { Module } from '@nestjs/common';
import { ConflitosController } from './conflitos.controller';
import { ConflitosService } from './conflitos.service';

@Module({
  controllers: [ConflitosController],
  providers: [ConflitosService],
  exports: [ConflitosService],
})
export class ConflitosModule {}
