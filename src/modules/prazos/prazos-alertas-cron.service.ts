/**
 * Cron de alertas de prazos processuais — JurysOne
 *
 * Roda todo dia às 07:00 (horário de Brasília) e cria notificações
 * no banco para prazos que vencem em 1, 3 e 7 dias — além dos que
 * vencem no próprio dia.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type Urgencia = 'hoje' | 'amanha' | '3dias' | '7dias';

@Injectable()
export class PrazosAlertasCronService {
  private readonly logger = new Logger(PrazosAlertasCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *', {
    name: 'prazos-alertas-diarios',
    timeZone: 'America/Sao_Paulo',
  })
  async verificarPrazos(): Promise<void> {
    this.logger.log('⏰ CRON Prazos — iniciando verificação de alertas...');

    const agora = new Date();
    agora.setHours(0, 0, 0, 0);

    const d1 = this.addDias(agora, 1);
    const d2 = this.addDias(agora, 2);
    const d3 = this.addDias(agora, 3);
    const d4 = this.addDias(agora, 4);
    const d7 = this.addDias(agora, 7);
    const d8 = this.addDias(agora, 8);

    const include = {
      processo: {
        select: {
          id: true,
          numero: true,
          responsavelId: true,
          escritorioId: true,
        },
      },
    };

    const [hoje, amanha, tresD, seteD] = await Promise.all([
      this.prisma.prazo.findMany({
        where: { dataPrazo: { gte: agora, lt: d1 }, status: 'pendente', deletedAt: null },
        include,
      }),
      this.prisma.prazo.findMany({
        where: { dataPrazo: { gte: d1, lt: d2 }, status: 'pendente', deletedAt: null },
        include,
      }),
      this.prisma.prazo.findMany({
        where: { dataPrazo: { gte: d2, lt: d4 }, status: 'pendente', deletedAt: null },
        include,
      }),
      this.prisma.prazo.findMany({
        where: { dataPrazo: { gte: d4, lt: d8 }, status: 'pendente', deletedAt: null },
        include,
      }),
    ]);

    let criados = 0;
    let erros = 0;

    const processar = async (lista: any[], urgencia: Urgencia) => {
      for (const prazo of lista) {
        const responsavelId = prazo.processo?.responsavelId;
        const escritorioId = prazo.processo?.escritorioId ?? prazo.escritorioId;

        if (!responsavelId || !escritorioId) continue;

        const labels: Record<Urgencia, string> = {
          hoje:  'HOJE',
          amanha: 'AMANHÃ',
          '3dias': 'em 2-3 dias',
          '7dias': 'em até 7 dias',
        };

        const prioridades: Record<Urgencia, string> = {
          hoje:   'high',
          amanha: 'high',
          '3dias': 'normal',
          '7dias': 'low',
        };

        try {
          await this.notifications.create({
            tipo: 'prazo_urgente',
            titulo: `⚠️ Prazo vence ${labels[urgencia]}`,
            mensagem: `${prazo.descricao} — Processo: ${prazo.processo?.numero ?? 'N/A'}`,
            dados: { prazoId: prazo.id, processoId: prazo.processoId },
            link: prazo.processoId ? `/processos/${prazo.processoId}` : '/prazos',
            prioridade: prioridades[urgencia],
            usuarioId: responsavelId,
            escritorioId,
          });
          criados++;
        } catch (err: any) {
          erros++;
          this.logger.warn(`Erro ao criar alerta (prazo ${prazo.id}): ${err.message}`);
        }
      }
    };

    await processar(hoje,  'hoje');
    await processar(amanha, 'amanha');
    await processar(tresD, '3dias');
    await processar(seteD, '7dias');

    this.logger.log(
      `✅ CRON Prazos — ${criados} alertas criados, ${erros} erros ` +
      `(hoje: ${hoje.length}, amanhã: ${amanha.length}, ` +
      `3d: ${tresD.length}, 7d: ${seteD.length})`,
    );
  }

  private addDias(base: Date, n: number): Date {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  }
}
