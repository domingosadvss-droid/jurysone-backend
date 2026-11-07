/**
 * JURYSONE — Arquivos do caso
 *
 * Cada processo ganha uma pasta no armazenamento do escritório, com subpastas por tipo:
 *   Clientes / {cliente} / {processo} / 01 Contratação, 02 Documentos do cliente, ...
 * O parceiro acessa os arquivos pelo JurysOne, nunca pela pasta do Drive.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../../database/prisma.service';
import { cifrar, criptografiaConfigurada, decifrar } from '../../common/cripto';
import { PERFIS_GESTAO, ehParceiro, temPerfil, veFinanceiro } from '../../common/perfis';
import {
  ArmazenamentoGoogleDrive, ArmazenamentoLocal, ESCOPO_DRIVE, ProvedorArmazenamento, clienteOAuthGoogle, nomeSeguro,
} from './provedores';

export const CATEGORIAS: Record<string, string> = {
  CONTRATACAO: '01 Contratação',
  DOCUMENTOS_CLIENTE: '02 Documentos do cliente',
  PECAS: '03 Peças',
  DECISOES: '04 Decisões e intimações',
  FINANCEIRO: '05 Financeiro',
  TECNICO: '06 Técnico e certidões',
  OUTROS: '99 Outros',
};

const MIMES_PERMITIDOS = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel', 'text/plain', 'text/csv',
  'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'video/mp4',
]);

const CHAVE_CFG = 'armazenamento';

interface ConfigArmazenamento { provedor?: 'GOOGLE_DRIVE' | 'LOCAL'; refreshToken?: string; conectadoEm?: string; raizId?: string; clientesId?: string }

@Injectable()
export class ArquivosService {
  private readonly logger = new Logger(ArquivosService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ═══════════════════════════ CONFIGURAÇÃO ═══════════════════════════════

  private async lerConfig(escritorioId: string): Promise<ConfigArmazenamento> {
    const c = await this.prisma.configuracao.findUnique({ where: { escritorioId_chave: { escritorioId, chave: CHAVE_CFG } } });
    return ((c?.valor as any) ?? {}) as ConfigArmazenamento;
  }

  private async salvarConfig(escritorioId: string, cfg: ConfigArmazenamento) {
    await this.prisma.configuracao.upsert({
      where: { escritorioId_chave: { escritorioId, chave: CHAVE_CFG } },
      update: { valor: cfg as any },
      create: { escritorioId, chave: CHAVE_CFG, valor: cfg as any, tipo: 'integracao' },
    });
  }

  /** Em produção, só Google Drive conectado; em desenvolvimento, pasta local. */
  async provedor(escritorioId: string): Promise<ProvedorArmazenamento> {
    const cfg = await this.lerConfig(escritorioId);
    if (cfg.provedor === 'GOOGLE_DRIVE' && cfg.refreshToken) {
      return new ArmazenamentoGoogleDrive(decifrar(cfg.refreshToken));
    }
    const localPermitido = process.env.ARMAZENAMENTO_PROVEDOR === 'LOCAL' || process.env.NODE_ENV !== 'production';
    if (!localPermitido) {
      throw new BadRequestException('Conecte o Google Drive do escritório antes de salvar arquivos.');
    }
    const raiz = process.env.ARMAZENAMENTO_LOCAL_DIR || path.join(os.tmpdir(), 'jurysone-arquivos');
    return new ArmazenamentoLocal(path.join(raiz, escritorioId));
  }

  async status(escritorioId: string) {
    const cfg = await this.lerConfig(escritorioId);
    return {
      provedor: cfg.provedor === 'GOOGLE_DRIVE' && cfg.refreshToken ? 'GOOGLE_DRIVE' : 'LOCAL',
      driveConectado: cfg.provedor === 'GOOGLE_DRIVE' && !!cfg.refreshToken,
      conectadoEm: cfg.conectadoEm ?? null,
      oauthConfigurado: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REDIRECT_URI),
      criptografiaConfigurada: criptografiaConfigurada(),
    };
  }

  // ── OAuth do Google Drive ──

  private assinarEstado(escritorioId: string, ts: number) {
    const segredo = process.env.JWT_SECRET ?? '';
    if (!segredo) throw new BadRequestException('JWT_SECRET não configurado.');
    return createHmac('sha256', segredo).update(`${escritorioId}.${ts}`).digest('hex');
  }

  urlConexaoDrive(escritorioId: string) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REDIRECT_URI) {
      throw new BadRequestException('Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_DRIVE_REDIRECT_URI no servidor.');
    }
    if (!criptografiaConfigurada()) throw new BadRequestException('Configure CHAVE_CRIPTOGRAFIA no servidor antes de conectar o Drive.');
    const ts = Date.now();
    const state = `${escritorioId}.${ts}.${this.assinarEstado(escritorioId, ts)}`;
    const url = clienteOAuthGoogle().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [ESCOPO_DRIVE], state });
    return { url };
  }

  async callbackDrive(code: string, state: string) {
    const [escritorioId, tsStr, assinatura] = String(state ?? '').split('.');
    const ts = Number(tsStr);
    const esperado = escritorioId && ts ? this.assinarEstado(escritorioId, ts) : '';
    const valido = !!assinatura && esperado.length === assinatura.length &&
      timingSafeEqual(Buffer.from(esperado), Buffer.from(assinatura)) && Date.now() - ts < 15 * 60 * 1000;
    if (!valido) throw new ForbiddenException('Link de conexão inválido ou expirado. Gere um novo.');
    if (!code) throw new BadRequestException('Código de autorização ausente.');

    const { tokens } = await clienteOAuthGoogle().getToken(code);
    if (!tokens?.refresh_token) {
      throw new BadRequestException('O Google não devolveu o token de acesso contínuo. Remova o acesso do JurysOne na conta Google e conecte de novo.');
    }
    const cfg = await this.lerConfig(escritorioId);
    // Ao trocar de provedor, as pastas são recriadas no Drive
    await this.salvarConfig(escritorioId, {
      provedor: 'GOOGLE_DRIVE', refreshToken: cifrar(tokens.refresh_token), conectadoEm: new Date().toISOString(),
      raizId: cfg.provedor === 'GOOGLE_DRIVE' ? cfg.raizId : undefined,
      clientesId: cfg.provedor === 'GOOGLE_DRIVE' ? cfg.clientesId : undefined,
    });
    return { conectado: true };
  }

  // ═══════════════════════════ PASTAS ══════════════════════════════════════

  private prefixo(p: ProvedorArmazenamento, id: string) { return `${p.nome}:${id}`; }
  private semPrefixo(p: ProvedorArmazenamento, valor?: string | null) {
    if (!valor) return null;
    const [prov, ...resto] = valor.split(':');
    return prov === p.nome ? resto.join(':') : null;
  }

  /** Garante a pasta do processo e devolve o id da subpasta da categoria */
  async pastaDaCategoria(escritorioId: string, processoId: string, categoria: string, p?: ProvedorArmazenamento) {
    if (!CATEGORIAS[categoria]) throw new BadRequestException(`Categoria inválida. Use: ${Object.keys(CATEGORIAS).join(', ')}`);
    const prov = p ?? (await this.provedor(escritorioId));
    const processo = await this.prisma.processo.findFirst({
      where: { id: processoId, escritorioId, deletedAt: null },
      include: { cliente: true, escritorio: { select: { nome: true } } },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');

    const pastas = ((processo.drivePastas as any) ?? {}) as Record<string, string>;
    const cache = this.semPrefixo(prov, pastas[categoria]);
    if (cache) return { prov, pastaId: cache };

    // Raiz do escritório e pasta "Clientes"
    const cfg = await this.lerConfig(escritorioId);
    const doMesmo = (cfg.provedor ?? 'LOCAL') === prov.nome;
    let raizId = doMesmo ? cfg.raizId : undefined;
    let clientesId = doMesmo ? cfg.clientesId : undefined;
    if (!raizId) raizId = await prov.criarPasta(`JurysOne - ${processo.escritorio.nome}`, null);
    if (!clientesId) clientesId = await prov.criarPasta('Clientes', raizId);
    if (!doMesmo || cfg.raizId !== raizId || cfg.clientesId !== clientesId) {
      await this.salvarConfig(escritorioId, { ...cfg, raizId, clientesId });
    }

    // Pasta do cliente
    let clienteFolder = this.semPrefixo(prov, processo.cliente.driveFolderId);
    if (!clienteFolder) {
      const doc = (processo.cliente.cpfCnpj ?? '').replace(/\D/g, '').slice(-4);
      clienteFolder = await prov.criarPasta(`${processo.cliente.nome}${doc ? ` (${doc})` : ''}`, clientesId);
      await this.prisma.cliente.update({ where: { id: processo.cliente.id }, data: { driveFolderId: this.prefixo(prov, clienteFolder) } });
    }

    // Pasta do processo
    let processoFolder = this.semPrefixo(prov, processo.driveFolderId);
    if (!processoFolder) {
      processoFolder = await prov.criarPasta(processo.titulo ? `${processo.numero} - ${processo.titulo}` : processo.numero, clienteFolder);
    }

    const sub = await prov.criarPasta(CATEGORIAS[categoria], processoFolder);
    await this.prisma.processo.update({
      where: { id: processoId },
      data: { driveFolderId: this.prefixo(prov, processoFolder), drivePastas: { ...pastas, [categoria]: this.prefixo(prov, sub) } },
    });
    return { prov, pastaId: sub };
  }

  // ═══════════════════════════ ARQUIVOS ════════════════════════════════════

  private async assertAcessoProcesso(escritorioId: string, processoId: string, user: any) {
    const p = await this.prisma.processo.findFirst({ where: { id: processoId, escritorioId, deletedAt: null }, select: { id: true, clienteId: true } });
    if (!p) throw new NotFoundException('Processo não encontrado');
    if (ehParceiro(user)) {
      const ok = await this.prisma.participacaoProcesso.findFirst({
        where: { escritorioId, processoId, parceiroId: user.parceiroId ?? '__sem_parceiro__' }, select: { id: true },
      });
      if (!ok) throw new NotFoundException('Processo não encontrado');
    }
    return p;
  }

  /** Salva um conteúdo na pasta do processo e registra no sistema (uso interno e por upload) */
  async salvarNoProcesso(escritorioId: string, processoId: string, dados: {
    nome: string; mimeType: string; conteudo: Buffer; categoria: string; origem: string;
    etapaId?: string | null; itemChecklistId?: string | null; enviadoPorId?: string | null; tipo?: string;
  }) {
    const { prov, pastaId } = await this.pastaDaCategoria(escritorioId, processoId, dados.categoria);
    const processo = await this.prisma.processo.findUnique({ where: { id: processoId }, select: { clienteId: true } });
    const salvo = await prov.enviarArquivo(pastaId, dados.nome, dados.mimeType, dados.conteudo);
    return this.prisma.documento.create({
      data: {
        escritorioId, processoId, clienteId: processo?.clienteId ?? null,
        nome: nomeSeguro(dados.nome, 160), tipo: dados.tipo ?? null, categoria: dados.categoria,
        mimeType: dados.mimeType, tamanho: dados.conteudo.length, url: salvo.link,
        provedor: prov.nome, arquivoExternoId: salvo.id,
        hashSha256: createHash('sha256').update(dados.conteudo).digest('hex'),
        origem: dados.origem, etapaId: dados.etapaId ?? null, itemChecklistId: dados.itemChecklistId ?? null,
        enviadoPorId: dados.enviadoPorId ?? null,
      },
    });
  }

  async enviar(escritorioId: string, processoId: string, arquivo: any, dto: any, user: any) {
    await this.assertAcessoProcesso(escritorioId, processoId, user);
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie um arquivo no campo "arquivo".');
    if (!MIMES_PERMITIDOS.has(arquivo.mimetype)) throw new BadRequestException(`Tipo de arquivo não permitido: ${arquivo.mimetype}`);
    const categoria = String(dto?.categoria ?? 'OUTROS').toUpperCase();
    if (categoria === 'FINANCEIRO' && !veFinanceiro(user)) throw new ForbiddenException('Seu perfil não envia arquivos financeiros.');

    // Vincular a um item do checklist marca o item como feito
    let etapa: any = null;
    if (dto?.etapaId) {
      etapa = await this.prisma.etapaLinha.findFirst({
        where: { id: dto.etapaId, escritorioId, linha: { processoId } },
      });
      if (!etapa) throw new BadRequestException('Etapa não pertence a este processo.');
      if (etapa.status !== 'EM_ANDAMENTO') throw new BadRequestException('A etapa não está em andamento.');
      const podeAgir = etapa.responsavelId === user.id || (!ehParceiro(user) && temPerfil(user, PERFIS_GESTAO));
      if (!podeAgir) throw new ForbiddenException('Só o responsável pela etapa ou um advogado gestor pode anexar nela.');
      if (dto.itemChecklistId && !((etapa.checklist as any[]) ?? []).some((i) => i.id === dto.itemChecklistId)) {
        throw new BadRequestException('Item do checklist não encontrado na etapa.');
      }
    }

    const nome = Buffer.from(arquivo.originalname ?? 'arquivo', 'latin1').toString('utf8');
    const doc = await this.salvarNoProcesso(escritorioId, processoId, {
      nome, mimeType: arquivo.mimetype, conteudo: arquivo.buffer, categoria, origem: 'UPLOAD',
      etapaId: etapa?.id, itemChecklistId: dto?.itemChecklistId, enviadoPorId: user.id,
    });

    if (etapa && dto.itemChecklistId) {
      const lista = ((etapa.checklist as any[]) ?? []).map((i) =>
        i.id === dto.itemChecklistId ? { ...i, feito: true, feitoEm: new Date().toISOString(), feitoPorId: user.id, documentoId: doc.id } : i);
      await this.prisma.etapaLinha.update({ where: { id: etapa.id }, data: { checklist: lista as any } });
    }
    return doc;
  }

  async listar(escritorioId: string, processoId: string, user: any, query: any = {}) {
    await this.assertAcessoProcesso(escritorioId, processoId, user);
    const where: any = { escritorioId, processoId, deletedAt: null, arquivoExternoId: { not: null } };
    if (query.categoria) where.categoria = String(query.categoria).toUpperCase();
    if (!veFinanceiro(user)) where.NOT = { categoria: 'FINANCEIRO' };
    return this.prisma.documento.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async baixar(escritorioId: string, documentoId: string, user: any) {
    const doc = await this.prisma.documento.findFirst({ where: { id: documentoId, escritorioId, deletedAt: null } });
    if (!doc || !doc.arquivoExternoId || !doc.processoId) throw new NotFoundException('Arquivo não encontrado');
    await this.assertAcessoProcesso(escritorioId, doc.processoId, user);
    if (doc.categoria === 'FINANCEIRO' && !veFinanceiro(user)) throw new NotFoundException('Arquivo não encontrado');
    const prov = await this.provedor(escritorioId);
    if (doc.provedor && doc.provedor !== prov.nome) {
      throw new BadRequestException(`Este arquivo está guardado em ${doc.provedor}, que não é o armazenamento ativo.`);
    }
    return { doc, conteudo: await prov.baixarArquivo(doc.arquivoExternoId) };
  }

  /** Leitura interna (sem checagem de perfil) — usada pela assinatura */
  async conteudoInterno(escritorioId: string, documentoId: string) {
    const doc = await this.prisma.documento.findFirst({ where: { id: documentoId, escritorioId } });
    if (!doc?.arquivoExternoId) throw new NotFoundException('Arquivo não encontrado');
    const prov = await this.provedor(escritorioId);
    return prov.baixarArquivo(doc.arquivoExternoId);
  }
}
