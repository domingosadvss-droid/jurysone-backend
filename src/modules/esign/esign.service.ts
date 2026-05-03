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
      link: `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${s.token}`,
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
        link: `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${s.token}`,
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
    const corpo = `
Olá, ${signatario.nome}!

Você recebeu um documento para assinar: "${tituloDocumento}"

Clique no link abaixo para acessar e assinar o documento:
${signatario.link}

Este link é pessoal e intransferível.

— Enviado automaticamente pelo JurysOne
    `.trim();

    const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#1a1a2e">Documento para assinar</h2>
  <p>Olá, <strong>${signatario.nome}</strong>!</p>
  <p>Você recebeu um documento para assinar: <strong>${tituloDocumento}</strong></p>
  <p style="margin:24px 0">
    <a href="${signatario.link}"
       style="background:#e85d00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">
      Assinar documento
    </a>
  </p>
  <p style="font-size:12px;color:#666">Este link é pessoal e intransferível.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  <p style="font-size:12px;color:#999">Enviado automaticamente pelo JurysOne</p>
</div>`.trim();

    const assunto = `[JurysOne] Documento para assinar: ${tituloDocumento}`;

    // 1. Resend SDK (preferencial)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const { Resend } = require('resend');
        const resendClient = new Resend(resendKey);
        const from = process.env.RESEND_FROM || 'JurysOne <noreply@jurysone.com>';
        const { error } = await resendClient.emails.send({
          from,
          to:      signatario.email,
          subject: assunto,
          text:    corpo,
          html:    htmlBody,
        });
        if (error) throw new Error(JSON.stringify(error));
        this.logger.log(`[E-sign] ✅ Resend: email enviado para ${signatario.email}`);
        return;
      } catch (err) {
        this.logger.warn(`[E-sign] Resend falhou: ${err.message}`);
        // continua para fallback SMTP
      }
    }

    // 2. Fallback: SMTP customizado
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.debug('[E-sign] Nenhum provedor de email configurado — envio ignorado');
      return;
    }

    let nodemailer: any;
    try { nodemailer = require('nodemailer'); }
    catch { this.logger.warn('[E-sign] nodemailer não instalado'); return; }

    const transporter = nodemailer.createTransport({
      host:   smtpHost,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from:    process.env.SMTP_FROM ?? smtpUser,
      to:      `"${signatario.nome}" <${signatario.email}>`,
      subject: assunto,
      text:    corpo,
      html:    htmlBody,
    });

    this.logger.log(`[E-sign] ✅ SMTP: email enviado para ${signatario.email}`);
  }

  // ════════════════════════════════════════════════════════════
  // MODELOS DE DOCUMENTOS (PDF próprio do escritório)
  // ════════════════════════════════════════════════════════════

  private readonly TIPOS_DOCUMENTO = [
    'contrato_honorarios',
    'procuracao',
    'declaracao_hipossuficiencia',
    'questionario_juridico',
  ] as const;

  /**
   * Salva o PDF do modelo no Supabase Storage e registra a URL na configuracao.
   */
  async uploadTemplate(
    escritorioId: string,
    tipo: string,
    buffer: Buffer,
    originalname: string,
  ): Promise<{ tipo: string; url: string; filename: string }> {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_KEY)');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const path     = `templates/${escritorioId}/${tipo}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(path, buffer, {
        contentType:  'application/pdf',
        upsert:       true,
      });

    if (uploadError) throw new Error(`Supabase upload falhou: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(path);
    const url = urlData?.publicUrl ?? '';

    // Salva referência na configuracao
    await this.prisma.configuracao.upsert({
      where:  { escritorioId_chave: { escritorioId, chave: `template_${tipo}` } },
      create: {
        id:          `${escritorioId}_template_${tipo}`,
        escritorioId,
        chave:       `template_${tipo}`,
        valor:       { url, filename: originalname, updatedAt: new Date().toISOString() },
        tipo:        'doc_template',
      },
      update: { valor: { url, filename: originalname, updatedAt: new Date().toISOString() } },
    });

    this.logger.log(`[Templates] PDF '${tipo}' salvo: ${url}`);
    return { tipo, url, filename: originalname };
  }

  /** Lista os modelos cadastrados pelo escritório */
  async getTemplates(escritorioId: string): Promise<Array<{ tipo: string; label: string; url: string | null; filename: string | null }>> {
    const labels: Record<string, string> = {
      contrato_honorarios:       'Contrato de Honorários',
      procuracao:                'Procuração Ad Judicia',
      declaracao_hipossuficiencia: 'Declaração de Hipossuficiência',
      questionario_juridico:     'Questionário Jurídico',
    };

    const rows = await this.prisma.configuracao.findMany({
      where: {
        escritorioId,
        chave: { in: this.TIPOS_DOCUMENTO.map(t => `template_${t}`) },
      },
    });

    return this.TIPOS_DOCUMENTO.map(tipo => {
      const row  = rows.find(r => r.chave === `template_${tipo}`);
      const val  = row?.valor as any;
      return {
        tipo,
        label:    labels[tipo] ?? tipo,
        url:      val?.url      ?? null,
        filename: val?.filename ?? null,
      };
    });
  }

  /** Remove um modelo do escritório */
  async deleteTemplate(escritorioId: string, tipo: string): Promise<void> {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await supabase.storage
        .from('documentos')
        .remove([`templates/${escritorioId}/${tipo}.pdf`]);
    }

    await this.prisma.configuracao.deleteMany({
      where: { escritorioId, chave: `template_${tipo}` },
    });

    this.logger.log(`[Templates] PDF '${tipo}' removido para escritório ${escritorioId}`);
  }

  /**
   * Baixa o PDF de um modelo customizado e retorna como base64.
   * Retorna null se não houver modelo cadastrado.
   */
  private async getTemplateBase64(escritorioId: string, tipo: string): Promise<string | null> {
    const row = await this.prisma.configuracao.findFirst({
      where: { escritorioId, chave: `template_${tipo}` },
    });

    const val = row?.valor as any;
    if (!val?.url) return null;

    try {
      const resp = await fetch(val.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buffer = await resp.arrayBuffer();
      return Buffer.from(buffer).toString('base64');
    } catch (err) {
      this.logger.warn(`[Templates] Falha ao baixar template '${tipo}': ${err.message}`);
      return null;
    }
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
    signatario: { nome: string; email: string; telefone?: string; cpf?: string; birthday?: string },
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
      const signingLink = `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${envelopeId}`;
      await this.enviarEmailAssinatura({ nome: signatario.nome, email: signatario.email, link: signingLink }, titulo);

      await this.prisma.esignEnvelope.update({
        where: { id: envelopeId },
        data: { status: 'enviado', enviadoEm: new Date() } as any,
      });

      this.logger.log(`[Esign] ✅ SMTP: email enviado para ${signatario.email}`);

      // WhatsApp em paralelo
      if (signatario.telefone) {
        const signingLink2 = `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${envelopeId}`;
        const msgWpp = `Olá, ${signatario.nome}!\n\nVocê recebeu documentos para assinar referentes ao seu processo jurídico.\n\nAssine pelo link:\n${signingLink2}\n\n— JurysOne`;
        this.whatsapp.enviarTextoSimples(signatario.telefone, msgWpp).catch(() => null);
      }

      return { provider: 'smtp' };
    } catch (smtpErr) {
      this.logger.warn(`[Esign] SMTP também falhou: ${smtpErr.message}`);
    }

    // WhatsApp como último recurso
    if (signatario.telefone) {
      const signingLink = `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${envelopeId}`;
      const msgWpp = `Olá, ${signatario.nome}!\n\nVocê recebeu documentos para assinar referentes ao seu processo jurídico.\n\nAssine pelo link:\n${signingLink}\n\n— JurysOne`;
      await this.whatsapp.enviarTextoSimples(signatario.telefone, msgWpp).catch(() => null);
    }

    return { provider: 'none' };
  }

  // ── ClickSign API v3 ─────────────────────────────────────────────────────
  // Fluxo: Envelope → Documento → Signatário → Requirement → Ativar → Notificar

  /** Aguarda `ms` milissegundos — usado para evitar 429 no rate limit da ClickSign */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async criarDocumentoClicksign(
    apiToken: string,
    envelopeLocalId: string,
    nome: string,
    mensagem: string,
    signatario: { nome: string; email: string; telefone?: string; cpf?: string; birthday?: string },
  ): Promise<{ docKey: string; signUrl: string } | null> {
    const base    = (process.env.CLICKSIGN_URL || 'https://app.clicksign.com').replace(/\/$/, '');
    const baseV3  = `${base}/api/v3`;
    const headers = {
      'Authorization': apiToken,
      'Content-Type':  'application/vnd.api+json',
      'Accept':        'application/vnd.api+json',
    };

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().replace('Z', '-03:00');

    // ── 1. Criar envelope (draft) ────────────────────────────────────────
    this.logger.log(`[ClickSign v3] Criando envelope: "${nome}"`);
    const envResp = await fetch(`${baseV3}/envelopes`, {
      method: 'POST', headers,
      body: JSON.stringify({
        data: {
          type: 'envelopes',
          attributes: { name: nome, deadline_at: deadline },
        },
      }),
    });
    const envText = await envResp.text();
    this.logger.log(`[ClickSign v3] Envelope: ${envResp.status} — ${envText.substring(0, 300)}`);
    const envData   = JSON.parse(envText);
    const envelopeId = envData?.data?.id;
    if (!envelopeId) throw new Error(`ClickSign: envelope nao criado — ${envText.substring(0, 200)}`);

    // ── 2. Buscar dados do atendimento ───────────────────────────────────
    const atendimento = await this.prisma.atendimento.findFirst({
      where:   { envelopeId: envelopeLocalId },
      include: { cliente: true },
    }).catch(() => null);

    const escritorioId   = atendimento?.escritorioId ?? '';
    const clienteEndereco = atendimento?.cliente
      ? (typeof atendimento.cliente.endereco === 'string'
          ? atendimento.cliente.endereco
          : JSON.stringify(atendimento.cliente.endereco ?? ''))
      : '';

    const dadosPdf = {
      clienteNome:     signatario.nome,
      clienteCpf:      signatario.cpf ?? atendimento?.cliente?.cpf ?? undefined,
      clienteEndereco: clienteEndereco || undefined,
      area:            atendimento?.area            ?? '',
      tipoAcao:        atendimento?.tipoAcao        ?? '',
      valorAcao:       atendimento?.valorAcao       ?? 0,
      tipoHonorario:   atendimento?.tipoHonorario   ?? '',
      valorHonorario:  atendimento?.valorHonorario  ?? 0,
      percentualExito: atendimento?.percentualExito ?? 0,
      formaPagamento:  atendimento?.formaPagamento  ?? '',
      numParcelas:     atendimento?.numParcelas     ?? 1,
      vencimento1Parc: atendimento?.vencimento1Parc ?? null,
    };

    // ── 3. Upload dos 4 documentos no envelope ────────────────────────────
    // Cada documento usa o PDF próprio do escritório (se enviado) ou gera o padrão.
    const TIPOS_DOC = [
      { tipo: 'contrato_honorarios',         label: 'Contrato_de_Honorarios'        },
      { tipo: 'procuracao',                  label: 'Procuracao_Ad_Judicia'          },
      { tipo: 'declaracao_hipossuficiencia', label: 'Declaracao_de_Hipossuficiencia' },
      { tipo: 'questionario_juridico',       label: 'Questionario_Juridico'          },
    ] as const;

    const documentIds: string[] = [];

    for (const { tipo, label } of TIPOS_DOC) {
      const templateB64 = escritorioId
        ? await this.getTemplateBase64(escritorioId, tipo)
        : null;

      const pdfBase64 = templateB64 ?? await this.gerarDocumentoPdf(tipo, dadosPdf);

      this.logger.log(`[ClickSign v3] Upload: ${label}.pdf`);
      const dResp = await fetch(`${baseV3}/envelopes/${envelopeId}/documents`, {
        method: 'POST', headers,
        body: JSON.stringify({
          data: {
            type: 'documents',
            attributes: {
              filename:       `${label}.pdf`,
              content_base64: `data:application/pdf;base64,${pdfBase64}`,
            },
          },
        }),
      });
      const dText = await dResp.text();
      this.logger.log(`[ClickSign v3] ${label}: ${dResp.status} — ${dText.substring(0, 200)}`);

      if (!dResp.ok) {
        this.logger.warn(`[ClickSign v3] Documento '${label}' rejeitado — continuando`);
        // Delay mesmo em erro para evitar burst de 429
        await this.sleep(800);
        continue;
      }

      const docId = JSON.parse(dText)?.data?.id;
      if (docId) documentIds.push(docId);

      // Aguarda entre uploads para não ultrapassar o rate limit da ClickSign
      await this.sleep(800);
    }

    if (documentIds.length === 0) {
      throw new Error('ClickSign: nenhum documento aceito pelo servidor');
    }

    // ── 4. Criar signatário no envelope ───────────────────────────────────
    await this.sleep(800);
    const nomeNormalizado = signatario.nome.trim().includes(' ')
      ? signatario.nome.trim()
      : `${signatario.nome.trim()} Signatario`;

    const signerAttributes: Record<string, any> = {
      name:  nomeNormalizado,
      email: signatario.email,
      communicate_events: {
        signature_request:  'email',
        signature_reminder: 'email',
        document_signed:    'email',
      },
    };

    if (signatario.cpf) {
      const digits = signatario.cpf.replace(/\D/g, '');
      if (digits.length === 11) {
        signerAttributes.documentation = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      }
    }
    if (signatario.birthday)  signerAttributes.birthday     = signatario.birthday;
    if (signatario.telefone)  signerAttributes.phone_number = signatario.telefone.replace(/\D/g, '');

    this.logger.log(`[ClickSign v3] Criando signatário: ${signatario.email}`);
    const sigResp = await fetch(`${baseV3}/envelopes/${envelopeId}/signers`, {
      method: 'POST', headers,
      body: JSON.stringify({ data: { type: 'signers', attributes: signerAttributes } }),
    });
    const sigText = await sigResp.text();
    this.logger.log(`[ClickSign v3] Signatário: ${sigResp.status} — ${sigText.substring(0, 300)}`);
    if (!sigResp.ok) throw new Error(`ClickSign: signatário rejeitado ${sigResp.status} — ${sigText.substring(0, 200)}`);

    const signerId = JSON.parse(sigText)?.data?.id;
    if (!signerId) throw new Error(`ClickSign: signatário sem ID — ${sigText.substring(0, 200)}`);

    // ── 5. Requisitos por documento (assinatura + autenticação individual) ─
    // Cada documento recebe:
    //   a) agree + role:sign      → assinatura do documento
    //   b) provide_evidence + email → autenticação individual por token
    await this.sleep(800);
    for (const docId of documentIds) {
      const rels = {
        document: { data: { type: 'documents', id: docId   } },
        signer:   { data: { type: 'signers',   id: signerId } },
      };

      // 5a. Assinatura
      const qResp = await fetch(`${baseV3}/envelopes/${envelopeId}/requirements`, {
        method: 'POST', headers,
        body: JSON.stringify({
          data: {
            type: 'requirements',
            attributes: { action: 'agree', role: 'sign' },
            relationships: rels,
          },
        }),
      });
      const qText = await qResp.text();
      this.logger.log(`[ClickSign v3] Req assinatura [${docId}]: ${qResp.status} — ${qText.substring(0, 150)}`);
      if (!qResp.ok) this.logger.warn(`[ClickSign v3] Req assinatura rejeitada: ${qText.substring(0, 200)}`);

      await this.sleep(600);

      // 5b. Autenticação individual por email
      const aResp = await fetch(`${baseV3}/envelopes/${envelopeId}/requirements`, {
        method: 'POST', headers,
        body: JSON.stringify({
          data: {
            type: 'requirements',
            attributes: { action: 'provide_evidence', auth: 'email' },
            relationships: rels,
          },
        }),
      });
      const aText = await aResp.text();
      this.logger.log(`[ClickSign v3] Req autenticação [${docId}]: ${aResp.status} — ${aText.substring(0, 150)}`);
      if (!aResp.ok) this.logger.warn(`[ClickSign v3] Req autenticação rejeitada: ${aText.substring(0, 200)}`);

      await this.sleep(600);
    }

    // ── 5. Ativar envelope (draft → running) ──────────────────────────────
    await this.sleep(800);
    this.logger.log(`[ClickSign v3] Ativando envelope ${envelopeId}`);
    const activResp = await fetch(`${baseV3}/envelopes/${envelopeId}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        data: {
          id:         envelopeId,
          type:       'envelopes',
          attributes: { status: 'running' },
        },
      }),
    });
    const activText = await activResp.text();
    this.logger.log(`[ClickSign v3] Ativar: ${activResp.status} — ${activText.substring(0, 200)}`);

    // ── 6. Enviar notificação por e-mail ──────────────────────────────────
    this.logger.log(`[ClickSign v3] Enviando notificação email`);
    const notifResp = await fetch(`${baseV3}/envelopes/${envelopeId}/notifications`, {
      method: 'POST', headers,
      body: JSON.stringify({
        data: { type: 'notifications', attributes: {} },
      }),
    });
    const notifText = await notifResp.text().catch(() => '');
    this.logger.log(`[ClickSign v3] Notificação: ${notifResp.status} — ${notifText.substring(0, 200)}`);

    const signUrl = `${base}/sign/${signerId}`;
    this.logger.log(`[ClickSign v3] ✅ Envelope ${envelopeId} | signatário ${signerId}`);
    return { docKey: envelopeId, signUrl };
  }

  /** Delega a geração de PDF para o método correto conforme o tipo */
  private async gerarDocumentoPdf(
    tipo: string,
    dados: Parameters<typeof this.gerarContratoBase64>[1],
  ): Promise<string> {
    switch (tipo) {
      case 'contrato_honorarios':         return this.gerarContratoBase64('Contrato de Honorarios', dados);
      case 'procuracao':                  return this.gerarProcuracaoBase64(dados);
      case 'declaracao_hipossuficiencia': return this.gerarDeclaracaoBase64(dados);
      case 'questionario_juridico':       return this.gerarQuestionarioBase64(dados);
      default:                            return this.gerarContratoBase64('Documento Juridico', dados);
    }
  }

  /** Procuração Ad Judicia */
  private async gerarProcuracaoBase64(dados: {
    clienteNome: string; clienteCpf?: string; clienteEndereco?: string; area?: string; tipoAcao?: string;
  }): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page    = pdfDoc.addPage([595, 842]);
    const margin  = 50; const W = 595 - margin * 2;
    let y = 800; const LINE = 15;
    const nl  = (n = 1) => { y -= LINE * n; };
    const sep = () => { page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) }); nl(); };
    const text = (str: string, opts: { size?: number; font?: any; indent?: number; center?: boolean } = {}) => {
      const { size = 10, font = regular, indent = 0, center = false } = opts;
      const maxW = W - indent; const words = str.split(' '); let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          const x = center ? margin + (W - font.widthOfTextAtSize(line, size)) / 2 : margin + indent;
          page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) }); nl(); line = word;
        } else { line = test; }
      }
      if (line) { const x = center ? margin + (W - font.widthOfTextAtSize(line, size)) / 2 : margin + indent; page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) }); nl(); }
    };

    text('PROCURACAO AD JUDICIA ET EXTRA', { font: bold, size: 13, center: true });
    nl(0.5); sep();
    text('OUTORGANTE', { font: bold, size: 11 }); nl(0.3);
    text(`Nome: ${dados.clienteNome}`, { indent: 10 });
    if (dados.clienteCpf) { const d = dados.clienteCpf.replace(/\D/g, ''); text(`CPF: ${d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`, { indent: 10 }); }
    if (dados.clienteEndereco && dados.clienteEndereco !== '""') text(`Endereco: ${dados.clienteEndereco}`, { indent: 10 });
    nl(); sep();
    text('OUTORGADO(A)', { font: bold, size: 11 }); nl(0.3);
    text('Advogado(a) / Escritorio de Advocacia responsavel pelo atendimento.', { indent: 10 });
    nl(); sep();
    text('PODERES', { font: bold, size: 11 }); nl(0.3);
    text('Pelo presente instrumento, o(a) OUTORGANTE nomeia e constitui seu bastante procurador o(a) OUTORGADO(A), a quem confere amplos poderes para o foro em geral, em qualquer juizo, instancia ou tribunal, podendo propor as acoes que forem necessarias e defender-se das que forem propostas, seguindo-as ate final decisao, usando todos os recursos ordinarios e extraordinarios.');
    nl(0.5);
    text('Fica ainda o(a) outorgado(a) autorizado(a) a confessar, desistir, transigir, firmar compromissos ou acordos, receber e dar quitacao, e praticar todos os demais atos necessarios ao fiel cumprimento deste mandato, inclusive para os fins do art. 105 do CPC.');
    nl(); sep();
    if (dados.area) { text(`Area: ${dados.area}`, { indent: 10 }); }
    if (dados.tipoAcao) { text(`Objeto: ${dados.tipoAcao}`, { indent: 10 }); nl(); }
    sep();
    text(`Local e data: ____________, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.`);
    nl(2);
    page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: rgb(0, 0, 0) }); nl();
    text('Assinatura do Outorgante', { indent: 10 }); nl(0.3);
    text(dados.clienteNome, { indent: 10 });
    nl(2);
    text('Este documento foi gerado eletronicamente pelo JurysOne — Lei n. 14.063/2020.', { size: 8 });
    return Buffer.from(await pdfDoc.save()).toString('base64');
  }

  /** Declaração de Hipossuficiência */
  private async gerarDeclaracaoBase64(dados: {
    clienteNome: string; clienteCpf?: string; clienteEndereco?: string;
  }): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page    = pdfDoc.addPage([595, 842]);
    const margin  = 50; const W = 595 - margin * 2;
    let y = 800; const LINE = 15;
    const nl  = (n = 1) => { y -= LINE * n; };
    const sep = () => { page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) }); nl(); };
    const text = (str: string, opts: { size?: number; font?: any; indent?: number; center?: boolean } = {}) => {
      const { size = 10, font = regular, indent = 0, center = false } = opts;
      const maxW = W - indent; const words = str.split(' '); let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          const x = center ? margin + (W - font.widthOfTextAtSize(line, size)) / 2 : margin + indent;
          page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) }); nl(); line = word;
        } else { line = test; }
      }
      if (line) { const x = center ? margin + (W - font.widthOfTextAtSize(line, size)) / 2 : margin + indent; page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) }); nl(); }
    };

    text('DECLARACAO DE HIPOSSUFICIENCIA', { font: bold, size: 13, center: true });
    nl(0.5); sep();
    const cpfFmt = dados.clienteCpf ? dados.clienteCpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '___.___.___-__';
    text(`Eu, ${dados.clienteNome}, portador(a) do CPF n. ${cpfFmt}${dados.clienteEndereco && dados.clienteEndereco !== '""' ? `, residente em ${dados.clienteEndereco}` : ''}, DECLARO, sob as penas da lei, que nao possuo condicoes financeiras de arcar com o pagamento das custas processuais e honorarios advocaticios sem prejuizo do meu proprio sustento e de minha familia.`);
    nl();
    text('Declaro ainda estar ciente de que a falsidade desta declaracao configura o crime previsto no art. 299 do Codigo Penal Brasileiro (falsidade ideologica), sujeitando-me as respectivas penalidades.');
    nl();
    text('Por ser expressao da verdade, firmo a presente declaracao.');
    nl(); sep();
    text(`Local e data: ____________, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.`);
    nl(3);
    page.drawLine({ start: { x: margin + W / 4, y }, end: { x: margin + (W * 3) / 4, y }, thickness: 0.5, color: rgb(0, 0, 0) }); nl();
    text(dados.clienteNome, { center: true }); nl(0.3);
    text(`CPF: ${cpfFmt}`, { center: true });
    nl(2);
    text('Este documento foi gerado eletronicamente pelo JurysOne — Lei n. 14.063/2020.', { size: 8 });
    return Buffer.from(await pdfDoc.save()).toString('base64');
  }

  /** Questionário Jurídico */
  private async gerarQuestionarioBase64(dados: {
    clienteNome: string; clienteCpf?: string; area?: string; tipoAcao?: string;
  }): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page    = pdfDoc.addPage([595, 842]);
    const margin  = 50; const W = 595 - margin * 2;
    let y = 800; const LINE = 15;
    const nl  = (n = 1) => { y -= LINE * n; };
    const sep = () => { page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) }); nl(); };
    const text = (str: string, opts: { size?: number; font?: any; indent?: number; center?: boolean } = {}) => {
      const { size = 10, font = regular, indent = 0, center = false } = opts;
      const maxW = W - indent; const words = str.split(' '); let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          const x = center ? margin + (W - font.widthOfTextAtSize(line, size)) / 2 : margin + indent;
          page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) }); nl(); line = word;
        } else { line = test; }
      }
      if (line) { const x = center ? margin + (W - font.widthOfTextAtSize(line, size)) / 2 : margin + indent; page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) }); nl(); }
    };
    const linha = (label: string, linhas = 1) => {
      text(label, { font: bold, size: 9 }); nl(0.2);
      for (let i = 0; i < linhas; i++) {
        page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.4, color: rgb(0.75, 0.75, 0.75) }); nl(1.4);
      }
    };

    text('QUESTIONARIO JURIDICO', { font: bold, size: 13, center: true });
    nl(0.5); sep();
    text('IDENTIFICACAO DO CLIENTE', { font: bold, size: 11 }); nl(0.3);
    text(`Nome: ${dados.clienteNome}`, { indent: 10 });
    if (dados.clienteCpf) { const d = dados.clienteCpf.replace(/\D/g, ''); text(`CPF: ${d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`, { indent: 10 }); }
    if (dados.area) text(`Area Juridica: ${dados.area}`, { indent: 10 });
    if (dados.tipoAcao) text(`Tipo de Acao: ${dados.tipoAcao}`, { indent: 10 });
    nl(); sep();
    text('HISTORICO DO CASO', { font: bold, size: 11 }); nl(0.3);
    text('Descreva brevemente os fatos que motivaram a busca pelo servico juridico:'); nl(0.3);
    linha('', 4);
    sep();
    text('DOCUMENTOS DISPONIVEIS', { font: bold, size: 11 }); nl(0.3);
    const checks = ['Contratos / acordos', 'Recibos / comprovantes de pagamento', 'Correspondencias / mensagens', 'Fotografias / videos', 'Boletim de ocorrencia', 'Laudos / pericias', 'Outros documentos'];
    for (const c of checks) { page.drawRectangle({ x: margin + 10, y: y - 1, width: 10, height: 10, borderColor: rgb(0.4, 0.4, 0.4), borderWidth: 0.5 }); text(`    ${c}`, { indent: 28 }); nl(-0.3); }
    nl(0.5); sep();
    text('INFORMACOES ADICIONAIS', { font: bold, size: 11 }); nl(0.3);
    linha('Ja houve tentativas anteriores de resolver este caso?', 2);
    linha('Existem prazos urgentes a serem observados?', 2);
    nl(); sep();
    text('Declaro que as informacoes prestadas neste questionario sao verdadeiras.');
    nl(2);
    page.drawLine({ start: { x: margin, y }, end: { x: margin + W, y }, thickness: 0.5, color: rgb(0, 0, 0) }); nl();
    text('Assinatura do Cliente', { indent: 10 }); nl(0.3);
    text(dados.clienteNome, { indent: 10 });
    nl(2);
    text('Este documento foi gerado eletronicamente pelo JurysOne — Lei n. 14.063/2020.', { size: 8 });
    return Buffer.from(await pdfDoc.save()).toString('base64');
  }

  /**
   * Gera o PDF do Contrato de Honorários usando pdf-lib.
   * Preenche com dados reais do atendimento (cliente, área, honorários).
   */
  private async gerarContratoBase64(
    titulo: string,
    dados: {
      clienteNome:     string;
      clienteCpf?:     string;
      clienteEndereco?: string;
      area:            string;
      tipoAcao?:       string;
      valorAcao?:      number;
      tipoHonorario?:  string;
      valorHonorario?: number;
      percentualExito?: number;
      formaPagamento?: string;
      numParcelas?:    number;
      vencimento1Parc?: Date | null;
    },
  ): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');

    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // A4 em pontos (595 × 842)
    const page   = pdfDoc.addPage([595, 842]);
    const margin = 50;
    const W      = 595 - margin * 2;

    let y = 800;
    const LINE = 15;

    // ── helpers ──────────────────────────────────────────────────────────────
    const nl  = (n = 1) => { y -= LINE * n; };
    const sep = () => {
      page.drawLine({
        start: { x: margin, y },
        end:   { x: margin + W, y },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
      nl();
    };

    /** Escreve texto com quebra automática de linha */
    const text = (
      str: string,
      opts: { size?: number; font?: typeof regular; indent?: number; center?: boolean } = {},
    ) => {
      const { size = 10, font = regular, indent = 0, center = false } = opts;
      const maxW = W - indent;
      const words = str.split(' ');
      let line = '';

      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          const x = center
            ? margin + (W - font.widthOfTextAtSize(line, size)) / 2
            : margin + indent;
          page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) });
          nl();
          line = word;
        } else {
          line = test;
        }
      }
      if (line) {
        const x = center
          ? margin + (W - font.widthOfTextAtSize(line, size)) / 2
          : margin + indent;
        page.drawText(line, { x, y, font, size, color: rgb(0, 0, 0) });
        nl();
      }
    };

    // Formata valor em reais
    const brl = (v: number) =>
      v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Data longa em pt-BR
    const dataLonga = (d: Date) =>
      d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    // ── Cabeçalho ─────────────────────────────────────────────────────────────
    text('JURYSONE - GESTAO JURIDICA', { font: bold, size: 10, center: true });
    nl(0.5);
    text('CONTRATO DE HONORARIOS ADVOCATICIOS', { font: bold, size: 13, center: true });
    nl();
    sep();

    // ── Partes ────────────────────────────────────────────────────────────────
    text('PARTES', { font: bold, size: 11 });
    nl(0.3);
    text(`CONTRATANTE: ${dados.clienteNome}`, { indent: 10 });
    if (dados.clienteCpf) {
      const cpfFmt = dados.clienteCpf.replace(/\D/g, '')
        .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      text(`CPF: ${cpfFmt}`, { indent: 10 });
    }
    if (dados.clienteEndereco && dados.clienteEndereco !== '""') {
      text(`Endereco: ${dados.clienteEndereco}`, { indent: 10 });
    }
    nl(0.5);
    text('CONTRATADO(A): Escritorio de Advocacia / Advogado(a) Responsavel', { indent: 10 });
    nl();
    sep();

    // ── Objeto ────────────────────────────────────────────────────────────────
    text('CLAUSULA 1 - DO OBJETO', { font: bold, size: 11 });
    nl(0.3);

    const areaTexto   = dados.area     || 'Direito';
    const acaoTexto   = dados.tipoAcao || 'acao judicial';
    const valorCausa  = dados.valorAcao && dados.valorAcao > 0
      ? `, com valor estimado de causa de ${brl(dados.valorAcao)}`
      : '';

    text(
      `O(A) CONTRATADO(A) compromete-se a prestar servicos advocaticios ao CONTRATANTE ` +
      `na area de ${areaTexto}, referente a ${acaoTexto}${valorCausa}, ` +
      `realizando todos os atos necessarios para a defesa dos direitos do contratante ` +
      `em juizo e fora dele.`,
    );
    nl();
    sep();

    // ── Honorários ────────────────────────────────────────────────────────────
    text('CLAUSULA 2 - DOS HONORARIOS', { font: bold, size: 11 });
    nl(0.3);

    if (dados.tipoHonorario === 'percentual' && dados.percentualExito) {
      text(
        `A titulo de honorarios advocaticios, o CONTRATANTE pagara ao CONTRATADO(A) ` +
        `${dados.percentualExito}% (${dados.percentualExito} por cento) sobre o valor ` +
        `efetivamente obtido em caso de exito na demanda, incluindo eventuais acordos.`,
      );
    } else if (dados.valorHonorario && dados.valorHonorario > 0) {
      const parcelas = dados.numParcelas || 1;
      const vencto   = dados.vencimento1Parc ? dataLonga(new Date(dados.vencimento1Parc)) : '';
      const pagFmt   = dados.formaPagamento?.toUpperCase() || 'A COMBINAR';

      text(
        `A titulo de honorarios advocaticios, o CONTRATANTE pagara ao CONTRATADO(A) ` +
        `o valor de ${brl(dados.valorHonorario)}, ` +
        (parcelas > 1
          ? `parcelado em ${parcelas}x${vencto ? `, com vencimento da 1a parcela em ${vencto}` : ''}, `
          : vencto ? `com vencimento em ${vencto}, ` : '') +
        `mediante pagamento via ${pagFmt}.`,
      );
    } else {
      text('Os honorarios serao definidos conforme acordo entre as partes.');
    }
    nl();
    sep();

    // ── Prazo ─────────────────────────────────────────────────────────────────
    text('CLAUSULA 3 - DO PRAZO', { font: bold, size: 11 });
    nl(0.3);
    text(
      'O presente contrato vigorara pelo prazo necessario para a conclusao da ' +
      'acao judicial ou extrajudicial objeto deste instrumento, podendo ser ' +
      'rescindido mediante comunicacao previa de 30 (trinta) dias.',
    );
    nl();
    sep();

    // ── Disposições gerais ────────────────────────────────────────────────────
    text('CLAUSULA 4 - DISPOSICOES GERAIS', { font: bold, size: 11 });
    nl(0.3);
    text(
      'Em caso de desistencia unilateral pelo CONTRATANTE, os honorarios ' +
      'correspondentes aos servicos ja realizados serao devidos integralmente, ' +
      'sem prejuizo de eventuais indenizacoes previstas em lei. O CONTRATADO(A) ' +
      'compromete-se a manter sigilo absoluto sobre as informacoes recebidas ' +
      'em razao deste contrato.',
    );
    nl();
    sep();

    // ── Assinaturas ──────────────────────────────────────────────────────────
    const hoje = dataLonga(new Date());
    text(`Local e data: ____________, ${hoje}.`);
    nl(2);

    // Linha contratante
    const midX = margin + W / 2;
    page.drawLine({ start: { x: margin, y }, end: { x: midX - 10, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: midX + 10, y }, end: { x: margin + W, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    nl();
    text('CONTRATANTE', { center: false, indent: 30 });
    page.drawText('CONTRATADO(A)', { x: midX + 30, y, font: regular, size: 10, color: rgb(0, 0, 0) });
    nl();
    text(dados.clienteNome, { indent: 30 });
    nl(2);

    text(
      'Este documento foi gerado e enviado eletronicamente pelo sistema JurysOne. ' +
      'A assinatura eletronica tem validade juridica nos termos da Lei n. 14.063/2020.',
      { size: 8 },
    );

    // ── Salva e converte para base64 ──────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes).toString('base64');
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
