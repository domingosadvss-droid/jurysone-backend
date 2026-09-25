import { Module } from '@nestjs/common';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [ClientesController],
  providers:   [ClientesService, PrismaService],
  exports:     [ClientesService],
})
export class ClientesModule {}
