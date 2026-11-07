import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ArquivosController, DriveCallbackController } from './arquivos.controller';
import { ArquivosService } from './arquivos.service';

@Module({
  controllers: [ArquivosController, DriveCallbackController],
  providers: [ArquivosService, PrismaService],
  exports: [ArquivosService],
})
export class ArquivosModule {}
