import { Module } from '@nestjs/common';
import { WhatsappOficialModule } from '../whatsapp-oficial/whatsapp-oficial.module';
import { CatalogoModule } from '../catalogo/catalogo.module';
import { AtendimentoIaController } from './atendimento-ia.controller';
import { AtendimentoIaService } from './atendimento-ia.service';
import { AprendizadoAtendimentoService } from './aprendizado.service';

/** Atendimento automático do WhatsApp com IA (IaUsoService vem do módulo global de uso de IA) */
@Module({
  imports: [WhatsappOficialModule, CatalogoModule],
  controllers: [AtendimentoIaController],
  providers: [AtendimentoIaService, AprendizadoAtendimentoService],
})
export class AtendimentoIaModule {}
