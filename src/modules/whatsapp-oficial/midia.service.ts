/**
 * JURYSONE — Anexos do WhatsApp: guarda no armazenamento do escritório
 * (Google Drive ou disco local), em "WhatsApp/<telefone do contato>".
 * API oficial: baixa da Meta logo que o webhook chega (a URL dela vale poucos minutos).
 * WhatsApp Web: o anexo já chega baixado junto com a mensagem (guardarConteudo).
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ArquivosService } from '../arquivos/arquivos.service';
import { ConexoesWhatsappService } from './conexoes.service';

const EXTENSAO: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf',
  'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'video/mp4': '.mp4',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'application/msword': '.doc',
};

@Injectable()
export class MidiaWhatsappService {
  private readonly logger = new Logger(MidiaWhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arquivos: ArquivosService,
    private readonly conexoes: ConexoesWhatsappService,
  ) {}

  private nomeArquivo(m: { id: string; tipo: string; midiaNome: string | null; midiaMime: string | null; dataHora: Date }) {
    if (m.midiaNome) return m.midiaNome;
    const quando = m.dataHora.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const ext = EXTENSAO[String(m.midiaMime ?? '').split(';')[0]] ?? '';
    return `${m.tipo}-${quando}-${m.id.slice(0, 8)}${ext}`;
  }

  private async registrarErro(mensagemId: string, e: any) {
    this.logger.warn(`Anexo da mensagem ${mensagemId}: ${e?.message ?? e}`);
    await this.prisma.whatsappMensagemCaixa.update({ where: { id: mensagemId }, data: { erro: `Anexo não baixado: ${String(e?.message ?? e).slice(0, 300)}` } });
  }

  /** API oficial: baixa o anexo da Meta e guarda; erros ficam registrados na própria mensagem */
  async baixarEGuardar(mensagemId: string): Promise<void> {
    const m = await this.prisma.whatsappMensagemCaixa.findUnique({ where: { id: mensagemId }, include: { conversa: { include: { conexao: true } } } });
    if (!m?.midiaId || m.arquivoId) return;
    if (m.conversa.conexao.origem === 'WEB') return; // WhatsApp Web: o anexo chega junto com a mensagem
    try {
      const graph = this.conexoes.graph(m.conversa.conexao);
      const info = await graph.infoMidia(m.midiaId);
      const conteudo = await graph.baixar(info.url);
      await this.guardarConteudo(m.id, conteudo, info.mime_type ?? m.midiaMime ?? 'application/octet-stream');
    } catch (e: any) {
      await this.registrarErro(m.id, e);
    }
  }

  /** Guarda um anexo já baixado em "WhatsApp/<telefone - nome>" (lança erro se falhar) */
  async guardarConteudo(mensagemId: string, conteudo: Buffer, mime: string): Promise<void> {
    const m = await this.prisma.whatsappMensagemCaixa.findUnique({ where: { id: mensagemId }, include: { conversa: { include: { conexao: true } } } });
    if (!m || m.arquivoId) return;
    const conexao = m.conversa.conexao;
    const prov = await this.arquivos.provedor(m.escritorioId);
    let raizId = conexao.pastaRaizId;
    if (!raizId) {
      // Uma pasta por número: "WhatsApp - <dono>" (cada login conecta o próprio WhatsApp)
      const dono = conexao.usuarioId ? await this.prisma.usuario.findUnique({ where: { id: conexao.usuarioId }, select: { nome: true } }) : null;
      raizId = await prov.criarPasta(dono?.nome ? `WhatsApp - ${dono.nome}` : 'WhatsApp');
      await this.prisma.whatsappConexao.update({ where: { id: conexao.id }, data: { pastaRaizId: raizId } });
    }
    let pastaId = m.conversa.pastaArquivosId;
    if (!pastaId) {
      pastaId = await prov.criarPasta(m.conversa.nomeContato ? `${m.conversa.telefone} - ${m.conversa.nomeContato}` : m.conversa.telefone, raizId);
      await this.prisma.whatsappConversa.update({ where: { id: m.conversaId }, data: { pastaArquivosId: pastaId } });
    }
    const salvo = await prov.enviarArquivo(pastaId, this.nomeArquivo(m), mime, conteudo);
    await this.prisma.whatsappMensagemCaixa.update({
      where: { id: m.id },
      data: { arquivoId: salvo.id, arquivoTamanho: conteudo.length, midiaMime: m.midiaMime ?? mime ?? null, erro: null },
    });
  }

  provedor(escritorioId: string) {
    return this.arquivos.provedor(escritorioId);
  }

  /** Conteúdo do anexo já guardado, para a tela abrir ou baixar (só de número que o usuário pode ver) */
  async conteudo(user: { id: string; officeId: string }, mensagemId: string) {
    const m = await this.prisma.whatsappMensagemCaixa.findFirst({
      where: { id: mensagemId, escritorioId: user.officeId }, include: { conversa: { include: { conexao: true } } },
    });
    if (!m?.arquivoId || !this.conexoes.podeVer(user, m.conversa.conexao)) throw new NotFoundException('Anexo não disponível.');
    const prov = await this.arquivos.provedor(user.officeId);
    return { buffer: await prov.baixarArquivo(m.arquivoId), mime: m.midiaMime ?? 'application/octet-stream', nome: this.nomeArquivo(m) };
  }
}
