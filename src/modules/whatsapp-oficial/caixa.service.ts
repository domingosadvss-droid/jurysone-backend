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
import { ORIGEM_WEB, WhatsappWebService } from './whatsapp-web.service';

const JANELA_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CaixaWhatsappService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conexoes: ConexoesWhatsappService,
    private readonly registro: RegistroMensagensService,
    private readonly web: WhatsappWebService,
  ) {}

  private janelaAberta(ultimaEntradaEm: Date | null) {
    return !!ultimaEntradaEm && Date.now() - ultimaEntradaEm.getTime() < JANELA_MS;
  }

  async conversas(user: any, q: any = {}) {
    const busca = String(q?.busca ?? '').trim();
    const web = (await this.conexoes.doEscritorio(user.officeId))?.origem === ORIGEM_WEB;
    const lista = await this.prisma.whatsappConversa.findMany({
      where: {
        escritorioId: user.officeId,
        ...(busca ? { OR: [{ nomeContato: { contains: busca, mode: 'insensitive' } }, { telefone: { contains: busca.replace(/\D/g, '') || busca } }] } : {}),
      },
      orderBy: { ultimaMensagemEm: { sort: 'desc', nulls: 'last' } },
      take: 200,
      include: { mensagens: { orderBy: { dataHora: 'desc' }, take: 1, select: { texto: true, tipo: true, direcao: true, dataHora: true } } },
    });
    return lista.map(({ mensagens, ...c }) => ({ ...c, ultima: mensagens[0] ?? null, janelaAberta: web || this.janelaAberta(c.ultimaEntradaEm) }));
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
    const web = conexao.origem === ORIGEM_WEB;
    return { conversa: { ...conversa, modo: web ? 'WEB' : 'OFICIAL', janelaAberta: web || this.janelaAberta(c.ultimaEntradaEm) }, mensagens: mensagens.reverse() };
  }

  async enviarTexto(user: any, conversaId: string, dto: any) {
    const c = await this.conversaDoEscritorio(user, conversaId);
    const enviada = await this.entregar(c, dto?.texto, 'JURYSONE', user.id);
    // O advogado assumiu a conversa: o atendimento automático para de responder nela
    if (c.iaStatus !== 'PAUSADA') {
      await this.prisma.whatsappConversa.update({ where: { id: c.id }, data: { iaStatus: 'PAUSADA' } });
    }
    return enviada;
  }

  /**
   * Envio feito pelo próprio sistema (atendimento automático). `simular` grava a mensagem na
   * caixa como "simulada" sem mandar nada ao WhatsApp (testes com IA_ATENDIMENTO_SIMULADO).
   */
  async enviarTextoSistema(conversaId: string, texto: string, opcoes: { simular?: boolean } = {}) {
    const c = await this.prisma.whatsappConversa.findUnique({ where: { id: conversaId }, include: { conexao: true } });
    if (!c) throw new NotFoundException('Conversa não encontrada.');
    if (opcoes.simular) {
      return this.registro.registrar({
        conexao: c.conexao, telefone: c.telefone, wamid: null, direcao: 'SAIDA', origem: 'IA',
        conteudo: { tipo: 'text', texto: String(texto).trim(), midiaId: null, midiaMime: null, midiaNome: null },
        status: 'simulada', dataHora: new Date(), enviadaPorId: null,
      });
    }
    return this.entregar(c, texto, 'IA', null);
  }

  private async entregar(c: any, textoBruto: any, origem: 'JURYSONE' | 'IA', enviadaPorId: string | null) {
    const texto = String(textoBruto ?? '').trim();
    if (!texto) throw new BadRequestException('Escreva a mensagem.');
    if (texto.length > 4096) throw new BadRequestException('Mensagem acima de 4.096 caracteres (limite do WhatsApp).');
    if (!c.conexao.ativo) throw new BadRequestException('O WhatsApp deste escritório está desconectado.');
    if (c.conexao.origem === ORIGEM_WEB) {
      // WhatsApp Web (testes): sem janela de 24 h; envia pelo aparelho conectado
      let id: string;
      try { id = await this.web.enviarTexto(c.escritorioId, c.telefone, texto); }
      catch (e: any) {
        if (e instanceof BadRequestException) throw e;
        throw new BadGatewayException(`O WhatsApp recusou o envio. ${e?.message ?? e}`);
      }
      return this.registro.registrar({
        conexao: c.conexao, telefone: c.telefone, wamid: id, direcao: 'SAIDA', origem,
        conteudo: { tipo: 'text', texto, midiaId: null, midiaMime: null, midiaNome: null }, status: 'enviada', dataHora: new Date(), enviadaPorId,
      });
    }
    if (!this.janelaAberta(c.ultimaEntradaEm)) {
      throw new BadRequestException('Passaram 24 h desde a última mensagem do contato: a Meta só permite enviar um modelo aprovado.');
    }
    const graph = this.conexoes.graph(c.conexao);
    let wamid: string;
    try {
      wamid = await graph.enviarTexto(c.conexao.phoneNumberId, c.telefone, texto);
    } catch (e: any) {
      // Celular brasileiro: a Meta identifica alguns números sem o 9 extra (55 + DDD + 8 dígitos).
      // A lista de destinatários do número de TESTE compara o número exato (erro 131030): tenta com o 9.
      const comNove = /^55\d{2}[6-9]\d{7}$/.test(c.telefone) ? c.telefone.slice(0, 4) + '9' + c.telefone.slice(4) : null;
      if (e instanceof ErroGraph && e.codigo === 131030 && comNove) {
        try { wamid = await graph.enviarTexto(c.conexao.phoneNumberId, comNove, texto); }
        catch (e2: any) { throw new BadGatewayException(`O WhatsApp recusou o envio. ${e2?.message ?? e2}`); }
      } else if (e instanceof ErroGraph) {
        throw new BadGatewayException(`O WhatsApp recusou o envio. ${e.message}`);
      } else throw e;
    }
    return this.registro.registrar({
      conexao: c.conexao, telefone: c.telefone, wamid: wamid ?? null, direcao: 'SAIDA', origem,
      conteudo: { tipo: 'text', texto, midiaId: null, midiaMime: null, midiaNome: null }, status: 'enviada', dataHora: new Date(), enviadaPorId,
    });
  }
}
