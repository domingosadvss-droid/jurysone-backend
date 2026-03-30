import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';

@Module({
  controllers: [DashboardController],
  providers: [],
})
export class DashboardModule {}
