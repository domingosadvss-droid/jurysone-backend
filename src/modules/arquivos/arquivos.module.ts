import { Module } from '@nestjs/common';
import { ArquivosController, DriveCallbackController } from './arquivos.controller';
import { ArquivosService } from './arquivos.service';

@Module({
  controllers: [ArquivosController, DriveCallbackController],
  providers: [ArquivosService],
  exports: [ArquivosService],
})
export class ArquivosModule {}
