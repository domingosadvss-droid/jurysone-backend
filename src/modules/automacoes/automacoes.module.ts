import { Module, forwardRef } from '@nestjs/common';
import { AutomacoesController } from './automacoes.controller';
import { AutomacoesService } from './automacoes.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [AutomacoesController],
  providers: [AutomacoesService, PrismaService],
  exports: [AutomacoesService],
})
export class AutomacoesModule {}
