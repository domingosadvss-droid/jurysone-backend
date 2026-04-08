import { Module } from '@nestjs/common';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [ClientesService, PrismaService],
  exports: [ClientesService],
})
export class ClientesModule {}
