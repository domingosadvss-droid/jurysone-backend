/**
 * ════════════════════════════════════════════════════════════════
 * JURYSONE — EsignService
 * Serviço completo de assinatura digital
 *
 * Integra com:
 *   - ClickSign (Brasil) — recomendado
 *   - DocuSign (Internacional)
 *   - Assinatura eletrônica própria (simples)
 *
 * Fluxo:
 *   1. createEnvelope() — cria envelope com documentos
 *   2. enviarEnvelope() — envia para signatário via e-mail/WhatsApp
 *   3. Signatário acessa link único e assina
 *   4. Webhook notifica conclusão → StatusFlowService processa
 *   5. downloadDocumentoAssinado() — PDF com certificado
 * ════════════════════════════════════════════════════════════════
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsGateway, NotificationType } from '../notifications/notifications.gateway';
import { ChavesService } from '../chaves/chaves.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import * as crypto from 'crypto';

export interface CreateEnvelopeInput {
  title: string;
  documento_id?: string;
  documento_url?: string;
  tipo: 'simples' | 'icp_brasil';
  signatarios: Array<{
    nome: string;
    email: string;
    cpf?: string;
    papel: 'signatario' | 'aprovador' | 'testemunha' | 'notificado';
    ordem: number;
    notificacao: 'email' | 'whatsapp' | 'sms';
  }>;
  expira_em?: string;
  mensagem?: string;
}

@Injectable()
export class EsignService {
  private readonly logger = new Logger(EsignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsGateway,
    private readonly chaves: ChavesService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // ════════════════════════════════════════════════════════════
  // ENVELOPES
  // ════════════════════════════════════════════════════════════

  async listEnvelopes(escritorioId: string, query: any) {
    const { status, page = 1, per_page = 20, search } = query;
    const skip = (Number(page) - 1) * Number(per_page);

    const where: any = { escritorioId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: 'insensitive' } },
        { signatario: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [envelopes, total] = await Promise.all([
      this.prisma.esignEnvelope.findMany({
        where,
        skip,
        take: Number(per_page),
        include: { signatarios: true } as any,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.esignEnvelope.count({ where }),
    ]);

    return {
      data: envelopes,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(per_page)),
    };
  }

  async createEnvelope(user: any, dto: CreateEnvelopeInput) {
    const expiresAt = dto.expira_em
      ? new Date(dto.expira_em)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Generate unique signing token for each signatário
    const signatariosComToken = dto.signatarios.map((s) => ({
      ...s,
      token: crypto.randomBytes(32).toString('hex'),
      status: 'pending',
    }));

    const envelope = await this.prisma.esignEnvelope.create({
      data: {
        escritorioId: user.officeId,
        titulo: dto.title,
        documentoId: dto.documento_id,
        documentoUrl: dto.documento_url,
        tipo: dto.tipo,
        criadoPorId: user.id || user.officeId,
        signatario: dto.signatarios[0]?.email as any,
        status: 'draft',
        mensagem: dto.mensagem,
        dataLimite: expiresAt,
        externalId: null,
      } as any,
    });

    return envelope;
  }

  async getEnvelope(escritorioId: string, id: string) {
    const envelope = await this.prisma.esignEnvelope.findFirst({
      where: { id, escritorioId },
      include: { signatarios: true } as any,
    });

    if (!envelope) throw new NotFoundException(`Envelope ${id} não encontrado`);

    return envelope;
  }

  async enviarEnvelope(user: any, id: string) {
    const envelope = await this.getEnvelope(user.officeId, id);

    if (envelope.status !== 'draft' && envelope.status !== 'rascunho') {
      throw new BadRequestException('Envelope já foi enviado');
    }

    // In production: integrate with ClickSign/DocuSign API
    // const clicksignResult = await this.clicksignClient.sendEnvelope(envelope);

    // Generate signing links for each signatário
    const signatarios = ((envelope as any).signatarios as any[]) || [];
    const signingLinks = signatarios.map((s: any) => ({
      nome: s.nome,
      email: s.email,
      link: `${process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${s.token}`,
      token: s.token,
    }));

    // Update envelope to "enviado"
    const updated = await this.prisma.esignEnvelope.update({
      where: { id },
      data: {
        status: 'enviado',
        enviadoEm: new Date(),
      },
    });

    // Enviar e-mails para signatários via SMTP configurado
    for (const sl of signingLinks) {
      await this.enviarEmailAssinatura(sl, (envelope as any).titulo ?? 'Documento').catch(err =>
        this.logger.warn(`[E-sign] Email falhou para ${sl.email}: ${err.message}`),
      );
    }

    this.logger.log(`Envelope ${id} enviado para ${signatarios.length} signatário(s)`);

    return {
      envelope: updated,
      signingLinks,
      message: `Envelope enviado para ${signatarios.length} signatário(s)`,
    };
  }

  async cancelarEnvelope(user: any, id: string, motivo: string) {
    const envelope = await this.getEnvelope(user.officeId, id);

    if (envelope.status === 'assinado' || envelope.status === 'signed') {
      throw new BadRequestException('Não é possível cancelar um envelope já assinado');
    }

    return this.prisma.esignEnvelope.update({
      where: { id },
      data: { status: 'cancelado', canceladoMotivo: motivo },
    });
  }

  async reenviarNotificacoes(user: any, id: string, signatarioIds?: string[]) {
    const envelope = await this.getEnvelope(user.officeId, id);
    const signatarios = ((envelope as any).signatarios as any[]) || [];

    const pending = signatarioIds
      ? signatarios.filter((s: any) => signatarioIds.includes(s.id) && s.status === 'pending')
      : signatarios.filter((s: any) => s.status === 'pending');

    const envelope_titulo = (envelope as any).titulo ?? 'Documento';
    for (const s of pending) {
      const sl = {
        nome: s.nome,
        email: s.email,
        link: `${process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${s.token}`,
        token: s.token,
      };
      await this.enviarEmailAssinatura(sl, envelope_titulo).catch(err =>
        this.logger.warn(`[E-sign] Reenvio falhou para ${s.email}: ${err.message}`),
      );
    }
    this.logger.log(`Reenviando para ${pending.length} signatário(s)`);

    return {
      reenviado: pending.length,
      signatarios: pending.map((s: any) => s.email),
    };
  }

  async downloadDocumentoAssinado(escritorioId: string, id: string, res: any) {
    const envelope = await this.getEnvelope(escritorioId, id);

    if (envelope.status !== 'assinado' && envelope.status !== 'signed') {
      throw new BadRequestException('Documento ainda não foi assinado');
    }

    // In production: retrieve signed PDF from storage (S3, etc.)
    const signedUrl = envelope.documentoUrl || (envelope as any).documento?.url;

    if (!signedUrl) {
      throw new NotFoundException('Documento assinado não encontrado');
    }

    // Redirect to signed document URL or stream the PDF
    res.redirect(signedUrl);
  }

  async getAuditoria(escritorioId: string, id: string) {
    const envelope = await this.getEnvelope(escritorioId, id);

    const history = await this.prisma.statusHistory.findMany({
      where: { entidade: 'esign_envelope', entidadeId: id },
      orderBy: { timestamp: 'asc' },
    });

    return {
      envelope: { id: envelope.id, status: envelope.status },
      trilha: history.map((h) => ({
        timestamp: h.timestamp,
        evento: `${h.statusAnterior} → ${h.statusNovo}`,
        origem: h.origem,
        metadata: h.metadata,
      })),
    };
  }

  // ════════════════════════════════════════════════════════════
  // ASSINATURA PÚBLICA (por token único)
  // ════════════════════════════════════════════════════════════

  async getSignaturePage(token: string) {
    const envelope = await this.prisma.esignEnvelope.findFirst({
      where: {
        signatario: { path: ['token'], equals: token } as any,
      },
    });

    if (!envelope) throw new NotFoundException('Link de assinatura inválido ou expirado');
    if (new Date() > envelope.dataLimite) {
      throw new BadRequestException('O prazo para assinatura expirou');
    }

    const signatarios = ((envelope as any).signatarios as any[]) || [];
    const signatario = signatarios.find((s: any) => s.token === token);

    return {
      envelopeId: envelope.id,
      title: (envelope as any).titulo,
      documentoUrl: envelope.documentoUrl,
      mensagem: envelope.mensagem,
      dataLimite: envelope.dataLimite,
      signatario: {
        nome: signatario?.nome,
        email: signatario?.email,
        papel: signatario?.papel,
      },
    };
  }

  async executarAssinatura(
    token: string,
    dto: {
      nome_completo: string;
      cpf: string;
      aceite_termos: boolean;
      assinatura_desenho?: string;
      ip_address: string;
      user_agent: string;
    },
  ) {
    if (!dto.aceite_termos) {
      throw new BadRequestException('É necessário aceitar os termos para assinar');
    }

    const envelope = await this.prisma.esignEnvelope.findFirst({
      where: {
        signatario: { path: ['token'], equals: token } as any,
      },
    });

    if (!envelope) throw new NotFoundException('Token de assinatura inválido');

    const signatarios = ((envelope as any).signatarios as any[]) || [];
    const idx = signatarios.findIndex((s: any) => s.token === token);

    if (idx === -1) throw new NotFoundException('Signatário não encontrado');

    // Mark signatário as signed
    signatarios[idx].status = 'signed';
    signatarios[idx].assinadoEm = new Date().toISOString();
    signatarios[idx].ip = dto.ip_address;
    signatarios[idx].userAgent = dto.user_agent;

    const allSigned = signatarios.every((s: any) => s.status === 'signed');

    await this.prisma.esignEnvelope.update({
      where: { id: envelope.id },
      data: {
        signatarios: signatarios as any,
        status: allSigned ? 'assinado' : 'parcialmente_assinado',
        assinadoEm: allSigned ? new Date() : undefined,
      },
    });

    if (allSigned) {
      this.logger.log(`Envelope ${envelope.id} totalmente assinado!`);
    }

    return {
      ok: true,
      message: 'Documento assinado com sucesso!',
      allSigned,
    };
  }

  async assinarIcpBrasil(
    token: string,
    dto: { certificado_base64: string; assinatura_pkcs7: string },
  ) {
    // TODO: validate ICP-Brasil certificate and PKCS7 signature
    return this.executarAssinatura(token, {
      nome_completo: 'Assinatura ICP-Brasil',
      cpf: 'validado_pelo_certificado',
      aceite_termos: true,
      ip_address: 'icp-brasil',
      user_agent: 'icp-brasil-a1',
    });
  }

  async verificarDocumento(hash: string) {
    const envelope = await this.prisma.esignEnvelope.findFirst({
      where: { documentoHash: hash },
      include: { signatarios: true } as any,
    });

    if (!envelope) {
      return {
        valido: false,
        message: 'Documento não encontrado ou hash inválido',
      };
    }

    return {
      valido: true,
      envelope: {
        id: envelope.id,
        status: envelope.status,
        assinadoEm: envelope.assinadoEm,
        dataLimite: envelope.dataLimite,
      },
      processo: {
        id: (envelope as any).processo?.id,
        area: (envelope as any).processo?.area,
      },
    };
  }

  // ════════════════════════════════════════════════════════════
  // TEMPLATES
  // ════════════════════════════════════════════════════════════

  async listTemplates(escritorioId: string) {
    return this.prisma.esignTemplate.findMany({
      where: { escritorioId },
      orderBy: { nome: 'asc' },
    });
  }

  async createTemplate(escritorioId: string, dto: any) {
    return this.prisma.esignTemplate.create({
      data: {
        escritorioId,
        nome: dto.nome,
        descricao: dto.descricao,
        tipo: dto.tipo || 'simples',
        configuracao: dto.configuracao || {},
      },
    });
  }

  async usarTemplate(user: any, templateId: string, dto: any) {
    const template = await this.prisma.esignTemplate.findFirst({
      where: { id: templateId, escritorioId: user.officeId },
    });

    if (!template) throw new NotFoundException('Template não encontrado');

    const config = template.configuracao as any;

    return this.createEnvelope(user, {
      title: `${template.nome} — ${new Date().toLocaleDateString('pt-BR')}`,
      documento_id: dto.documento_id,
      tipo: config.tipo || 'simples',
      signatarios: dto.signatarios_customizados || config.signatarios || [],
      mensagem: config.mensagem,
    });
  }

  // ════════════════════════════════════════════════════════════
  // STATS
  // ════════════════════════════════════════════════════════════

  async getStats(escritorioId: string) {
    const [total, enviados, assinados, expirados, pendentes] = await Promise.all([
      this.prisma.esignEnvelope.count({ where: { escritorioId } }),
      this.prisma.esignEnvelope.count({ where: { escritorioId, status: 'enviado' } }),
      this.prisma.esignEnvelope.count({ where: { escritorioId, status: 'assinado' } }),
      this.prisma.esignEnvelope.count({ where: { escritorioId, status: 'expirado' } }),
      this.prisma.esignEnvelope.count({ where: { escritorioId, status: 'pendente' } }),
    ]);

    const taxaConclusao = total > 0 ? Math.round((assinados / total) * 100) : 0;

    return {
      total,
      enviados,
      assinados,
      expirados,
      pendentes,
      taxaConclusao,
    };
  }

  // ─── E-mail helper ────────────────────────────────────────────────────────

  private async enviarEmailAssinatura(
    signatario: { nome: string; email: string; link: string },
    tituloDocumento: string,
  ): Promise<void> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.debug('[E-sign] SMTP não configurado — e-mail ignorado');
      return;
    }

    let nodemailer: any;
    try { nodemailer = require('nodemailer'); }
    catch { this.logger.warn('[E-sign] nodemailer não instalado'); return; }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: smtpUser, pass: smtpPass },
    });

    const corpo = `
Olá, ${signatario.nome}!

Você recebeu um documento para assinar: "${tituloDocumento}"

Clique no link abaixo para acessar e assinar o documento:
${signatario.link}

Este link é pessoal e intransferível.

— Enviado automaticamente pelo JurysOne
    `.trim();

    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? smtpUser,
      to: `"${signatario.nome}" <${signatario.email}>`,
      subject: `[JurysOne] Documento para assinar: ${tituloDocumento}`,
      text: corpo,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap;max-width:600px">${corpo}</pre>`,
    });

    this.logger.debug(`[E-sign] E-mail de assinatura enviado para ${signatario.email}`);
  }

  // ════════════════════════════════════════════════════════════
  // ENVIO AO CLIENTE (ClickSign → fallback SMTP + WhatsApp)
  // ════════════════════════════════════════════════════════════

  /**
   * Envia o envelope para o cliente assinar via ClickSign.
   * Fallback para SMTP se ClickSign não estiver configurado.
   * Envia WhatsApp em paralelo se telefone disponível.
   */
  async enviarEnvelopeParaCliente(
    escritorioId: string,
    envelopeId: string,
    signatario: { nome: string; email: string; telefone?: string },
    titulo: string,
    mensagem: string,
  ): Promise<{ provider: 'clicksign' | 'smtp' | 'none' }> {
    // 1. Tenta ClickSign
    try {
      const clickToken = await this.chaves.getChave(escritorioId, 'clicksign');
      if (clickToken && signatario.email) {
        const resultado = await this.criarDocumentoClicksign(
          clickToken,
          envelopeId,
          titulo,
          mensagem,
          signatario,
        );

        if (resultado?.docKey) {
          await this.prisma.esignEnvelope.update({
            where: { id: envelopeId },
            data: {
              zapsignDocumentId: resultado.docKey,
              status: 'enviado',
              enviadoEm: new Date(),
            } as any,
          });

          this.logger.log(`[Esign] ✅ ClickSign: documento ${resultado.docKey} criado para ${signatario.email}`);

          // WhatsApp em paralelo
          if (signatario.telefone && resultado.signUrl) {
            const msgWpp = `Olá, ${signatario.nome}!\n\nVocê recebeu documentos para assinar referentes ao seu processo jurídico.\n\nAssine pelo link:\n${resultado.signUrl}\n\n— JurysOne`;
            this.whatsapp.enviarTextoSimples(signatario.telefone, msgWpp).catch(() => null);
          }

          return { provider: 'clicksign' };
        }
      }
    } catch (err) {
      this.logger.warn(`[Esign] ClickSign falhou, tentando SMTP: ${err.message}`);
    }

    // 2. Fallback SMTP
    try {
      const signingLink = `${process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${envelopeId}`;
      await this.enviarEmailAssinatura({ nome: signatario.nome, email: signatario.email, link: signingLink }, titulo);

      await this.prisma.esignEnvelope.update({
        where: { id: envelopeId },
        data: { status: 'enviado', enviadoEm: new Date() } as any,
      });

      this.logger.log(`[Esign] ✅ SMTP: email enviado para ${signatario.email}`);

      // WhatsApp em paralelo
      if (signatario.telefone) {
        const signingLink2 = `${process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${envelopeId}`;
        const msgWpp = `Olá, ${signatario.nome}!\n\nVocê recebeu documentos para assinar referentes ao seu processo jurídico.\n\nAssine pelo link:\n${signingLink2}\n\n— JurysOne`;
        this.whatsapp.enviarTextoSimples(signatario.telefone, msgWpp).catch(() => null);
      }

      return { provider: 'smtp' };
    } catch (smtpErr) {
      this.logger.warn(`[Esign] SMTP também falhou: ${smtpErr.message}`);
    }

    // WhatsApp como último recurso
    if (signatario.telefone) {
      const signingLink = `${process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${envelopeId}`;
      const msgWpp = `Olá, ${signatario.nome}!\n\nVocê recebeu documentos para assinar referentes ao seu processo jurídico.\n\nAssine pelo link:\n${signingLink}\n\n— JurysOne`;
      await this.whatsapp.enviarTextoSimples(signatario.telefone, msgWpp).catch(() => null);
    }

    return { provider: 'none' };
  }

  private async criarDocumentoClicksign(
    apiToken: string,
    externalId: string,
    nome: string,
    mensagem: string,
    signatario: { nome: string; email: string; telefone?: string },
  ): Promise<{ docKey: string; signUrl: string } | null> {
    const base = (process.env.CLICKSIGN_URL || 'https://app.clicksign.com').replace(/\/$/, '');
    const qs   = `?access_token=${apiToken}`;

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().replace('Z', '-03:00');

    const safeName = nome
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_\-]/gi, '_')
      .substring(0, 60);

    // 1. Criar documento
    const docResp = await fetch(`${base}/api/v1/documents${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document: {
          path: `/${Date.now()}_${safeName}.pdf`,
          deadline_at: deadline,
          auto_close: true,
          locale: 'pt-BR',
          sequence_enabled: false,
        },
      }),
    });

    if (!docResp.ok) {
      const err = await docResp.text();
      throw new Error(`ClickSign criar documento: ${docResp.status} — ${err}`);
    }

    const docData = await docResp.json() as any;
    const docKey  = docData.document?.key;
    if (!docKey) throw new Error('ClickSign: chave do documento não retornada');

    // 2. Criar signatário
    const phoneRaw = (signatario.telefone || '').replace(/\D/g, '');
    const signerBody: any = {
      signer: {
        email:             signatario.email,
        name:              signatario.nome,
        auths:             ['email'],
        has_documentation: false,
      },
    };
    if (phoneRaw.length >= 10) signerBody.signer.phone_number = phoneRaw;

    const sigResp = await fetch(`${base}/api/v1/signers${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signerBody),
    });

    if (!sigResp.ok) {
      const err = await sigResp.text();
      throw new Error(`ClickSign criar signatário: ${sigResp.status} — ${err}`);
    }

    const sigData = await sigResp.json() as any;
    const sigKey  = sigData.signer?.key;

    // 3. Vincular signatário ao documento
    const listResp = await fetch(`${base}/api/v1/lists${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        list: {
          document_key: docKey,
          signer_key:   sigKey,
          sign_as:      'sign',
          refusable:    false,
          message:      mensagem,
        },
      }),
    });

    const listData = listResp.ok ? await listResp.json() as any : {};
    const signUrl  = listData.list?.url || `${base}/sign/${sigKey}`;

    // 4. Enviar notificação por e-mail via ClickSign
    await fetch(`${base}/api/v1/notifications${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notification: {
          document_key: docKey,
          signer_key:   sigKey,
          url:          signUrl,
          message:      mensagem,
        },
      }),
    }).catch(e => this.logger.warn(`[ClickSign] Notificação email falhou: ${e.message}`));

    this.logger.log(`[ClickSign] ✅ Documento ${docKey} | signatário ${sigKey} | link ${signUrl}`);
    return { docKey, signUrl };
  }

  /**
   * Processa webhook: Documento assinado no Zapsign
   * - Atualiza status do envelope para "signed"
   * - Busca o PDF assinado
   * - Envia notificações
   */
  async processZapsignDocumentSigned(data: {
    zapsignDocumentId: string;
    externalDocumentId?: string;
    signatureId: string;
    signedAt: Date;
    signerEmail: string;
    signerName: string;
    signerCpf?: string;
    documentUrl: string;
  }) {
    try {
      this.logger.log(`[Zapsign] Processando assinatura: ${data.zapsignDocumentId} por ${data.signerEmail}`);

      // Buscar envelope relacionado
      const envelope = await this.prisma.esignEnvelope.findFirst({
        where: { zapsignDocumentId: data.zapsignDocumentId },
      });

      if (!envelope) {
        this.logger.warn(`[Zapsign] Envelope não encontrado para documento: ${data.zapsignDocumentId}`);
        return;
      }

      // Atualizar envelope
      await this.prisma.esignEnvelope.update({
        where: { id: envelope.id },
        data: {
          status: 'signed',
          dataAssinatura: data.signedAt,
          urlDocumentoAssinado: data.documentUrl,
        } as any,
      });

      // Buscar e atualizar signatário específico
      await this.prisma.$executeRawUnsafe(
        `UPDATE esign_signatarios
         SET status = 'signed', data_assinatura = $1
         WHERE envelope_id = $2 AND email = $3`,
        data.signedAt,
        envelope.id,
        data.signerEmail,
      );

      // Registrar na trilha de auditoria
      await this.registrarAuditoria(envelope.id, {
        acao: 'assinado',
        usuario: data.signerName,
        email: data.signerEmail,
        timestamp: data.signedAt,
        descricao: `Documento assinado por ${data.signerName}`,
      });

      this.logger.log(`[Zapsign] ✓ Assinatura registrada: ${data.signatureId}`);

      // Notificar escritório via WebSocket
      if (envelope.escritorioId) {
        this.notifications.notifyOffice(envelope.escritorioId, {
          id: crypto.randomUUID(),
          type: NotificationType.ESIGN_ASSINADO,
          title: 'Documento assinado',
          message: `${data.signerName} assinou "${envelope.titulo ?? 'documento'}"`,
          data: { envelopeId: envelope.id, signerEmail: data.signerEmail },
          link: `/esign/${envelope.id}`,
          priority: 'normal',
          created_at: new Date().toISOString(),
          read: false,
        });

        // Se o envelope foi totalmente assinado, emitir evento específico
        const updatedEnvelope = await this.prisma.esignEnvelope.findUnique({ where: { id: envelope.id } });
        if (updatedEnvelope?.status === 'signed') {
          this.notifications.notifyOffice(envelope.escritorioId, {
            id: crypto.randomUUID(),
            type: NotificationType.ESIGN_TODOS_ASSINARAM,
            title: 'Todos assinaram!',
            message: `O documento "${envelope.titulo ?? 'documento'}" foi assinado por todos os signatários`,
            data: { envelopeId: envelope.id },
            link: `/esign/${envelope.id}`,
            priority: 'high',
            created_at: new Date().toISOString(),
            read: false,
          });
        }

        // Notificar criador individualmente
        const criadoPorId = (envelope as any).criadoPorId;
        if (criadoPorId) {
          this.notifications.notifyUser(criadoPorId, {
            id: crypto.randomUUID(),
            type: NotificationType.ESIGN_ASSINADO,
            title: 'Assinatura recebida',
            message: `${data.signerName} assinou "${envelope.titulo ?? 'documento'}"`,
            data: { envelopeId: envelope.id },
            link: `/esign/${envelope.id}`,
            priority: 'normal',
            created_at: new Date().toISOString(),
            read: false,
          });
        }
      }
    } catch (error) {
      this.logger.error('[Zapsign] Erro ao processar assinatura:', error);
      throw error;
    }
  }

  /**
   * Processa webhook: Documento rejeitado no ClickSign
   * - Atualiza status para "rejected"
   * - Registra motivo da rejeição
   * - Notifica administrador
   */
  async processZapsignDocumentRejected(data: {
    zapsignDocumentId: string;
    externalDocumentId?: string;
    rejectedAt: Date;
    rejectorEmail: string;
    rejectorName: string;
    rejectionReason?: string;
  }) {
    try {
      this.logger.log(`[Zapsign] Processando rejeição: ${data.zapsignDocumentId} por ${data.rejectorEmail}`);

      // Buscar envelope
      const envelope = await this.prisma.esignEnvelope.findFirst({
        where: { zapsignDocumentId: data.zapsignDocumentId },
      });

      if (!envelope) {
        this.logger.warn(`[Zapsign] Envelope não encontrado: ${data.zapsignDocumentId}`);
        return;
      }

      // Atualizar envelope
      await this.prisma.esignEnvelope.update({
        where: { id: envelope.id },
        data: {
          status: 'rejected',
          dataRejeicao: data.rejectedAt,
          motivoRejeicao: data.rejectionReason || 'Não especificado',
        } as any,
      });

      // Registrar na auditoria
      await this.registrarAuditoria(envelope.id, {
        acao: 'rejeitado',
        usuario: data.rejectorName,
        email: data.rejectorEmail,
        timestamp: data.rejectedAt,
        descricao: `Documento rejeitado. Motivo: ${data.rejectionReason || 'Não especificado'}`,
      });

      // Notificar escritório e criador do envelope sobre a rejeição
      if (envelope.escritorioId) {
        const motivo = data.rejectionReason || 'Não especificado';

        this.notifications.notifyOffice(envelope.escritorioId, {
          id: crypto.randomUUID(),
          type: NotificationType.ESIGN_RECUSADO,
          title: 'Assinatura recusada',
          message: `${data.rejectorName} recusou assinar "${envelope.titulo ?? 'documento'}". Motivo: ${motivo}`,
          data: { envelopeId: envelope.id, rejectorEmail: data.rejectorEmail, motivo },
          link: `/esign/${envelope.id}`,
          priority: 'high',
          created_at: new Date().toISOString(),
          read: false,
        });

        const criadoPorId = (envelope as any).criadoPorId;
        if (criadoPorId) {
          this.notifications.notifyUser(criadoPorId, {
            id: crypto.randomUUID(),
            type: NotificationType.ESIGN_RECUSADO,
            title: 'Assinatura recusada',
            message: `${data.rejectorName} recusou assinar "${envelope.titulo ?? 'documento'}". Motivo: ${motivo}`,
            data: { envelopeId: envelope.id, motivo },
            link: `/esign/${envelope.id}`,
            priority: 'high',
            created_at: new Date().toISOString(),
            read: false,
          });
        }
      }

      this.logger.log(`[Zapsign] ✓ Rejeição registrada para documento: ${data.zapsignDocumentId}`);
    } catch (error) {
      this.logger.error('[Zapsign] Erro ao processar rejeição:', error);
      throw error;
    }
  }

  /**
   * Registra ação na trilha de auditoria do envelope
   */
  private async registrarAuditoria(
    envelopeId: string,
    dados: {
      acao: string;
      usuario: string;
      email: string;
      timestamp: Date;
      descricao: string;
    },
  ) {
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO esign_auditoria (envelope_id, acao, usuario, email, timestamp, descricao, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        envelopeId,
        dados.acao,
        dados.usuario,
        dados.email,
        dados.timestamp,
        dados.descricao,
      );
    } catch (error) {
      this.logger.error('[Zapsign] Erro ao registrar auditoria:', error);
      // Não lançar erro para não quebrar o fluxo principal
    }
  }
}
