/**
 * JURYSONE — WhatsApp pelo WhatsApp Web (QR Code), modo de TESTES.
 *
 * O número entra como "aparelho conectado" (igual ao WhatsApp Web no navegador)
 * e as conversas vão para a mesma caixa da API oficial (tabelas whatsapp_conversas / mensagens).
 * Usa a biblioteca não oficial Baileys: o WhatsApp pode bloquear o número. Use um número
 * secundário nos testes; em produção, a conexão definitiva é a API oficial da Meta.
 *
 * Cada LOGIN conecta o próprio número (22/11/2026): uma sessão por usuário, em
 * <pasta>/<escritório>/u_<usuário>. A sessão é retomada sozinha quando o servidor reinicia —
 * não precisa ler o QR Code de novo.
 */
import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  ALL_WA_PATCH_NAMES, Browsers, Contact, DisconnectReason, WAMessage, downloadMediaMessage, fetchLatestBaileysVersion, generateMessageIDV2,
  getContentType, isJidBroadcast, isJidGroup, isJidNewsletter, makeCacheableSignalKeyStore, normalizeMessageContent,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { PrismaService } from '../../database/prisma.service';
import { ConteudoMensagem } from './conteudo-mensagem';
import { AgendaSalva, chaveTelefone } from './filtro-contatos';
import { MidiaWhatsappService } from './midia.service';
import { RegistroMensagensService } from './registro-mensagens.service';

export const ORIGEM_WEB = 'WEB';
const TIPOS_COM_MIDIA = ['image', 'document', 'audio', 'video', 'sticker'];
const MIDIA_MAX_BYTES = 50 * 1024 * 1024;

type Estado = 'desconectado' | 'iniciando' | 'aguardando_qr' | 'conectado';

/** Dono da sessão: o login que conectou o número */
export interface Dono { escritorioId: string; usuarioId: string }

interface Sessao {
  dono: Dono;
  estado: Estado;
  sock: ReturnType<typeof makeWASocket> | null;
  qr: string | null;          // QR Code como imagem (data URL) para a tela
  numero: string | null;
  nome: string | null;
  erro: string | null;
  encerrando: boolean;
  enviadasPeloJurysone: Set<string>;
  enviadas: Map<string, any>;    // conteúdo das últimas mensagens enviadas (para reenvio)
  jidPorTelefone: Map<string, string>;
  // Filtro de privacidade (ver filtro-contatos.ts)
  agendaTelefones: Set<string>;
  agendaLids: Set<string>;
  agendaCarregadaEm: string | null;
  pendentes: WAMessage[];        // mensagens que chegaram antes de ler a agenda
  gravarAgendaTimer: NodeJS.Timeout | null;
}

const AGENDA_VALIDADE_MS = 24 * 60 * 60 * 1000;
const CLIENTES_CACHE_MS = 60 * 1000;

/** Pasta das sessões: WHATSAPP_WEB_PASTA, ou ao lado da pasta de arquivos locais */
function pastaSessoes() {
  if (process.env.WHATSAPP_WEB_PASTA) return process.env.WHATSAPP_WEB_PASTA;
  if (process.env.ARMAZENAMENTO_LOCAL_DIR) return path.join(path.dirname(path.resolve(process.env.ARMAZENAMENTO_LOCAL_DIR)), 'whatsapp-web');
  return path.join(process.cwd(), 'whatsapp-web-sessao');
}

/** Pasta da sessão de um login */
function pastaDo(d: Dono) {
  return path.join(pastaSessoes(), d.escritorioId, `u_${d.usuarioId}`);
}

/**
 * Antes de 22/11/2026 a sessão ficava direto em <pasta>/<escritório>. Move os arquivos para a
 * pasta do login dono do número, para não precisar ler o QR Code de novo.
 */
