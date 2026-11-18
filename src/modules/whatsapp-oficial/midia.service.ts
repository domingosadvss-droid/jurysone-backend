/**
 * JURYSONE — Anexos do WhatsApp: baixa da Meta e guarda no armazenamento do escritório
 * (Google Drive ou disco local), em "WhatsApp/<telefone do contato>".
 * A URL da Meta vale poucos minutos, por isso o download acontece logo que o webhook chega.
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

  /** Baixa e guarda o anexo de uma mensagem; erros ficam registrados na própria mensagem */
  async baixarEGuardar(mensagemId: string): Promise<void> {
    const m = await this.prisma.whatsappMensagemCaixa.findUnique({ where: { id: mensagemId }, include: { conversa: { include: { conexao: true } } } });
    if (!m?.midiaId || m.arquivoId) return;
    const conexao = m.conversa.conexao;
    try {
      const graph = this.conexoes.graph(conexao);
      const info = await graph.infoMidia(m.midiaId);
      const conteudo = await graph.baixar(info.url);
      const prov = await this.arquivos.provedor(m.escritorioId);
      let raizId = conexao.pastaRaizId;
      if (!raizId) {
        raizId = await prov.criarPasta('WhatsApp');
        await this.prisma.whatsappConexao.update({ where: { id: conexao.id }, data: { pastaRaizId: raizId } });
      }
      let pastaId = m.conversa.pastaArquivosId;
      if (!pastaId) {
        pastaId = await prov.criarPasta(m.conversa.nomeContato ? `${m.conversa.telefone} - ${m.conversa.nomeContato}` : m.conversa.telefone, raizId);
        await this.prisma.whatsappConversa.update({ where: { id: m.conversaId }, data: { pastaArquivosId: pastaId } });
      }
      const salvo = await prov.enviarArquivo(pastaId, this.nomeArquivo(m), info.mime_type ?? m.midiaMime ?? 'application/octet-stream', conteudo);
      await this.prisma.whatsappMensagemCaixa.update({
        where: { id: m.id },
        data: { arquivoId: salvo.id, arquivoTamanho: conteudo.length, midiaMime: m.midiaMime ?? info.mime_type ?? null, erro: null },
      });
    } catch (e: any) {
      this.logger.warn(`Anexo da mensagem ${m.id}: ${e?.message ?? e}`);
      await this.prisma.whatsappMensagemCaixa.update({ where: { id: m.id }, data: { erro: `Anexo não baixado: ${String(e?.message ?? e).slice(0, 300)}` } });
    }
  }

  /** Conteúdo do anexo já guardado, para a tela abrir ou baixar */
  async conteudo(escritorioId: string, mensagemId: string) {
    const m = await this.prisma.whatsappMensagemCaixa.findFirst({ where: { id: mensagemId, escritorioId } });
    if (!m?.arquivoId) throw new NotFoundException('Anexo não disponível.');
    const prov = await this.arquivos.provedor(escritorioId);
    return { buffer: await prov.baixarArquivo(m.arquivoId), mime: m.midiaMime ?? 'application/octet-stream', nome: this.nomeArquivo(m) };
  }
}
