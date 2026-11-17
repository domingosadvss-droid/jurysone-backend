import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatajudController } from './datajud.controller';
import { DatajudService } from './datajud.service';
import { AutomacoesModule } from '../automacoes/automacoes.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    forwardRef(() => AutomacoesModule),
  ],
  controllers: [DatajudController],
  providers: [DatajudService],
  exports: [DatajudService],
})
export class DatajudModule {}