function migrarPastaAntiga(d: Dono) {
  const antiga = path.join(pastaSessoes(), d.escritorioId);
  const nova = pastaDo(d);
  if (!fs.existsSync(path.join(antiga, 'creds.json')) || fs.existsSync(path.join(nova, 'creds.json'))) return;
  fs.mkdirSync(nova, { recursive: true });
  for (const nome of fs.readdirSync(antiga)) {
    const origem = path.join(antiga, nome);
    if (fs.statSync(origem).isFile()) fs.renameSync(origem, path.join(nova, nome));
  }
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

@Injectable()
export class WhatsappWebService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('WhatsappWeb');
  /** Uma sessão por login (chave: id do usuário) */
  private readonly sessoes = new Map<string, Sessao>();
  private readonly log = pino({ level: 'silent' });

  constructor(
    private readonly prisma: PrismaService,
    private readonly registro: RegistroMensagensService,
    private readonly midia: MidiaWhatsappService,
  ) {}

  /** Retoma as sessões já conectadas quando o servidor sobe */
  async onModuleInit() {
    const ativas = await this.prisma.whatsappConexao.findMany({ where: { origem: ORIGEM_WEB, ativo: true, usuarioId: { not: null } } });
    for (const c of ativas) {
      const dono: Dono = { escritorioId: c.escritorioId, usuarioId: c.usuarioId! };
      try { migrarPastaAntiga(dono); } catch (e: any) { this.logger.error(`Mover sessão antiga: ${e?.message ?? e}`); }
      if (fs.existsSync(path.join(pastaDo(dono), 'creds.json'))) {
        this.iniciar(dono).catch((e) => this.logger.error(`Retomar sessão: ${e?.message ?? e}`));
      }
    }
  }

  async onModuleDestroy() {
    for (const s of this.sessoes.values()) {
      s.encerrando = true;
      try { s.sock?.end(undefined); } catch { /* já fechado */ }
    }
  }

  private sessao(dono: Dono): Sessao {
    let s = this.sessoes.get(dono.usuarioId);
    if (!s) {
      s = {
        dono, estado: 'desconectado', sock: null, qr: null, numero: null, nome: null, erro: null, encerrando: false,
        enviadasPeloJurysone: new Set(), enviadas: new Map(), jidPorTelefone: new Map(),
        agendaTelefones: new Set(), agendaLids: new Set(), agendaCarregadaEm: null, pendentes: [], gravarAgendaTimer: null,
      };
      this.sessoes.set(dono.usuarioId, s);
      this.lerAgenda(s);
    }
    return s;
  }

  // ── Agenda do celular (para o filtro de conversas pessoais) ───────────────────

  private arquivoAgenda(s: Sessao) {
    return path.join(pastaDo(s.dono), 'agenda-jurysone.json');
  }

  private lerAgenda(s: Sessao) {
    try {
      const a: AgendaSalva = JSON.parse(fs.readFileSync(this.arquivoAgenda(s), 'utf8'));
      a.telefones.forEach((t) => s.agendaTelefones.add(t));
      a.lids.forEach((l) => s.agendaLids.add(l));
      s.agendaCarregadaEm = a.carregadaEm;
    } catch { /* ainda não leu a agenda */ }
  }

  private gravarAgenda(s: Sessao) {
    if (s.gravarAgendaTimer) clearTimeout(s.gravarAgendaTimer);
    s.gravarAgendaTimer = setTimeout(() => {
      const a: AgendaSalva = { carregadaEm: s.agendaCarregadaEm, telefones: [...s.agendaTelefones], lids: [...s.agendaLids] };
      try {
        fs.mkdirSync(pastaDo(s.dono), { recursive: true });
        fs.writeFileSync(this.arquivoAgenda(s), JSON.stringify(a));
      } catch (e: any) { this.logger.warn(`Gravar agenda: ${e?.message ?? e}`); }
    }, 1000);
  }

  /** Contatos vindos do celular: só os que têm nome salvo na agenda contam como "da agenda" */
  private anotarContatos(s: Sessao, contatos: Partial<Contact>[]) {
    let mudou = false;
    for (const c of contatos) {
      if (!c?.name) continue;
      for (const id of [c.id, c.phoneNumber, c.lid]) {
        if (!id) continue;
        if (id.endsWith('@lid')) { if (!s.agendaLids.has(id)) { s.agendaLids.add(id); mudou = true; } }
        else { const k = chaveTelefone(id); if (k && !s.agendaTelefones.has(k)) { s.agendaTelefones.add(k); mudou = true; } }
      }
    }
    if (mudou) this.gravarAgenda(s);
  }

  /** Pede ao celular a agenda inteira (uma vez por dia) e libera as mensagens que esperavam por ela */
  private async carregarAgenda(s: Sessao) {
    const valida = s.agendaCarregadaEm && Date.now() - new Date(s.agendaCarregadaEm).getTime() < AGENDA_VALIDADE_MS;
    if (!valida) {
      try {
        await s.sock?.resyncAppState(ALL_WA_PATCH_NAMES, true);
        s.agendaCarregadaEm = new Date().toISOString();
        this.gravarAgenda(s);
        this.logger.log(`Agenda do celular lida: ${s.agendaTelefones.size} contato(s) salvos (login ${s.dono.usuarioId}).`);
      } catch (e: any) {
        this.logger.warn(`Não foi possível ler a agenda do celular: ${e?.message ?? e}`);
        if (!s.agendaCarregadaEm) return; // sem agenda, as mensagens continuam esperando
      }
    }
    const fila = s.pendentes.splice(0);
    for (const m of fila) await this.receber(s, m).catch((e) => this.logger.warn(`Mensagem ${m.key?.id}: ${e?.message ?? e}`));
  }

  private clientesCache = new Map<string, { em: number; chaves: Set<string> }>();

  private async chavesClientes(escritorioId: string) {
    const c = this.clientesCache.get(escritorioId);
    if (c && Date.now() - c.em < CLIENTES_CACHE_MS) return c.chaves;
    const lista = await this.prisma.cliente.findMany({ where: { escritorioId, deletedAt: null, telefone: { not: null } }, select: { telefone: true } });
    const chaves = new Set(lista.map((x) => chaveTelefone(x.telefone)).filter(Boolean));
    this.clientesCache.set(escritorioId, { em: Date.now(), chaves });
    return chaves;
  }

  /** Regra do filtro: cliente cadastrado, número fora da agenda ou conversa já aceita */
  private async conversaPermitida(s: Sessao, conexaoId: string, telefone: string, jid: string) {
    const chave = chaveTelefone(telefone);
    if ((await this.chavesClientes(s.dono.escritorioId)).has(chave)) return true;
    const naAgenda = s.agendaTelefones.has(chave) || (jid.endsWith('@lid') && s.agendaLids.has(jid));
    if (!naAgenda) return true;
    return !!(await this.prisma.whatsappConversa.findUnique({ where: { conexaoId_telefone: { conexaoId, telefone } }, select: { id: true } }));
  }

  situacao(dono: Dono) {
    const s = this.sessao(dono);
    return { estado: s.estado, qr: s.estado === 'aguardando_qr' ? s.qr : null, numero: s.numero, nome: s.nome, erro: s.erro };
  }

  /** Abre a conexão; se ainda não há sessão salva, o WhatsApp devolve um QR Code para ler no celular */
  async iniciar(dono: Dono) {
    const s = this.sessao(dono);
    if (s.estado === 'conectado' || s.estado === 'aguardando_qr' || s.estado === 'iniciando') return this.situacao(dono);
    s.estado = 'iniciando'; s.erro = null; s.encerrando = false;

    const pasta = pastaDo(dono);
    fs.mkdirSync(pasta, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(pasta);
    let version: [number, number, number] | undefined;
    try { version = (await fetchLatestBaileysVersion()).version as [number, number, number]; } catch { /* usa a versão embutida */ }

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, this.log) },
      logger: this.log,
      browser: Browsers.windows('JurysOne'),
      markOnlineOnConnect: false,     // não aparece "online" no celular
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      // O destinatário pode pedir o reenvio de uma mensagem que não abriu: devolve a que enviamos
      getMessage: async (key) => s.enviadas.get(key.id ?? '') ?? undefined,
    });
    s.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
      if (s.sock !== sock) return; // evento de um socket antigo
      if (u.qr) {
        s.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 280 });
        s.estado = 'aguardando_qr';
      }
      if (u.connection === 'open') {
        s.estado = 'conectado'; s.qr = null; s.erro = null;
        s.numero = soDigitos(String(sock.user?.id ?? '').split(':')[0].split('@')[0]);
        s.nome = sock.user?.name ?? sock.user?.verifiedName ?? null;
        // O mesmo celular já ligado em outro login: não grava as conversas duas vezes
        const duplicado = await this.prisma.whatsappConexao.findFirst({
          where: { escritorioId: dono.escritorioId, ativo: true, numeroExibicao: s.numero, NOT: { usuarioId: dono.usuarioId } },
          select: { usuarioId: true },
        });
        if (duplicado) {
          const outro = await this.prisma.usuario.findUnique({ where: { id: duplicado.usuarioId ?? '' }, select: { nome: true } });
          await this.desconectar(dono);
          s.erro = `Este número já está conectado no login de ${outro?.nome ?? 'outro usuário'}.`;
          return;
        }
        await this.gravarConexao(dono, s).catch((e) => this.logger.error(`Gravar conexão: ${e?.message ?? e}`));
        this.logger.log(`Conectado (login ${dono.usuarioId}, número ${s.numero}).`);
        setTimeout(() => this.carregarAgenda(s).catch(() => undefined), 3000);
      }
      if (u.connection === 'close') {
        const codigo = (u.lastDisconnect?.error as any)?.output?.statusCode;
        s.sock = null;
        if (codigo === DisconnectReason.loggedOut) {
          // Desconectado pelo celular (Aparelhos conectados → Sair): apaga a sessão
          s.estado = 'desconectado'; s.qr = null; s.erro = 'O WhatsApp foi desconectado pelo celular.';
          fs.rmSync(pasta, { recursive: true, force: true });
          await this.prisma.whatsappConexao.updateMany({ where: { escritorioId: dono.escritorioId, usuarioId: dono.usuarioId, origem: ORIGEM_WEB }, data: { ativo: false } });
          this.logger.warn(`Sessão encerrada pelo celular (login ${dono.usuarioId}).`);
        } else if (codigo === DisconnectReason.timedOut && !state.creds.registered) {
          // Ninguém leu o QR Code a tempo: para de gerar códigos até pedirem de novo
          s.estado = 'desconectado'; s.qr = null; s.erro = 'O QR Code expirou. Clique em Conectar para gerar outro.';
        } else if (!s.encerrando) {
          // Queda de rede, reinício pedido pelo WhatsApp (515) ou QR expirado: reconecta
          s.estado = 'desconectado';
          setTimeout(() => this.iniciar(dono).catch((e) => { s.erro = String(e?.message ?? e); }), codigo === DisconnectReason.restartRequired ? 500 : 3000);
        } else {
          s.estado = 'desconectado';
        }
      }
    });

    sock.ev.on('contacts.upsert', (lista) => this.anotarContatos(s, lista));
    sock.ev.on('contacts.update', (lista) => this.anotarContatos(s, lista));

    sock.ev.on('messages.upsert', async ({ messages }) => {
      for (const m of messages) {
        await this.receber(s, m).catch((e) => this.logger.warn(`Mensagem ${m.key?.id}: ${e?.message ?? e}`));
      }
    });

    sock.ev.on('messages.update', async (atualizacoes) => {
      const mapa: Record<number, string> = { 0: 'falhou', 2: 'enviada', 3: 'entregue', 4: 'lida', 5: 'lida' };
      for (const a of atualizacoes) {
        const st = a.update?.status;
        if (a.key?.id && typeof st === 'number' && mapa[st]) await this.registro.atualizarStatus(a.key.id, mapa[st]).catch(() => undefined);
      }
    });

    return this.situacao(dono);
  }

  /** Cria (ou reativa) a conexão WEB do login e desativa as outras conexões DESTE login */
  private async gravarConexao(dono: Dono, s: Sessao) {
    const { escritorioId, usuarioId } = dono;
    // Reaproveita a conexão que o login já teve (mantém as conversas antigas no mesmo número)
    const existente = await this.prisma.whatsappConexao.findFirst({
      where: { escritorioId, usuarioId, origem: ORIGEM_WEB }, orderBy: { updatedAt: 'desc' },
    });
    const id = existente
      ? (await this.prisma.whatsappConexao.update({ where: { id: existente.id }, data: { ativo: true, numeroExibicao: s.numero, nomeExibicao: s.nome } })).id
      : (await this.prisma.whatsappConexao.create({
        data: { escritorioId, usuarioId, phoneNumberId: `web:${usuarioId}`, wabaId: ORIGEM_WEB, tokenCifrado: '', origem: ORIGEM_WEB, numeroExibicao: s.numero, nomeExibicao: s.nome },
      })).id;
    await this.prisma.whatsappConexao.updateMany({ where: { escritorioId, usuarioId, NOT: { id } }, data: { ativo: false } });
  }

  private conexaoAtiva(dono: Dono) {
    return this.prisma.whatsappConexao.findFirst({ where: { escritorioId: dono.escritorioId, usuarioId: dono.usuarioId, origem: ORIGEM_WEB, ativo: true } });
  }

  /**
   * Telefone do contato. O WhatsApp passou a identificar contatos por um código interno (@lid);
   * o número real vem em remoteJidAlt ou no mapa LID→telefone que a biblioteca mantém.
   */
  private async telefoneDe(s: Sessao, m: WAMessage): Promise<string | null> {
    const jid = m.key.remoteJid ?? '';
    const k: any = m.key;
    let pn: string | null = jid;
    if (jid.endsWith('@lid')) {
      pn = k.remoteJidAlt ?? k.senderPn ?? null;
      if (!pn) pn = await (s.sock as any)?.signalRepository?.lidMapping?.getPNForLID?.(jid).catch(() => null) ?? null;
    }
    const telefone = soDigitos(String(pn ?? jid).split('@')[0].split(':')[0]);
    if (telefone) s.jidPorTelefone.set(telefone, jid);
    return telefone || null;
  }

  private conteudo(m: WAMessage): ConteudoMensagem | null {
    const msg = normalizeMessageContent(m.message);
    if (!msg) return null;
    const tipo = getContentType(msg);
    const base: ConteudoMensagem = { tipo: 'text', texto: null, midiaId: null, midiaMime: null, midiaNome: null };
    switch (tipo) {
      case 'conversation': return { ...base, texto: msg.conversation ?? null };
      case 'extendedTextMessage': return { ...base, texto: msg.extendedTextMessage?.text ?? null };
      case 'imageMessage': return { ...base, tipo: 'image', texto: msg.imageMessage?.caption ?? null, midiaId: m.key.id ?? null, midiaMime: msg.imageMessage?.mimetype ?? 'image/jpeg' };
      case 'videoMessage': return { ...base, tipo: 'video', texto: msg.videoMessage?.caption ?? null, midiaId: m.key.id ?? null, midiaMime: msg.videoMessage?.mimetype ?? 'video/mp4' };
      case 'audioMessage': return { ...base, tipo: 'audio', midiaId: m.key.id ?? null, midiaMime: (msg.audioMessage?.mimetype ?? 'audio/ogg').split(';')[0] };
      case 'documentMessage': return { ...base, tipo: 'document', texto: msg.documentMessage?.caption ?? null, midiaId: m.key.id ?? null, midiaMime: msg.documentMessage?.mimetype ?? null, midiaNome: msg.documentMessage?.fileName ?? null };
      case 'stickerMessage': return { ...base, tipo: 'sticker', midiaId: m.key.id ?? null, midiaMime: msg.stickerMessage?.mimetype ?? 'image/webp' };
      case 'locationMessage': {
        const l = msg.locationMessage!;
        return { ...base, tipo: 'location', texto: [l.name, l.address, `https://maps.google.com/?q=${l.degreesLatitude},${l.degreesLongitude}`].filter(Boolean).join(' — ') };
      }
      case 'contactMessage': return { ...base, tipo: 'contacts', texto: `Contato compartilhado: ${msg.contactMessage?.displayName ?? ''}` };
      case 'contactsArrayMessage': return { ...base, tipo: 'contacts', texto: `Contatos compartilhados: ${(msg.contactsArrayMessage?.contacts ?? []).map((c) => c.displayName).join('; ')}` };
      case 'reactionMessage': return { ...base, tipo: 'reaction', texto: msg.reactionMessage?.text ? `Reagiu com ${msg.reactionMessage.text}` : 'Removeu a reação' };
      case 'protocolMessage': case 'senderKeyDistributionMessage': case 'messageContextInfo': case undefined: return null;
      default: return { ...base, tipo: 'unsupported', texto: 'Mensagem de um tipo que o JurysOne ainda não mostra (ex.: enquete).' };
    }
  }

  private async receber(s: Sessao, m: WAMessage) {
    const jid = m.key.remoteJid ?? '';
    if (!m.message || !jid || isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid)) return; // só conversas individuais
    if (m.key.fromMe && m.key.id && s.enviadasPeloJurysone.has(m.key.id)) return; // já registrada pelo envio
    const conteudo = this.conteudo(m);
    if (!conteudo) return;
    if (!s.agendaCarregadaEm) { if (s.pendentes.length < 500) s.pendentes.push(m); return; } // espera ler a agenda
    const telefone = await this.telefoneDe(s, m);
    if (!telefone || telefone === s.numero) return; // ignora "mensagem para mim mesmo"
    const conexao = await this.conexaoAtiva(s.dono);
    if (!conexao) return;
    if (!(await this.conversaPermitida(s, conexao.id, telefone, jid))) return; // contato pessoal: não grava
    const ts = Number(m.messageTimestamp ?? 0);
    const salva = await this.registro.registrar({
      conexao, telefone, nomeContato: m.key.fromMe ? null : (m.pushName ?? null), wamid: m.key.id ?? null,
      direcao: m.key.fromMe ? 'SAIDA' : 'ENTRADA', origem: m.key.fromMe ? 'CELULAR' : 'CLIENTE',
      conteudo, status: m.key.fromMe ? 'enviada' : 'recebida', dataHora: ts > 0 ? new Date(ts * 1000) : new Date(),
    });
    if (salva && TIPOS_COM_MIDIA.includes(conteudo.tipo)) {
      try {
        const buffer = (await downloadMediaMessage(m, 'buffer', {}, { logger: this.log, reuploadRequest: s.sock!.updateMediaMessage })) as Buffer;
        if (buffer.length > MIDIA_MAX_BYTES) throw new Error('arquivo acima de 50 MB');
        await this.midia.guardarConteudo(salva.id, buffer, conteudo.midiaMime ?? 'application/octet-stream');
      } catch (e: any) {
        await this.prisma.whatsappMensagemCaixa.update({ where: { id: salva.id }, data: { erro: `Anexo não baixado: ${String(e?.message ?? e).slice(0, 300)}` } });
      }
    }
  }

  /** Envia texto pelo número do login dono e devolve o id da mensagem no WhatsApp */
  async enviarTexto(dono: Dono, telefone: string, texto: string): Promise<string> {
    const s = this.sessao(dono);
    if (s.estado !== 'conectado' || !s.sock) throw new BadRequestException('Este WhatsApp está desconectado. O dono do número precisa conectá-lo de novo pelo QR Code.');
    const jid = s.jidPorTelefone.get(telefone) ?? `${telefone}@s.whatsapp.net`;
    const id = generateMessageIDV2(s.sock.user?.id);
    s.enviadasPeloJurysone.add(id);
    if (s.enviadasPeloJurysone.size > 2000) s.enviadasPeloJurysone.delete(s.enviadasPeloJurysone.values().next().value as string);
    const r = await s.sock.sendMessage(jid, { text: texto }, { messageId: id });
    if (r?.message) {
      s.enviadas.set(r.key.id ?? id, r.message);
      if (s.enviadas.size > 500) s.enviadas.delete(s.enviadas.keys().next().value as string);
    }
    return r?.key?.id ?? id;
  }

  /** Conversas já gravadas que o filtro deixaria de fora (contato da agenda que não é cliente) */
  private async conversasPessoais(dono: Dono) {
    const s = this.sessao(dono);
    if (!s.agendaCarregadaEm) throw new BadRequestException('A agenda do celular ainda não foi lida. Aguarde um minuto com o WhatsApp conectado e tente de novo.');
    const clientes = await this.chavesClientes(dono.escritorioId);
    const conversas = await this.prisma.whatsappConversa.findMany({
      where: { escritorioId: dono.escritorioId, conexao: { origem: ORIGEM_WEB, usuarioId: dono.usuarioId } },
      select: { id: true, telefone: true, nomeContato: true, pastaArquivosId: true, _count: { select: { mensagens: true } } },
    });
    return conversas.filter((c) => {
      const k = chaveTelefone(c.telefone);
      const jid = s.jidPorTelefone.get(c.telefone) ?? '';
      const naAgenda = s.agendaTelefones.has(k) || (jid.endsWith('@lid') && s.agendaLids.has(jid));
      return naAgenda && !clientes.has(k);
    });
  }

  async previaLimpeza(dono: Dono) {
    const lista = await this.conversasPessoais(dono);
    return { total: lista.length, conversas: lista.map((c) => ({ telefone: c.telefone, nome: c.nomeContato, mensagens: c._count.mensagens })) };
  }

  /** Apaga do JurysOne as conversas pessoais já gravadas (mensagens e anexos guardados) */
  async limparPessoais(dono: Dono) {
    const lista = await this.conversasPessoais(dono);
    let anexosNaoApagados = 0;
    const prov = lista.some((c) => c.pastaArquivosId) ? await this.midia.provedor(dono.escritorioId) : null;
    for (const c of lista) {
      if (c.pastaArquivosId && prov) {
        try { await prov.apagar(c.pastaArquivosId); } catch (e: any) { anexosNaoApagados++; this.logger.warn(`Apagar anexos de ${c.id}: ${e?.message ?? e}`); }
      }
      await this.prisma.$transaction([
        this.prisma.whatsappMensagemCaixa.deleteMany({ where: { conversaId: c.id } }),
        this.prisma.whatsappConversa.delete({ where: { id: c.id } }),
      ]);
    }
    return { apagadas: lista.length, anexosNaoApagados };
  }

  /** Desconecta e apaga a sessão (o aparelho some da lista "Aparelhos conectados" do celular) */
  async desconectar(dono: Dono) {
    const s = this.sessao(dono);
    s.encerrando = true;
    try { await s.sock?.logout(); } catch { /* já estava fechado */ }
    s.sock = null; s.estado = 'desconectado'; s.qr = null; s.numero = null; s.nome = null;
    fs.rmSync(pastaDo(dono), { recursive: true, force: true });
    await this.prisma.whatsappConexao.updateMany({ where: { escritorioId: dono.escritorioId, usuarioId: dono.usuarioId, origem: ORIGEM_WEB }, data: { ativo: false } });
    return this.situacao(dono);
  }
}
