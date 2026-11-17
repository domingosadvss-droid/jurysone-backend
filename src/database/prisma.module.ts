import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Módulo global do Prisma: uma única instância de PrismaService (e um único
 * pool de conexões) compartilhada por toda a aplicação.
 *
 * Não declare PrismaService em `providers` de outros módulos — isso cria um
 * PrismaClient novo, com pool próprio, para cada módulo. Basta injetar.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
