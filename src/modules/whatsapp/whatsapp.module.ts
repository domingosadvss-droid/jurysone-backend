import { Module, forwardRef } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [forwardRef(() => AiModule)],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
