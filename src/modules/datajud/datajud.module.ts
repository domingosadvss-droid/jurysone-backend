import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatajudController } from './datajud.controller';
import { DatajudService } from './datajud.service';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [
    // Garante acesso às variáveis de ambiente (DATAJUD_API_KEY, DATAJUD_BASE_URL)
    ConfigModule,
    // Habilita decoradores @Cron neste módulo
    ScheduleModule.forRoot(),
  ],
  controllers: [DatajudController],
  providers: [DatajudService, PrismaService],
  exports: [DatajudService],
})
export class DatajudModule {}
