import { Module } from '@nestjs/common';
import { ModelosController } from './modelos.controller';

@Module({
  controllers: [ModelosController],
  providers: [],
})
export class ModelosModule {}
