import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiCopilotController } from './ai-copilot.controller';
import { AiCopilotService } from './ai-copilot.service';
import { AiService } from './ai.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChavesModule } from '../chaves/chaves.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => NotificationsModule),
    ChavesModule,
  ],
  controllers: [AiCopilotController],
  providers: [AiCopilotService, AiService, PrismaService],
  exports: [AiCopilotService, AiService],
})
export class AiModule {}
