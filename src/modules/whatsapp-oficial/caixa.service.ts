/**
 * JURYSONE — Caixa de conversas do WhatsApp (o que a tela mostra e o que o advogado envia).
 * Regra da Meta: texto livre só até 24 h depois da última mensagem do contato;
 * fora disso, só modelo aprovado (fica para a etapa de modelos).
 */
import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConexoesWhatsappService } from './conexoes.service';
import { ErroGraph } from './graph-cliente';
import { RegistroMensagensService } from './registro-mensagens.service';

const JANELA_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CaixaWhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conexoes: ConexoesWhatsappService,
    private readonly registro: RegistroMensagensService,
  ) {}

  private janelaAberta(ultimaEntradaEm: Date | null) {
    return !!ultimaEntradaEm && Date.now() - ultimaEntradaEm.getTime() < JANELA_MS;
  }

  async conversas(user: any, q: any = {}) {
    const busca = String(q?.busca ?? '').trim();
    const lista = await this.prisma.whatsappConversa.findMany({
      where: {
        escritorioId: user.officeId,
        ...(busca ? { OR: [{ nomeContato: { contains: busca, mode: 'insensitive' } }, { telefone: { contains: busca.replace(/\D/g, '') || busca } }] } : {}),
      },
      orderBy: { ultimaMensagemEm: { sort: 'desc', nulls: 'last' } },
      take: 200,
      include: { mensagens: { orderBy: { dataHora: 'desc' }, take: 1, select: { texto: true, tipo: true, direcao: true, dataHora: true } } },
    });
    return lista.map(({ mensagens, ...c }) => ({ ...c, ultima: mensagens[0] ?? null, janelaAberta: this.janelaAberta(c.ultimaEntradaEm) }));
  }

  private async conversaDoEscritorio(user: any, id: string) {
    const c = await this.prisma.whatsappConversa.findFirst({ where: { id, escritorioId: user.officeId }, include: { conexao: true } });
    if (!c) throw new NotFoundException('Conversa não encontrada.');
    return c;
  }

  /** Mensagens da conversa (mais antigas primeiro) e zera o contador de não lidas */
  async mensagens(user: any, conversaId: string, q: any = {}) {
    const c = await this.conversaDoEscritorio(user, conversaId);
    const limite = Math.min(500, Math.max(1, Number(q?.limite ?? 200)));
    const mensagens = await this.prisma.whatsappMensagemCaixa.findMany({ where: { conversaId: c.id }, orderBy: { dataHora: 'desc' }, take: limite });
    if (c.naoLidas) await this.prisma.whatsappConversa.update({ where: { id: c.id }, data: { naoLidas: 0 } });
    const { conexao, ...conversa } = c;
    return { conversa: { ...conversa, janelaAberta: this.janelaAberta(c.ultimaEntradaEm) }, mensagens: mensagens.reverse() };
  }

  async enviarTexto(user: any, conversaId: string, dto: any) {
    const texto = String(dto?.texto ?? '').trim();
    if (!texto) throw new BadRequestException('Escreva a mensagem.');
    if (texto.length > 4096) throw new BadRequestException('Mensagem acima de 4.096 caracteres (limite do WhatsApp).');
    const c = await this.conversaDoEscritorio(user, conversaId);
    if (!c.conexao.ativo) throw new BadRequestException('O WhatsApp deste escritório está desconectado.');
    if (!this.janelaAberta(c.ultimaEntradaEm)) {
      throw new BadRequestException('Passaram 24 h desde a última mensagem do contato: a Meta só permite enviar um modelo aprovado.');
    }
    let wamid: string;
    try {
      wamid = await this.conexoes.graph(c.conexao).enviarTexto(c.conexao.phoneNumberId, c.telefone, texto);
    } catch (e: any) {
      if (e instanceof ErroGraph) throw new BadGatewayException(`O WhatsApp recusou o envio. ${e.message}`);
      throw e;
    }
    return this.registro.registrar({
      conexao: c.conexao, telefone: c.telefone, wamid: wamid ?? null, direcao: 'SAIDA', origem: 'JURYSONE',
      conteudo: { tipo: 'text', texto, midiaId: null, midiaMime: null, midiaNome: null }, status: 'enviada', dataHora: new Date(), enviadaPorId: user.id,
    });
  }
}
