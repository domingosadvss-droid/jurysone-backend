import { Module } from '@nestjs/common';
import { RelatoriosController } from './relatorios.controller';

@Module({
  controllers: [RelatoriosController],
  providers: [],
})
export class RelatoriosModule {}
