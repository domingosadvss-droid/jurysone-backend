import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PublicacoesService } from './publicacoes.service';

/** Captura do DJEN três vezes ao dia; cada rodada recupera o período desde o último sucesso (127) */
@Injectable()
export class CapturaDjenCron {
  private readonly logger = new Logger(CapturaDjenCron.name);
  private rodando = false;

  constructor(private readonly publicacoes: PublicacoesService) {}

  @Cron('0 7,12,19 * * *', { timeZone: 'America/Sao_Paulo' })
  async capturar() {
    if (process.env.DJEN_CAPTURA_DESLIGADA === 'true' || this.rodando) return;
    this.rodando = true;
    try {
      await this.publicacoes.capturarTodos();
    } catch (e: any) {
      this.logger.error(`Captura do DJEN: ${e?.message ?? e}`);
    } finally {
      this.rodando = false;
    }
  }
}
