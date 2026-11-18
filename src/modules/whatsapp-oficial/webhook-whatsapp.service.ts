/**
 * JURYSONE — Webhook da API oficial do WhatsApp.
 * Campos tratados (assinatura do app na Meta):
 *   messages            mensagens recebidas do contato e status das enviadas (sent/delivered/read/failed)
 *   smb_message_echoes  coexistência: mensagens que o escritório enviou pelo app do celular
 *   history             coexistência: histórico de até 180 dias, enviado uma vez após a conexão
 *   smb_app_state_sync  coexistência: nomes dos contatos salvos no celular
 * O webhook responde rápido; os anexos são baixados em seguida, sem segurar a resposta.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConexoesWhatsappService } from './conexoes.service';
import { RegistroMensagensService } from './registro-mensagens.service';
import { MidiaWhatsappService } from './midia.service';
import { conteudoDe, dataDaMeta, soDigitos, statusDaMeta } from './conteudo-mensagem';

type Conexao = NonNullable<Awaited<ReturnType<ConexoesWhatsappService['porPhoneNumberId']>>>;

@Injectable()
export class WebhookWhatsappService {
  private readonly logger = new Logger(WebhookWhatsappService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conexoes: ConexoesWhatsappService,
    private readonly registro: RegistroMensagensService,
    private readonly midia: MidiaWhatsappService,
  ) {}

  async processar(payload: any): Promise<{ recebidas: number }> {
    const comMidia: string[] = [];
    let recebidas = 0;
    for (const entrada of payload?.entry ?? []) {
      for (const mudanca of entrada?.changes ?? []) {
        const v = mudanca?.value ?? {};
        const conexao = await this.conexoes.porPhoneNumberId(String(v?.metadata?.phone_number_id ?? ''));
        if (!conexao) {
          this.logger.warn(`Webhook para número não conectado (${v?.metadata?.phone_number_id ?? '?'}) — ignorado.`);
          continue;
        }
        if (mudanca.field === 'messages') recebidas += await this.mensagens(conexao, v, comMidia);
        else if (mudanca.field === 'smb_message_echoes') recebidas += await this.ecos(conexao, v, comMidia);
        else if (mudanca.field === 'history') recebidas += await this.historico(conexao, v, comMidia);
        else if (mudanca.field === 'smb_app_state_sync') await this.contatos(conexao, v);
      }
    }
    // Baixa os anexos depois de responder à Meta (a URL dela vale poucos minutos)
    setImmediate(() => {
      (async () => { for (const id of comMidia) await this.midia.baixarEGuardar(id); })()
        .catch((e) => this.logger.error(`Anexos: ${e?.message ?? e}`));
    });
    return { recebidas };
  }

  private async guardar(conexao: Conexao, comMidia: string[], dados: Parameters<RegistroMensagensService['registrar']>[0]) {
    const m = await this.registro.registrar(dados);
    if (m?.midiaId) comMidia.push(m.id);
    return m ? 1 : 0;
  }

  /** Mensagens recebidas do contato + status das mensagens enviadas */
  private async mensagens(conexao: Conexao, v: any, comMidia: string[]) {
    const nomes = new Map<string, string>((v.contacts ?? []).map((c: any) => [soDigitos(c?.wa_id), c?.profile?.name]));
    let n = 0;
    for (const msg of v.messages ?? []) {
      const telefone = soDigitos(msg.from);
      n += await this.guardar(conexao, comMidia, {
        conexao, telefone, nomeContato: nomes.get(telefone) ?? null, wamid: msg.id ?? null, direcao: 'ENTRADA', origem: 'CLIENTE',
        conteudo: conteudoDe(msg), status: 'recebida', dataHora: dataDaMeta(msg.timestamp),
      });
    }
    for (const s of v.statuses ?? []) {
      const status = statusDaMeta(s.status);
      if (s.id && status) await this.registro.atualizarStatus(s.id, status, s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? null);
    }
    return n;
  }

  /** Coexistência: o escritório respondeu pelo app do celular — entra na caixa como saída */
  private async ecos(conexao: Conexao, v: any, comMidia: string[]) {
    let n = 0;
    for (const msg of v.message_echoes ?? []) {
      n += await this.guardar(conexao, comMidia, {
        conexao, telefone: soDigitos(msg.to), wamid: msg.id ?? null, direcao: 'SAIDA', origem: 'CELULAR',
        conteudo: conteudoDe(msg), status: 'enviada', dataHora: dataDaMeta(msg.timestamp),
      });
    }
    return n;
  }

  /** Coexistência: histórico (até 180 dias), em blocos; marca a conexão quando chega ao fim */
  private async historico(conexao: Conexao, v: any, comMidia: string[]) {
    const numeroEscritorio = soDigitos(v?.metadata?.display_phone_number);
    let n = 0;
    for (const bloco of v.history ?? []) {
      for (const conversa of bloco?.threads ?? []) {
        const contato = soDigitos(conversa.id);
        for (const msg of conversa.messages ?? []) {
          const doEscritorio = soDigitos(msg.from) === numeroEscritorio || (msg.from && soDigitos(msg.from) !== contato);
          n += await this.guardar(conexao, comMidia, {
            conexao, telefone: contato, wamid: msg.id ?? null, direcao: doEscritorio ? 'SAIDA' : 'ENTRADA', origem: 'HISTORICO',
            conteudo: conteudoDe(msg), status: doEscritorio ? 'enviada' : 'recebida', dataHora: dataDaMeta(msg.timestamp),
          });
        }
      }
      if (Number(bloco?.metadata?.progress) >= 100) {
        await this.prisma.whatsappConexao.update({ where: { id: conexao.id }, data: { historicoImportadoEm: new Date(), coexistencia: true } });
      }
    }
    return n;
  }

  /** Coexistência: nomes dos contatos salvos no celular */
  private async contatos(conexao: Conexao, v: any) {
    for (const item of v.state_sync ?? []) {
      const tel = soDigitos(item?.contact?.phone_number);
      const nome = item?.contact?.full_name;
      if (item?.type === 'contact' && item?.action !== 'remove' && tel && nome) await this.registro.conversa(conexao, tel, nome);
    }
  }
}
