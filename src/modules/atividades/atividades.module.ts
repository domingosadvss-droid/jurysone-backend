import { Module } from '@nestjs/common';
import { AtividadesController } from './atividades.controller';

@Module({
  controllers: [AtividadesController],
  providers: [],
})
export class AtividadesModule {}
