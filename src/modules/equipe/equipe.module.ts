import { Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { EquipeController } from './equipe.controller';
import { EquipeService } from './equipe.service';

@Module({
  controllers: [EquipeController],
  providers: [EquipeService, PrismaService],
})
export class EquipeModule {}
