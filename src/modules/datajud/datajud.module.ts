import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatajudController } from './datajud.controller';
import { DatajudService } from './datajud.service';
import { PrismaService } from '../../database/prisma.service';
import { AutomacoesModule } from '../automacoes/automacoes.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    forwardRef(() => AutomacoesModule),
  ],
  controllers: [DatajudController],
  providers: [DatajudService, PrismaService],
  exports: [DatajudService],
})
export class DatajudModule {}
