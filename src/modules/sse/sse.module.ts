import { Global, Module } from '@nestjs/common';
import { SseController } from './sse.controller';
import { SseService } from './sse.service';

/**
 * @Global() — SseService é um singleton compartilhado por toda a aplicação.
 * Apenas AppModule precisa importar SseModule.
 * Outros módulos injetam SseService diretamente no constructor, sem importar SseModule.
 */
@Global()
@Module({
  controllers: [SseController],
  providers:   [SseService],
  exports:     [SseService],
})
export class SseModule {}
