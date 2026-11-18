/**
 * JURYSONE — Grava mensagens na caixa: encontra (ou cria) a conversa do contato e
 * guarda a mensagem sem duplicar (a Meta pode reenviar o mesmo webhook).
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConteudoMensagem } from './conteudo-mensagem';

export interface NovaMensagem {
  conexao: { id: string; escritorioId: string };
  telefone: string;
  nomeContato?: string | null;
  wamid: string | null;
  direcao: 'ENTRADA' | 'SAIDA';
  origem: 'CLIENTE' | 'JURYSONE' | 'CELULAR' | 'HISTORICO';
  conteudo: ConteudoMensagem;
  status: string;
  dataHora: Date;
  enviadaPorId?: string | null;
}

@Injectable()
export class RegistroMensagensService {
  constructor(private readonly prisma: PrismaService) {}

  async conversa(conexao: { id: string; escritorioId: string }, telefone: string, nomeContato?: string | null) {
    return this.prisma.whatsappConversa.upsert({
      where: { conexaoId_telefone: { conexaoId: conexao.id, telefone } },
      create: { escritorioId: conexao.escritorioId, conexaoId: conexao.id, telefone, nomeContato: nomeContato ?? null },
      update: nomeContato ? { nomeContato } : {},
    });
  }

  /** Devolve a mensagem gravada, ou null se ela já existia (webhook repetido) */
  async registrar(m: NovaMensagem) {
    if (m.wamid && (await this.prisma.whatsappMensagemCaixa.findUnique({ where: { wamid: m.wamid } }))) return null;
    const conversa = await this.conversa(m.conexao, m.telefone, m.nomeContato);
    const mensagem = await this.prisma.whatsappMensagemCaixa.create({
      data: {
        escritorioId: m.conexao.escritorioId, conversaId: conversa.id, wamid: m.wamid, direcao: m.direcao, origem: m.origem,
        tipo: m.conteudo.tipo, texto: m.conteudo.texto, midiaId: m.conteudo.midiaId, midiaMime: m.conteudo.midiaMime,
        midiaNome: m.conteudo.midiaNome, status: m.status, dataHora: m.dataHora, enviadaPorId: m.enviadaPorId ?? null,
      },
    });
    const entrada = m.direcao === 'ENTRADA';
    await this.prisma.whatsappConversa.update({
      where: { id: conversa.id },
      data: {
        ultimaMensagemEm: !conversa.ultimaMensagemEm || m.dataHora > conversa.ultimaMensagemEm ? m.dataHora : undefined,
        ...(entrada && (!conversa.ultimaEntradaEm || m.dataHora > conversa.ultimaEntradaEm) ? { ultimaEntradaEm: m.dataHora } : {}),
        ...(entrada && m.origem === 'CLIENTE' ? { naoLidas: { increment: 1 } } : {}),
      },
    });
    return mensagem;
  }

  async atualizarStatus(wamid: string, status: string, erro?: string | null) {
    await this.prisma.whatsappMensagemCaixa.updateMany({ where: { wamid }, data: { status, ...(erro ? { erro } : {}) } });
  }
}
