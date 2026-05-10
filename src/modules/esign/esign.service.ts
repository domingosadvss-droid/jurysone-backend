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
import * as fs   from 'fs';
import * as path from 'path';

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
    const corpo = [
      `Olá, ${signatario.nome}!`,
      ``,
      `Você recebeu um documento para assinar: "${tituloDocumento}"`,
      ``,
      `Clique no link abaixo para acessar e assinar o documento:`,
      `${signatario.link}`,
      ``,
      `Este link é pessoal e intransferível.`,
      ``,
      `— JurysOne`,
    ].join('\n');

    const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:#1a1a2e;padding:24px 32px">
            <h1 style="margin:0;color:#ffffff;font-family:Arial,sans-serif;font-size:22px">JurysOne</h1>
            <p style="margin:4px 0 0;color:#aaa;font-size:13px;font-family:Arial,sans-serif">Gestão Jurídica</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;font-family:Arial,sans-serif;color:#333">
            <h2 style="margin:0 0 16px;font-size:20px;color:#1a1a2e">Documento para assinar</h2>
            <p style="margin:0 0 8px;font-size:15px">Olá, <strong>${signatario.nome}</strong>!</p>
            <p style="margin:0 0 24px;font-size:15px">
              Você recebeu o documento <strong>${tituloDocumento}</strong> para assinatura digital.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px">
              <tr>
                <td style="background:#e85d00;border-radius:6px;padding:14px 28px">
                  <a href="${signatario.link}"
                     style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;display:block">
                    ✍ Assinar documento
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#666">
              Se o botão não funcionar, copie e cole o link abaixo no navegador:
            </p>
            <p style="margin:0 0 24px;font-size:12px;color:#999;word-break:break-all">${signatario.link}</p>
            <hr style="border:none;border-top:1px solid #eee;margin:0 0 16px">
            <p style="margin:0;font-size:12px;color:#aaa">
              Este link é pessoal e intransferível. Não compartilhe com terceiros.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8f8f8;padding:16px 32px;font-family:Arial,sans-serif;font-size:12px;color:#aaa;text-align:center">
            Enviado automaticamente pelo JurysOne · jurysone.com.br
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const assunto = `[JurysOne] Assinar: ${tituloDocumento}`;

    // 1. Resend SDK (preferencial)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const { Resend } = require('resend');
        const resendClient = new Resend(resendKey);
        const from = process.env.RESEND_FROM || 'JurysOne <noreply@jurysone.com>';
        this.logger.log(`[E-sign] Resend: enviando para ${signatario.email} | from=${from} | link=${signatario.link.substring(0, 60)}`);
        const { data, error } = await resendClient.emails.send({
          from,
          to:      [signatario.email],
          subject: assunto,
          text:    corpo,
          html:    htmlBody,
        });
        if (error) throw new Error(JSON.stringify(error));
        this.logger.log(`[E-sign] ✅ Resend OK: id=${data?.id} → ${signatario.email}`);
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
  async getTemplateBase64(escritorioId: string, tipo: string): Promise<string | null> {
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
    const clickToken = await this.chaves.getChave(escritorioId, 'clicksign');

    // ── 1. ClickSign configurado: tenta exclusivamente o ClickSign ──────────
    // Se falhar, NÃO envia SMTP — o link jurysone.com.br/esign/assinar/{uuid}
    // retorna 404 e é pior que nenhum email. O escritório reenvio pelo dashboard.
    if (clickToken && signatario.email) {
      try {
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

          // WhatsApp em paralelo com o link real de assinatura
          if (signatario.telefone && resultado.signUrl) {
            const msgWpp = `Olá, ${signatario.nome}!\n\nVocê recebeu documentos para assinar referentes ao seu processo jurídico.\n\nAssine pelo link:\n${resultado.signUrl}\n\n— JurysOne`;
            this.whatsapp.enviarTextoSimples(signatario.telefone, msgWpp).catch(() => null);
          }

          return { provider: 'clicksign' };
        }
      } catch (err) {
        this.logger.warn(`[Esign] ClickSign falhou — SMTP omitido para evitar link quebrado: ${err.message}`);
      }

      return { provider: 'none' };
    }

    // ── 2. ClickSign NÃO configurado: fallback SMTP ─────────────────────────
    try {
      const signingLink = `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://jurysone.com'}/esign/assinar/${envelopeId}`;
      await this.enviarEmailAssinatura({ nome: signatario.nome, email: signatario.email, link: signingLink }, titulo);

      await this.prisma.esignEnvelope.update({
        where: { id: envelopeId },
        data: { status: 'enviado', enviadoEm: new Date() } as any,
      });

      this.logger.log(`[Esign] ✅ SMTP: email enviado para ${signatario.email}`);

      if (signatario.telefone) {
        const msgWpp = `Olá, ${signatario.nome}!\n\nVocê recebeu documentos para assinar referentes ao seu processo jurídico.\n\nAssine pelo link:\n${signingLink}\n\n— JurysOne`;
        this.whatsapp.enviarTextoSimples(signatario.telefone, msgWpp).catch(() => null);
      }

      return { provider: 'smtp' };
    } catch (smtpErr) {
      this.logger.warn(`[Esign] SMTP falhou: ${smtpErr.message}`);
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

  /**
   * Wrapper de fetch com retry automático para 429 (Too Many Requests).
   * Respeita o header Retry-After se presente; caso contrário usa backoff exponencial.
   * Máximo de 4 tentativas (1 original + 3 retries).
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries = 3,
  ): Promise<Response> {
    let attempt = 0;
    while (true) {
      const resp = await fetch(url, options);

      if (resp.status !== 429 || attempt >= maxRetries) {
        return resp;
      }

      attempt++;
      const retryAfter = resp.headers.get('Retry-After');
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(2000 * Math.pow(2, attempt - 1), 16000); // 2s → 4s → 8s → 16s

      this.logger.warn(
        `[ClickSign v3] 429 recebido — aguardando ${waitMs}ms antes da tentativa ${attempt + 1}/${maxRetries + 1}`,
      );
      await this.sleep(waitMs);
    }
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
    const authValue = apiToken.startsWith('Bearer ') ? apiToken : `Bearer ${apiToken}`;
    const headers = {
      'Authorization': authValue,
      'Content-Type':  'application/vnd.api+json',
      'Accept':        'application/vnd.api+json',
    };

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().replace('Z', '-03:00');

    // ── 1. Criar envelope (draft) ────────────────────────────────────────
    this.logger.log(`[ClickSign v3] Criando envelope: "${nome}"`);
    const envResp = await this.fetchWithRetry(`${baseV3}/envelopes`, {
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

    // ── 2. Buscar dados do atendimento para gerar o PDF real ─────────────
    const atendimento = await this.prisma.atendimento.findFirst({
      where:   { envelopeId: envelopeLocalId },
      include: { cliente: true },
    }).catch(() => null);

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

    // ── 3. Upload dos 4 documentos do atendimento ────────────────────────
    const escritorioId = atendimento?.escritorioId ?? '';

    const uploadDoc = async (tipo: string, filename: string, pdfFallback: () => Promise<string>): Promise<string> => {
      const b64 = await pdfFallback();
      this.logger.log(`[ClickSign v3] Upload: ${filename} (gerador pdf-lib)`);
      const resp = await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}/documents`, {
        method: 'POST', headers,
        body: JSON.stringify({
          data: { type: 'documents', attributes: { filename, content_base64: `data:application/pdf;base64,${b64}` } },
        }),
      });
      const text = await resp.text();
      this.logger.log(`[ClickSign v3] Doc ${filename}: ${resp.status} — ${text.substring(0, 200)}`);
      const id = JSON.parse(text)?.data?.id;
      if (!id) throw new Error(`ClickSign: falha upload ${filename} — ${text.substring(0, 200)}`);
      return id;
    };

    const [documentId, docProcId, docDeclId, docQuestId] = await Promise.all([
      uploadDoc('contrato_honorarios',        'Contrato_de_Prestacao_de_Servico.pdf', () => this.gerarContratoBase64('Contrato de Prestacao de Servico', dadosPdf)),
      uploadDoc('procuracao',                 'Procuracao_Ad_Judicia.pdf',            () => this.gerarProcuracaoBase64(dadosPdf)),
      uploadDoc('declaracao_hipossuficiencia','Declaracao_de_Hipossuficiencia.pdf',   () => this.gerarDeclaracaoBase64(dadosPdf)),
      uploadDoc('renuncia',                   'Carta_de_Renuncia.pdf',               () => this.gerarRenunciaBase64(dadosPdf)),
    ]);

    // ── 4. Criar signatário no envelope ───────────────────────────────────
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
    const sigResp = await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}/signers`, {
      method: 'POST', headers,
      body: JSON.stringify({ data: { type: 'signers', attributes: signerAttributes } }),
    });
    const sigText = await sigResp.text();
    this.logger.log(`[ClickSign v3] Signatário: ${sigResp.status} — ${sigText.substring(0, 400)}`);
    if (!sigResp.ok) throw new Error(`ClickSign: signatário rejeitado ${sigResp.status} — ${sigText.substring(0, 300)}`);

    const signerParsed = JSON.parse(sigText);
    const signerId     = signerParsed?.data?.id;
    // ClickSign v3 retorna o link de assinatura nos atributos do signatário
    const signerSignUrl = signerParsed?.data?.attributes?.sign_url ?? null;
    if (!signerId) throw new Error(`ClickSign: signatário sem ID — ${sigText.substring(0, 200)}`);

    const reqRels = {
      document: { data: { type: 'documents', id: documentId } },
      signer:   { data: { type: 'signers',   id: signerId   } },
    };

    // ── 5a. Requisito de assinatura (agree + sign) ─────────────────────────
    this.logger.log(`[ClickSign v3] Criando requisito de assinatura`);
    const qualResp = await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}/requirements`, {
      method: 'POST', headers,
      body: JSON.stringify({
        data: {
          type: 'requirements',
          attributes: { action: 'agree', role: 'sign' },
          relationships: reqRels,
        },
      }),
    });
    const qualText = await qualResp.text();
    this.logger.log(`[ClickSign v3] Req assinatura: ${qualResp.status} — ${qualText.substring(0, 400)}`);
    if (!qualResp.ok) throw new Error(`ClickSign: req assinatura rejeitada ${qualResp.status} — ${qualText.substring(0, 200)}`);

    // ── 5b. Requisito de autenticação (provide_evidence + email) ──────────
    this.logger.log(`[ClickSign v3] Criando requisito de autenticação: email`);
    const authResp = await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}/requirements`, {
      method: 'POST', headers,
      body: JSON.stringify({
        data: {
          type: 'requirements',
          attributes: { action: 'provide_evidence', auth: 'email' },
          relationships: reqRels,
        },
      }),
    });
    const authText = await authResp.text();
    this.logger.log(`[ClickSign v3] Req autenticação: ${authResp.status} — ${authText.substring(0, 400)}`);
    if (!authResp.ok) throw new Error(`ClickSign: req autenticação rejeitada ${authResp.status} — ${authText.substring(0, 200)}`);

    // ── 5c. Requisitos de assinatura e autenticação para todos os documentos ─
    for (const extraDocId of [docProcId, docDeclId, docQuestId]) {
      const extraRels = {
        document: { data: { type: 'documents', id: extraDocId } },
        signer:   { data: { type: 'signers',   id: signerId   } },
      };
      await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}/requirements`, {
        method: 'POST', headers,
        body: JSON.stringify({
          data: { type: 'requirements', attributes: { action: 'agree', role: 'sign' }, relationships: extraRels },
        }),
      });
      await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}/requirements`, {
        method: 'POST', headers,
        body: JSON.stringify({
          data: { type: 'requirements', attributes: { action: 'provide_evidence', auth: 'email' }, relationships: extraRels },
        }),
      });
      this.logger.log(`[ClickSign v3] Req sign+auth doc ${extraDocId}: ok`);
    }

    // ── 6. Ativar envelope (draft → running) ──────────────────────────────
    this.logger.log(`[ClickSign v3] Ativando envelope ${envelopeId}`);
    const activResp = await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}`, {
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
    const notifResp = await this.fetchWithRetry(`${baseV3}/envelopes/${envelopeId}/notifications`, {
      method: 'POST', headers,
      body: JSON.stringify({
        data: { type: 'notifications', attributes: {} },
      }),
    });
    const notifText = await notifResp.text().catch(() => '');
    this.logger.log(`[ClickSign v3] Notificação: ${notifResp.status} — ${notifText.substring(0, 200)}`);

    // Usa o sign_url retornado pela API; fallback para URL construída manualmente
    const signUrl = signerSignUrl ?? `${base}/sign/${signerId}`;
    this.logger.log(`[ClickSign v3] ✅ Envelope ${envelopeId} | signatário ${signerId} | url=${signUrl}`);
    return { docKey: envelopeId, signUrl };
  }

  /**
   * Gera os 4 PDFs jurídicos preenchidos com dados do cliente.
   * Retorna array de { nome, base64 } para envio ao ClickSign.
   */
  async gerarTodosDocumentosPdf(dados: {
    clienteNome:         string;
    clienteCpf?:         string;
    clienteRG?:          string;
    clienteRGOrgao?:     string;
    clienteNaciona?:     string;
    clienteEstadoCivil?: string;
    clienteProfissao?:   string;
    clienteTelefone?:    string;
    clienteEmail?:       string;
    clienteEndereco?:    string;
    clienteNum?:         string;
    clienteCompl?:       string;
    clienteBairro?:      string;
    clienteCidade?:      string;
    clienteEstado?:      string;
    clienteCEP?:         string;
    area:                string;
    tipoAcao?:           string;
    valorAcao?:          number;
    tipoHonorario?:      string;
    valorHonorario?:     number;
    percentualExito?:    number;
    formaPagamento?:     string;
    numParcelas?:        number;
    vencimento1Parc?:    Date | null;
    cidade?:             string;
  }): Promise<Array<{ nome: string; base64: string }>> {
    const [contrato, procuracao, declaracao, renuncia] = await Promise.all([
      this.gerarContratoBase64('Contrato de Prestacao de Servicos', dados),
      this.gerarProcuracaoBase64(dados),
      this.gerarDeclaracaoBase64(dados),
      this.gerarRenunciaBase64(dados),
    ]);
    return [
      { nome: 'Contrato_de_Prestacao_de_Servicos', base64: contrato   },
      { nome: 'Procuracao_Ad_Judicia',             base64: procuracao },
      { nome: 'Declaracao_de_Hipossuficiencia',    base64: declaracao },
      { nome: 'Carta_de_Renuncia',                 base64: renuncia   },
    ];
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
      case 'renuncia':                    return this.gerarRenunciaBase64(dados);
      default:                            return this.gerarContratoBase64('Documento Juridico', dados);
    }
  }

  /** Procuracao Ad Judicia et Extra — completa */
  private async gerarProcuracaoBase64(dados: {
    clienteNome: string; clienteCpf?: string; clienteRG?: string; clienteRGOrgao?: string;
    clienteNaciona?: string; clienteEstadoCivil?: string; clienteProfissao?: string;
    clienteEndereco?: string; clienteNum?: string; clienteCompl?: string;
    clienteBairro?: string; clienteCidade?: string; clienteEstado?: string; clienteCEP?: string;
    tipoAcao?: string; cidade?: string; area?: string;
  }): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const M = 50; const W = 595 - M * 2; const LINE = 14;
    const AZUL = rgb(0.06, 0.18, 0.37); const CINZA = rgb(0.33, 0.33, 0.33);
    let page: any = pdfDoc.addPage([595, 842]); let y = 790;
    const logoPath = path.join(process.cwd(), 'public', 'logo-domingos.png');
    const logoImg  = fs.existsSync(logoPath) ? await pdfDoc.embedPng(fs.readFileSync(logoPath)) : null;
    const hdr = (pg: any) => {
      if (logoImg) {
        const lh = 46; const lw = logoImg.width * (lh / logoImg.height);
        const gap = 14;
        const t1 = 'DOMINGOS'; const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL';
        const tw = Math.max(bold.widthOfTextAtSize(t1, 20), regular.widthOfTextAtSize(t2, 7.5));
        const totalW = lw + gap + tw;
        const startX = M + (W - totalW) / 2;
        pg.drawImage(logoImg, { x: startX, y: 806, width: lw, height: lh });
        const tx = startX + lw + gap;
        pg.drawText(t1, { x: tx, y: 832, font: bold, size: 20, color: rgb(0.23, 0.23, 0.23) });
        pg.drawText(t2, { x: tx, y: 818, font: regular, size: 7.5, color: rgb(0.4, 0.4, 0.4) });
      } else {
        const t1 = 'DOMINGOS'; const t1w = bold.widthOfTextAtSize(t1, 18);
        pg.drawText(t1, { x: M + (W - t1w) / 2, y: 822, font: bold, size: 18, color: rgb(0.27, 0.27, 0.27) });
        const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL'; const t2w = regular.widthOfTextAtSize(t2, 8);
        pg.drawText(t2, { x: M + (W - t2w) / 2, y: 809, font: regular, size: 8, color: rgb(0.45, 0.45, 0.45) });
      }
      pg.drawLine({ start: { x: M, y: 803 }, end: { x: M + W, y: 803 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
    };
    const ftr = (pg: any) => {
      pg.drawLine({ start: { x: M, y: 48 }, end: { x: M + W, y: 48 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      const f1 = 'R. 501, no 145, Sl. 05, centro, Balneario Camboriu'; const f1w = regular.widthOfTextAtSize(f1, 8);
      pg.drawText(f1, { x: M + (W - f1w) / 2, y: 37, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
      const f2 = 'jonathan@domingosadvocacia.com.br     47 -999159178'; const f2w = regular.widthOfTextAtSize(f2, 8);
      pg.drawText(f2, { x: M + (W - f2w) / 2, y: 26, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
    };
    const np  = () => { ftr(page); page = pdfDoc.addPage([595, 842]); hdr(page); y = 795; };
    const nl  = (n = 1) => { y -= LINE * n; };
    const chk = () => { if (y < 70) np(); };
    const sep = () => { chk(); page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); nl(); };
    const text = (str: string, opts: { sz?: number; f?: any; ind?: number; ctr?: boolean } = {}) => {
      const { sz = 10, f = regular, ind = 0, ctr = false } = opts;
      const maxW = W - ind; const words = str.split(' '); let ln = '';
      for (const w of words) {
        const t = ln ? `${ln} ${w}` : w;
        if (f.widthOfTextAtSize(t, sz) > maxW && ln) {
          chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); ln = w;
        } else { ln = t; }
      }
      if (ln) { chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); }
    };
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    hdr(page);

    const cpfFmt  = dados.clienteCpf ? dados.clienteCpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '[CPF]';
    const rg      = dados.clienteRG || '[RG]';
    const rgOrgao = dados.clienteRGOrgao || 'SSP/SC';
    const nac     = dados.clienteNaciona || 'brasileiro(a)';
    const ec      = dados.clienteEstadoCivil || '';
    const prof    = dados.clienteProfissao || '';
    const cidade  = dados.cidade || dados.clienteCidade || 'Balneario Camboriu';
    const endCli  = (() => {
      const rua    = dados.clienteEndereco || '[ENDERECO]';
      const num    = dados.clienteNum    ? `, no ${dados.clienteNum}`           : '';
      const compl  = dados.clienteCompl  ? `, ${dados.clienteCompl}`            : '';
      const bairro = dados.clienteBairro ? `, bairro ${dados.clienteBairro}`    : '';
      const cid    = dados.clienteCidade ? ` na cidade de ${dados.clienteCidade}` : '';
      const uf     = dados.clienteEstado ? ` - ${dados.clienteEstado}`          : '';
      const cep    = dados.clienteCEP    ? `, CEP ${dados.clienteCEP}`          : '';
      return `${rua}${num}${compl}${bairro}${cid}${uf}${cep}`;
    })();

    text('PROCURACAO', { f: bold, sz: 14, ctr: true }); nl(0.5); sep(); nl(0.5);
    text(`OUTORGANTE: ${dados.clienteNome.toUpperCase()}, ${nac}${ec ? ', ' + ec : ''}${prof ? ', ' + prof : ''}, portador(a) do RG no ${rg} ${rgOrgao} e CPF no ${cpfFmt}, residente e domiciliado(a) na ${endCli}.`, { ind: 20 });
    nl();
    text('OUTORGADOS: Dr. JONATHAN FRANK STOBIENIA DOMINGOS, inscrito na OAB/SC sob no 43.348, e Dra. THAMILE ALESSANDRA DOMINGOS, inscrita na OAB/SC no 57.773, com endereco profissional subscrito no rodape.', { ind: 20 });
    nl(); sep();
    text('PODERES:', { f: bold, sz: 11 }); nl(0.3);
    text('Para o foro em geral, conferindo-lhes os mais amplos e ilimitados poderes inclusive os da clausula "ad judicia et extra", bem como os especiais constantes do art. 105, do Codigo de Processo Civil, para, onde com esta se apresentarem, em conjunto ou separadamente, alem de ordem de nomeacao, propor acoes e contesta-las, receber citacoes, notificacoes e intimacoes, apresentar justificacoes, variar de acoes e pedidos, notificar, interpelar, protestar, discordar, transigir e desistir, receber a quantia e dar quitacao, arrematar ou adjudicar em qualquer praca ou leilao, prestar compromissos de inventariante, oferecer as primeiras e ultimas declaracoes, interpor quaisquer recursos, requerer, assinar, praticar, perante qualquer reparticao publica, entidades autarquicas e ou parastatal, Juizo, Instancia ou Tribunal, tudo o que julgar conveniente ou necessario ao bom e fiel desempenho deste mandato, que podera ser substabelecido, no todo ou em parte, a quem melhor lhes convier, com ou sem reserva de poderes.', { ind: 10 });
    nl(0.5);
    if (dados.tipoAcao || dados.area) { text(`Finalidade especifica: ${dados.tipoAcao || dados.area}.`, { ind: 10 }); nl(0.5); }
    text('Os poderes especificos acima outorgados poderao ser substabelecidos.', { ind: 10 });
    nl(); sep();
    text('As partes reconhecem e acordam que o presente documento podera ser assinado eletronicamente por meio de plataforma eletronica Docusign, ZapSign ou pelo sistema de assinatura gov.br, produzindo os mesmos efeitos legais da via assinada fisicamente, nos termos da Lei no 13.874/2019 e do Decreto no 10.278/2020 e acordam ainda em nao contestar a sua validade, conteudo, autenticidade e integridade.', { ind: 10 });
    nl(2);
    text(`${cidade}, ${hoje}.`, { ctr: true }); nl(2);
    page.drawLine({ start: { x: M + W / 4, y }, end: { x: M + (W * 3) / 4, y }, thickness: 0.5, color: rgb(0, 0, 0) }); nl();
    text(dados.clienteNome.toUpperCase(), { ctr: true });
    text(`CPF: ${cpfFmt}`, { ctr: true, sz: 9 });

    ftr(page);
    return Buffer.from(await pdfDoc.save()).toString('base64');
  }

  /** Declaracao de Hipossuficiencia Economica — completa */
  private async gerarDeclaracaoBase64(dados: {
    clienteNome: string; clienteCpf?: string; clienteRG?: string; clienteRGOrgao?: string;
    clienteNaciona?: string; clienteEstadoCivil?: string; clienteProfissao?: string;
    clienteEndereco?: string; clienteNum?: string; clienteCompl?: string;
    clienteBairro?: string; clienteCidade?: string; clienteEstado?: string; clienteCEP?: string;
    cidade?: string;
  }): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const M = 50; const W = 595 - M * 2; const LINE = 14;
    const AZUL = rgb(0.06, 0.18, 0.37); const CINZA = rgb(0.33, 0.33, 0.33);
    let page: any = pdfDoc.addPage([595, 842]); let y = 790;
    const logoPath = path.join(process.cwd(), 'public', 'logo-domingos.png');
    const logoImg  = fs.existsSync(logoPath) ? await pdfDoc.embedPng(fs.readFileSync(logoPath)) : null;
    const hdr = (pg: any) => {
      if (logoImg) {
        const lh = 46; const lw = logoImg.width * (lh / logoImg.height);
        const gap = 14;
        const t1 = 'DOMINGOS'; const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL';
        const tw = Math.max(bold.widthOfTextAtSize(t1, 20), regular.widthOfTextAtSize(t2, 7.5));
        const totalW = lw + gap + tw;
        const startX = M + (W - totalW) / 2;
        pg.drawImage(logoImg, { x: startX, y: 806, width: lw, height: lh });
        const tx = startX + lw + gap;
        pg.drawText(t1, { x: tx, y: 832, font: bold, size: 20, color: rgb(0.23, 0.23, 0.23) });
        pg.drawText(t2, { x: tx, y: 818, font: regular, size: 7.5, color: rgb(0.4, 0.4, 0.4) });
      } else {
        const t1 = 'DOMINGOS'; const t1w = bold.widthOfTextAtSize(t1, 18);
        pg.drawText(t1, { x: M + (W - t1w) / 2, y: 822, font: bold, size: 18, color: rgb(0.27, 0.27, 0.27) });
        const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL'; const t2w = regular.widthOfTextAtSize(t2, 8);
        pg.drawText(t2, { x: M + (W - t2w) / 2, y: 809, font: regular, size: 8, color: rgb(0.45, 0.45, 0.45) });
      }
      pg.drawLine({ start: { x: M, y: 803 }, end: { x: M + W, y: 803 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
    };
    const ftr = (pg: any) => {
      pg.drawLine({ start: { x: M, y: 48 }, end: { x: M + W, y: 48 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      const f1 = 'R. 501, no 145, Sl. 05, centro, Balneario Camboriu'; const f1w = regular.widthOfTextAtSize(f1, 8);
      pg.drawText(f1, { x: M + (W - f1w) / 2, y: 37, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
      const f2 = 'jonathan@domingosadvocacia.com.br     47 -999159178'; const f2w = regular.widthOfTextAtSize(f2, 8);
      pg.drawText(f2, { x: M + (W - f2w) / 2, y: 26, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
    };
    const np  = () => { ftr(page); page = pdfDoc.addPage([595, 842]); hdr(page); y = 795; };
    const nl  = (n = 1) => { y -= LINE * n; };
    const chk = () => { if (y < 70) np(); };
    const sep = () => { chk(); page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); nl(); };
    const text = (str: string, opts: { sz?: number; f?: any; ind?: number; ctr?: boolean } = {}) => {
      const { sz = 10, f = regular, ind = 0, ctr = false } = opts;
      const maxW = W - ind; const words = str.split(' '); let ln = '';
      for (const w of words) {
        const t = ln ? `${ln} ${w}` : w;
        if (f.widthOfTextAtSize(t, sz) > maxW && ln) {
          chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); ln = w;
        } else { ln = t; }
      }
      if (ln) { chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); }
    };
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    hdr(page);

    const cpfFmt  = dados.clienteCpf ? dados.clienteCpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '[CPF]';
    const rg      = dados.clienteRG || '[RG]';
    const rgOrgao = dados.clienteRGOrgao || 'SSP/SC';
    const nac     = dados.clienteNaciona || 'brasileiro(a)';
    const ec      = dados.clienteEstadoCivil || '';
    const prof    = dados.clienteProfissao || '';
    const cidade  = dados.cidade || dados.clienteCidade || 'Balneario Camboriu';
    const endCli  = (() => {
      const rua    = dados.clienteEndereco || '[ENDERECO]';
      const num    = dados.clienteNum    ? `, no ${dados.clienteNum}`           : '';
      const compl  = dados.clienteCompl  ? `, ${dados.clienteCompl}`            : '';
      const bairro = dados.clienteBairro ? `, bairro ${dados.clienteBairro}`    : '';
      const cid    = dados.clienteCidade ? ` na cidade de ${dados.clienteCidade}` : '';
      const uf     = dados.clienteEstado ? ` - ${dados.clienteEstado}`          : '';
      const cep    = dados.clienteCEP    ? `, CEP ${dados.clienteCEP}`          : '';
      return `${rua}${num}${compl}${bairro}${cid}${uf}${cep}`;
    })();

    text('DECLARACAO DE HIPOSSUFICIENCIA ECONOMICA', { f: bold, sz: 13, ctr: true }); nl(0.3);
    text('(Para fins de concessao do beneficio de Assistencia Judiciaria Gratuita - Art. 99, §3o, CPC)', { sz: 9, ctr: true }); nl(0.5);
    sep(); nl(0.5);
    text(`Eu, ${dados.clienteNome.toUpperCase()}, ${nac}${ec ? ', ' + ec : ''}${prof ? ', ' + prof : ''}, portador(a) do RG no ${rg} ${rgOrgao} e inscrito(a) no CPF no ${cpfFmt}, residente e domiciliado(a) na ${endCli}, na qualidade de parte no processo judicial em andamento ou a ser proposto pelo escritorio DOMINGOS ADVOCACIA E ASSESSORIA EMPRESARIAL, DECLARO, sob as penas da lei, o que segue:`, { ind: 20 });
    nl();
    text('1. Que nao possuo condicoes financeiras de arcar com as custas do processo e honorarios advocaticios sem prejuizo do sustento proprio ou de minha familia, razao pela qual requeiro a concessao do beneficio da Assistencia Judiciaria Gratuita, nos termos do art. 98 e seguintes do Codigo de Processo Civil e da Lei no 1.060/50.');
    nl(0.5);
    text('2. Que estou ciente de que a falsidade desta declaracao configura crime de falsidade ideologica (art. 299 do Codigo Penal Brasileiro), sujeitando-me as respectivas penalidades, bem como ao pagamento das custas em dobro (art. 100 do CPC).');
    nl(0.5);
    text('3. Que caso minha situacao financeira se altere de forma significativa, comprometo-me a informar imediatamente ao(a) advogado(a) responsavel, para que seja avaliada a manutencao ou revogacao do beneficio.');
    nl(2);
    text(`${cidade}, ${hoje}.`, { ctr: true }); nl(2);
    page.drawLine({ start: { x: M + W / 4, y }, end: { x: M + (W * 3) / 4, y }, thickness: 0.5, color: rgb(0, 0, 0) }); nl();
    text(dados.clienteNome.toUpperCase(), { ctr: true });
    text(`CPF: ${cpfFmt}`, { ctr: true, sz: 9 });

    ftr(page);
    return Buffer.from(await pdfDoc.save()).toString('base64');
  }

  /** Carta de Renuncia de Mandato — completa */
  private async gerarRenunciaBase64(dados: {
    clienteNome: string; clienteCpf?: string; clienteRG?: string;
    cidade?: string; clienteCidade?: string;
  }): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const M = 50; const W = 595 - M * 2; const LINE = 14;
    const AZUL = rgb(0.06, 0.18, 0.37); const CINZA = rgb(0.33, 0.33, 0.33);
    let page: any = pdfDoc.addPage([595, 842]); let y = 790;
    const logoPath = path.join(process.cwd(), 'public', 'logo-domingos.png');
    const logoImg  = fs.existsSync(logoPath) ? await pdfDoc.embedPng(fs.readFileSync(logoPath)) : null;
    const hdr = (pg: any) => {
      if (logoImg) {
        const lh = 46; const lw = logoImg.width * (lh / logoImg.height);
        const gap = 14;
        const t1 = 'DOMINGOS'; const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL';
        const tw = Math.max(bold.widthOfTextAtSize(t1, 20), regular.widthOfTextAtSize(t2, 7.5));
        const totalW = lw + gap + tw;
        const startX = M + (W - totalW) / 2;
        pg.drawImage(logoImg, { x: startX, y: 806, width: lw, height: lh });
        const tx = startX + lw + gap;
        pg.drawText(t1, { x: tx, y: 832, font: bold, size: 20, color: rgb(0.23, 0.23, 0.23) });
        pg.drawText(t2, { x: tx, y: 818, font: regular, size: 7.5, color: rgb(0.4, 0.4, 0.4) });
      } else {
        const t1 = 'DOMINGOS'; const t1w = bold.widthOfTextAtSize(t1, 18);
        pg.drawText(t1, { x: M + (W - t1w) / 2, y: 822, font: bold, size: 18, color: rgb(0.27, 0.27, 0.27) });
        const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL'; const t2w = regular.widthOfTextAtSize(t2, 8);
        pg.drawText(t2, { x: M + (W - t2w) / 2, y: 809, font: regular, size: 8, color: rgb(0.45, 0.45, 0.45) });
      }
      pg.drawLine({ start: { x: M, y: 803 }, end: { x: M + W, y: 803 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
    };
    const ftr = (pg: any) => {
      pg.drawLine({ start: { x: M, y: 48 }, end: { x: M + W, y: 48 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      const f1 = 'R. 501, no 145, Sl. 05, centro, Balneario Camboriu'; const f1w = regular.widthOfTextAtSize(f1, 8);
      pg.drawText(f1, { x: M + (W - f1w) / 2, y: 37, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
      const f2 = 'jonathan@domingosadvocacia.com.br     47 -999159178'; const f2w = regular.widthOfTextAtSize(f2, 8);
      pg.drawText(f2, { x: M + (W - f2w) / 2, y: 26, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
    };
    const np  = () => { ftr(page); page = pdfDoc.addPage([595, 842]); hdr(page); y = 795; };
    const nl  = (n = 1) => { y -= LINE * n; };
    const chk = () => { if (y < 70) np(); };
    const sep = () => { chk(); page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); nl(); };
    const text = (str: string, opts: { sz?: number; f?: any; ind?: number; ctr?: boolean } = {}) => {
      const { sz = 10, f = regular, ind = 0, ctr = false } = opts;
      const maxW = W - ind; const words = str.split(' '); let ln = '';
      for (const w of words) {
        const t = ln ? `${ln} ${w}` : w;
        if (f.widthOfTextAtSize(t, sz) > maxW && ln) {
          chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); ln = w;
        } else { ln = t; }
      }
      if (ln) { chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); }
    };
    hdr(page);

    const cpfFmt = dados.clienteCpf ? dados.clienteCpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '[CPF]';
    const rg     = dados.clienteRG || '[RG]';

    text('CARTA DE RENUNCIA DE MANDATO', { f: bold, sz: 14, ctr: true }); nl(0.5); sep(); nl();
    text(`Prezado senhor(a) ${dados.clienteNome}, portador(a) do RG no ${rg} e CPF no ${cpfFmt}.`, { ind: 20 });
    nl();
    text('Serve a presente, para notificar de que os subscritores desta RENUNCIAM AO MANDATO QUE LHES FOI OUTORGADO POR PROCURACAO AD JUDICIA OS ADVOGADOS DR. JONATHAN FRANK STOBIENIA DOMINGOS OAB/SC 43.348 E THAMILE ALESSANDRA DOMINGOS OAB/SC 57.773, como ja foi devidamente notificado, ficando o(a) senhor(a) notificado(a) da renuncia acima expressa, sendo certo que, a partir do recebimento desta, tem o prazo legal de 10 (dez) dias, para, nos termos do art. 45 do CPC, constituir novo patrono para o referido processo assinando ao final o canhoto do recebimento.', { ind: 20 });
    nl();
    text('Atenciosamente Jonathan Domingos OAB/SC 43.348.', { ind: 20 });
    nl(2);
    const midX = M + W / 2;
    page.drawLine({ start: { x: M + 20, y }, end: { x: midX - 20, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: midX + 20, y }, end: { x: M + W - 20, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    nl();
    page.drawText('Dr. Jonathan F. S. Domingos', { x: M + 20, y, font: regular, size: 9, color: rgb(0, 0, 0) });
    page.drawText('Thamile Alessandra Domingos', { x: midX + 20, y, font: regular, size: 9, color: rgb(0, 0, 0) });
    nl();
    page.drawText('OAB/SC 43.348', { x: M + 20, y, font: regular, size: 9, color: rgb(0, 0, 0) });
    page.drawText('OAB/SC 57.773', { x: midX + 20, y, font: regular, size: 9, color: rgb(0, 0, 0) });
    nl(3); sep();
    text('ASSINATURA DE RECEBIMENTO', { f: bold, sz: 11 }); nl(2);
    page.drawLine({ start: { x: M + W / 4, y }, end: { x: M + (W * 3) / 4, y }, thickness: 0.5, color: rgb(0, 0, 0) }); nl();
    text(dados.clienteNome.toUpperCase(), { ctr: true });

    ftr(page);
    return Buffer.from(await pdfDoc.save()).toString('base64');
  }

  /** Contrato de Prestacao de Servicos Advocaticios — 19 clausulas completas */
  private async gerarContratoBase64(
    titulo: string,
    dados: {
      clienteNome:         string;
      clienteCpf?:         string;
      clienteRG?:          string;
      clienteRGOrgao?:     string;
      clienteNaciona?:     string;
      clienteEstadoCivil?: string;
      clienteProfissao?:   string;
      clienteTelefone?:    string;
      clienteEmail?:       string;
      clienteEndereco?:    string;
      clienteNum?:         string;
      clienteCompl?:       string;
      clienteBairro?:      string;
      clienteCidade?:      string;
      clienteEstado?:      string;
      clienteCEP?:         string;
      area:                string;
      tipoAcao?:           string;
      valorAcao?:          number;
      tipoHonorario?:      string;
      valorHonorario?:     number;
      percentualExito?: number;
      formaPagamento?:  string;
      numParcelas?:     number;
      vencimento1Parc?: Date | null;
      cidade?:          string;
    },
  ): Promise<string> {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib') as typeof import('pdf-lib');
    const pdfDoc  = await PDFDocument.create();
    const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const M = 50; const W = 595 - M * 2; const LINE = 14;
    const AZUL = rgb(0.06, 0.18, 0.37); const CINZA = rgb(0.33, 0.33, 0.33);
    let page: any = pdfDoc.addPage([595, 842]); let y = 790;
    const logoPath = path.join(process.cwd(), 'public', 'logo-domingos.png');
    const logoImg  = fs.existsSync(logoPath) ? await pdfDoc.embedPng(fs.readFileSync(logoPath)) : null;
    const sigImg   = fs.existsSync(path.join(process.cwd(), 'public', 'assinatura-jonathan.png')) ? await pdfDoc.embedPng(fs.readFileSync(path.join(process.cwd(), 'public', 'assinatura-jonathan.png'))) : null;
    const hdr = (pg: any) => {
      if (logoImg) {
        const lh = 46; const lw = logoImg.width * (lh / logoImg.height);
        const gap = 14;
        const t1 = 'DOMINGOS'; const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL';
        const tw = Math.max(bold.widthOfTextAtSize(t1, 20), regular.widthOfTextAtSize(t2, 7.5));
        const totalW = lw + gap + tw;
        const startX = M + (W - totalW) / 2;
        pg.drawImage(logoImg, { x: startX, y: 806, width: lw, height: lh });
        const tx = startX + lw + gap;
        pg.drawText(t1, { x: tx, y: 832, font: bold, size: 20, color: rgb(0.23, 0.23, 0.23) });
        pg.drawText(t2, { x: tx, y: 818, font: regular, size: 7.5, color: rgb(0.4, 0.4, 0.4) });
      } else {
        const t1 = 'DOMINGOS'; const t1w = bold.widthOfTextAtSize(t1, 18);
        pg.drawText(t1, { x: M + (W - t1w) / 2, y: 822, font: bold, size: 18, color: rgb(0.27, 0.27, 0.27) });
        const t2 = 'ADVOCACIA E ASSESSORIA EMPRESARIAL'; const t2w = regular.widthOfTextAtSize(t2, 8);
        pg.drawText(t2, { x: M + (W - t2w) / 2, y: 809, font: regular, size: 8, color: rgb(0.45, 0.45, 0.45) });
      }
      pg.drawLine({ start: { x: M, y: 803 }, end: { x: M + W, y: 803 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
    };
    const ftr = (pg: any) => {
      pg.drawLine({ start: { x: M, y: 48 }, end: { x: M + W, y: 48 }, thickness: 0.5, color: rgb(0.75, 0.75, 0.75) });
      const f1 = 'R. 501, no 145, Sl. 05, centro, Balneario Camboriu'; const f1w = regular.widthOfTextAtSize(f1, 8);
      pg.drawText(f1, { x: M + (W - f1w) / 2, y: 37, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
      const f2 = 'jonathan@domingosadvocacia.com.br     47 -999159178'; const f2w = regular.widthOfTextAtSize(f2, 8);
      pg.drawText(f2, { x: M + (W - f2w) / 2, y: 26, font: regular, size: 8, color: rgb(0.3, 0.3, 0.3) });
    };
    const np = () => { ftr(page); page = pdfDoc.addPage([595, 842]); hdr(page); y = 795; };
    const nl = (n = 1) => { y -= LINE * n; };
    const chk = () => { if (y < 70) np(); };
    const sep = () => { chk(); page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) }); nl(); };
    const text = (str: string, opts: { sz?: number; f?: any; ind?: number; ctr?: boolean } = {}) => {
      const { sz = 10, f = regular, ind = 0, ctr = false } = opts;
      const maxW = W - ind; const words = str.split(' '); let ln = '';
      for (const w of words) {
        const t = ln ? `${ln} ${w}` : w;
        if (f.widthOfTextAtSize(t, sz) > maxW && ln) {
          chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); ln = w;
        } else { ln = t; }
      }
      if (ln) { chk(); page.drawText(ln, { x: ctr ? M + (W - f.widthOfTextAtSize(ln, sz)) / 2 : M + ind, y, font: f, size: sz, color: rgb(0, 0, 0) }); nl(); }
    };
    const par = (label: string, corpo: string) => { text(`${label} ${corpo}`, { ind: 10 }); nl(0.3); };
    const cl  = (num: string, corpo: string)  => { text(`${num} ${corpo}`, { ind: 10 }); nl(0.3); };
    const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const dataLonga = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const hoje = dataLonga(new Date());
    hdr(page);

    const cpfFmt  = dados.clienteCpf ? dados.clienteCpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '[CPF]';
    const rg      = dados.clienteRG || '[RG]';
    const rgOrgao = dados.clienteRGOrgao || 'SSP/SC';
    const nac     = dados.clienteNaciona || 'brasileiro(a)';
    const ec      = dados.clienteEstadoCivil || '';
    const prof    = dados.clienteProfissao || '';
    const cidade  = dados.cidade || dados.clienteCidade || 'Balneario Camboriu';
    const endCli  = (() => {
      const rua    = dados.clienteEndereco || '[ENDERECO]';
      const num    = dados.clienteNum    ? `, no ${dados.clienteNum}`             : '';
      const compl  = dados.clienteCompl  ? `, ${dados.clienteCompl}`              : '';
      const bairro = dados.clienteBairro ? `, bairro ${dados.clienteBairro}`      : '';
      const cid    = dados.clienteCidade ? ` na cidade de ${dados.clienteCidade}` : '';
      const uf     = dados.clienteEstado ? ` - ${dados.clienteEstado}`            : '';
      const cep    = dados.clienteCEP    ? `, CEP ${dados.clienteCEP}`            : '';
      return `${rua}${num}${compl}${bairro}${cid}${uf}${cep}`;
    })();
    const honTxt  = (() => {
      const tipo    = (dados.tipoHonorario || 'exito').toLowerCase();
      const parcStr = dados.numParcelas && dados.numParcelas > 1 ? `, parcelados em ${dados.numParcelas}x` : '';
      const vencStr = dados.vencimento1Parc ? `, com vencimento da 1a parcela em ${dataLonga(new Date(dados.vencimento1Parc))}` : '';
      const pagFmt  = (dados.formaPagamento || 'PIX').toUpperCase();
      if (tipo === 'fixo' || tipo === 'valor') {
        return `honorarios advocaticios no valor fixo de ${brl(dados.valorHonorario || 0)}${parcStr}${vencStr}, mediante pagamento via ${pagFmt}`;
      } else if (tipo === 'misto') {
        return `honorarios advocaticios no valor de ${brl(dados.valorHonorario || 0)} (honorarios fixos) mais ${dados.percentualExito || 30}% do valor obtido em caso de exito na acao`;
      } else {
        return `honorarios advocaticios em ${dados.percentualExito || 30}% do valor obtido do exito na acao`;
      }
    })();
    const objeto = dados.tipoAcao || dados.area || '[OBJETO DA ACAO]';

    text('CONTRATO DE PRESTACAO DE SERVICOS ADVOCATICIOS', { f: bold, sz: 13, ctr: true }); nl(0.3); sep(); nl(0.5);
    const tel   = dados.clienteTelefone || '';
    const email = dados.clienteEmail    || '';
    const contatoStr = [tel ? `telefone ${tel}` : '', email ? `e-mail ${email}` : ''].filter(Boolean).join(', ');
    text(`Pelo presente instrumento particular, que entre si fazem, de um lado como cliente/contratante e assim doravante indicado, ${dados.clienteNome.toUpperCase()}, ${nac}${ec ? ', ' + ec : ''}${prof ? ', ' + prof : ''}, portador(a) do RG no ${rg} ${rgOrgao}, inscrito(a) no CPF no ${cpfFmt}, com endereco na ${endCli}${contatoStr ? ', ' + contatoStr : ''}.`, { ind: 20 });
    nl(0.5);
    text('CONTRATADA: DOMINGOS ADVOCACIA E ASSESSORIA EMPRESARIAL, composta por Dr. JONATHAN FRANK STOBIENIA DOMINGOS, brasileiro, solteiro, advogado, inscrito na OAB-SC sob no 43.348, CPF no 055.993.629-06, e Dra. THAMILE ALESSANDRA DOMINGOS, brasileira, casada, CPF no 090.222.009-81, inscrita na OAB-SC sob no 57.773, ambos com endereco subscrito no rodape.', { ind: 20 });
    nl(0.5);
    text('Por este instrumento particular, o(a) CONTRATANTE e a CONTRATADA, tem, entre si, justo e contratado, o presente contrato de prestacao de servicos profissionais de advocacia que se regera pelos seguintes termos.', { ind: 20 });
    nl();

    text('DO OBJETO', { f: bold, sz: 11, ctr: true }); nl(0.3); sep();
    cl('CLAUSULA 1a:', `O Contratado compromete-se, em cumprimento ao mandato recebido, a ${objeto}, representando o(a) contratante perante os orgaos competentes.`);
    par('Paragrafo Primeiro:', 'As atividades inclusas na prestacao de servico, objeto deste instrumento, sao todas aquelas inerentes ao exercicio da advocacia, as constantes no Estatuto da Ordem dos Advogados do Brasil, bem como as especificadas no Instrumento Procuratorio.');
    par('Paragrafo Segundo:', 'O Contratante, que reconhece ja haver recebido a orientacao preventiva comportamental e juridica para a consecucao dos servicos, fornecera aos Contratados os documentos e meios necessarios a comprovacao processual do seu pretendido direito.');
    nl(0.5);

    text('DOS HONORARIOS ADVOCATICIOS', { f: bold, sz: 11, ctr: true }); nl(0.3); sep();
    cl('CLAUSULA 2a:', `Fica acordado entre as partes que a CONTRATADA cobrara ${honTxt}.`);
    par('Paragrafo Primeiro:', 'Havendo mora no pagamento dos honorarios aqui contratados, apos o quinto dia de atraso, sera cobrada multa de 2% sobre a prestacao vencida, com acrescimo de juros moratorios de 1% ao mes, alem de correcao monetaria pelo INPC ou qualquer indice oficial.');
    par('Paragrafo Segundo:', 'A CONTRATADA fica autorizada desde ja a fazer a retencao de seus honorarios quando do recebimento de valores diretamente em sua conta bancaria, ou em caso de pagamento de acordo em seu escritorio, bem como os advindos de exito no recebimento do objeto e/ou na demanda, ainda que parcial.');
    par('Paragrafo Terceiro:', 'Em caso de desistencia da acao ou constituicao de outro advogado (com revogacao dos poderes outorgados a CONTRATADA), os honorarios pactuados permaneceram exigiveis na forma ja estipulada, sendo que caso convencionado honorarios a titulo de exito, os honorarios serao calculados pelo valor da causa, ou, caso publicada sentenca ou acordao, pelo valor da condenacao, ou, ainda, acaso liquidado o processo, pelo valor arbitrado em sentenca de liquidacao.');
    par('Paragrafo Quarto:', 'O Contratante nao podera entabular qualquer acordo ou tratativas sem a anuencia ou acompanhamento da CONTRATADA, sob pena de multa contratual no valor correspondente a 20% sobre o valor atribuido a causa, ou da transacao, caso seja na esfera extrajudicial, os quais se tornam imediatamente exigiveis, independente do pagamento dos honorarios advocaticios acordados.');
    par('Paragrafo Quinto:', 'Os honorarios contratuais aqui estipulados nao se confundem com os honorarios de sucumbencia, que pertencem exclusivamente a CONTRATADA, sem prejuizo do pagamento dos honorarios contratuais acima pactuados.');
    par('Paragrafo Sexto:', 'O CONTRATANTE declara ter plena e absoluta ciencia de que o servico prestado pela CONTRATADA e uma obrigacao de meio, nao de resultado, haja vista depender de variaveis que nao sao por esta controladas, nao havendo direito a reparacao de qualquer natureza caso aconteca deslinde diverso do que se deseja.');
    par('Paragrafo Setimo:', 'A CONTRATADA obriga-se a prestar os seus servicos profissionais com todo o zelo e total diligencia na defesa dos direitos e interesses do CONTRATANTE, relativamente ao objeto contratado.');
    par('Paragrafo Oitavo:', 'Os boletos referentes as obrigacoes financeiras do CONTRATANTE perante a CONTRATADA serao emitidos exclusivamente por meio da plataforma bancaria ASAAS e notificados ao CONTRATANTE atraves do e-mail e WhatsApp devidamente cadastrados no escritorio.');
    nl(0.5);

    text('DOS CANAIS OFICIAIS DE ATENDIMENTO E COMUNICACAO', { f: bold, sz: 11, ctr: true }); nl(0.3); sep();
    cl('CLAUSULA 3a:', 'Os canais oficiais de atendimento da CONTRATADA sao exclusivamente: (a) WhatsApp (47) 99915-9178 e (47) 99624-9295; e (b) e-mail com dominio @domingosadvocacia.com.br.');
    par('Paragrafo Unico:', 'O CONTRATANTE declara ter ciencia de que nao deve receber, aceitar ou corresponder a qualquer contato que se apresente em nome da CONTRATADA por canais ou numeros distintos dos indicados nesta clausula. Caso o CONTRATANTE venha a interagir, fornecer documentos, realizar pagamentos ou tomar decisoes com base em contatos feitos por canais nao oficiais, assumira exclusivamente todos os onus, perdas e danos decorrentes de tal conduta, isentando integralmente a CONTRATADA de qualquer responsabilidade.');
    nl(0.5);

    text('DAS DESPESAS E DO FORNECIMENTO DE DOCUMENTOS', { f: bold, sz: 11, ctr: true }); nl(0.3); sep();
    cl('CLAUSULA 4a:', 'Ao CONTRATANTE cabera o pagamento das custas processuais, despesas judiciais e extrajudiciais, emolumentos, tributos e demais despesas que forem necessarias ao bom andamento de processos, bem como ao pagamento/ressarcimento de despesas de viagens e deslocamentos interurbanos, e ainda, ao fornecimento de documentos e informacoes que a CONTRATADA solicitar, nao sendo esta responsabilizada em caso do nao cumprimento parcial ou integral desta clausula.');
    par('Paragrafo unico:', 'O CONTRATANTE devera reembolsar todas as despesas apresentadas pela CONTRATADA que sejam relacionadas a seus processos ou procedimentos, como por exemplo: deslocamento, alimentacao, copias, guias judiciais, consulta CPF, emissao de declaracoes ou certidoes, diligencias de advogados correspondentes etc., sendo que a falta do pagamento importara na rescisao do presente contrato.');
    nl(0.5);

    text('DA RESCISAO DO CONTRATO', { f: bold, sz: 11, ctr: true }); nl(0.3); sep();
    cl('Clausula 5a.', 'Em caso de rescisao do presente contrato por interesse do CONTRATANTE, este ficara obrigado pelo pagamento dos honorarios advocaticios descritos neste contrato, ocasiao em que devera constituir novo procurador afim de salvaguardar seus direitos, isentando a CONTRATADA de toda e qualquer responsabilidade, que fica desobrigada de patrocinar a(s) demanda(s) do CONTRATANTE, ainda que os honorarios pactuados estejam pagos.');
    cl('Clausula 6a.', 'Em caso de inadimplemento pelo(a) CONTRATANTE, por prazo superior a 30 (trinta) dias, em qualquer pagamento, ficara a CONTRATADA isenta de qualquer obrigacao, podendo rescindir o contrato e cessar a prestacao de servicos, assumindo o CONTRATANTE o onus desta conduta, para todos os efeitos legais.');
    cl('Clausula 7a.', 'O presente contrato podera ser revogado, mediante comunicacao escrita por qualquer das partes com antecedencia minima de 15 (quinze) dias, mantendo-se devidos honorarios ate o termo da notificacao, bem como multa de 20% sobre o valor total das parcelas restantes.');
    cl('Clausula 8a.', 'Agindo o CONTRATANTE prejudicialmente, de forma dolosa ou culposa, em face da CONTRATADA, ou, ainda, na hipotese de pratica de qualquer ato que gere desequilibrio ou quebra de confianca na relacao advogado-cliente, restara facultado a este rescindir o contrato, se exonerando de todas as obrigacoes, com reserva de honorarios previstos na forma do presente instrumento.');
    cl('Clausula 9a.', 'Caso o CONTRATANTE falte com o pagamento de honorarios, taxas ou despesas pactuadas neste contrato, estara sujeito a emissao de boleto e protesto em cartorio, e consequente inscricao nos orgaos de protecao ao credito SPC e SERASA e demais sancoes cabiveis, nos termos da lei.');
    nl(0.5);

    text('DAS DISPOSICOES GERAIS', { f: bold, sz: 11, ctr: true }); nl(0.3); sep();
    cl('Clausula 10a.', 'E obrigacao do(a) CONTRATANTE informar imediatamente qualquer mudanca de endereco, numero de telefone, e-mail ou demais dados cadastrais, nao podendo alegar qualquer responsabilidade da CONTRATADA em eventual falta de sua intimacao, notificacao de cobranca ou a sua nao localizacao.');
    cl('Clausula 11a.', 'O CONTRATANTE fica ciente de que acaso falte com a verdade ou omita qualquer documento ou informacao, visando obter indevidamente o beneficio da justica gratuita, podera vir a ser condenado ao pagamento de multa por litigancia de ma-fe, alem das sancoes civis e criminais. Fica o CONTRATANTE ciente, ainda, de que o beneficio da justica gratuita depende unica e exclusivamente do livre convencimento do juiz/tribunal, concordando que em nenhuma hipotese sera o advogado responsabilizado pelo onus de decisao desfavoravel.');
    cl('Clausula 12a.', 'O CONTRATANTE fica expressamente ciente de que o sucesso da acao depende diretamente da producao probatoria e que este encargo e integralmente e intransferivelmente seu. A CONTRATADA se compromete a requisitar as provas, documentos e/ou testemunhas que se facam necessarios ao sucesso da acao, restringindo-se sua atuacao a orientacao do(a) CONTRATANTE sobre a forma de obtencao das mesmas.');
    cl('Clausula 13a.', 'A CONTRATADA nao se compromete a diligenciar na busca de provas, documentos e/ou testemunhas, estando a parte CONTRATANTE ciente de que devera empenhar os maximos esforcos na busca dos elementos que amparem o seu pretenso direito, de modo que o atraso injustificado no fornecimento de tais informacoes/documentos isentara a CONTRATADA de toda e qualquer obrigacao.');
    cl('Clausula 14a.', 'O CONTRATANTE fica ciente de que o seu nao comparecimento aos atos do processo em que seja indispensavel sua presenca, tais como audiencias, pericias, inspecoes e outros, podera acarretar no arquivamento, extincao do processo ou na improcedencia da acao. Nos casos de arquivamento, extincao ou improcedencia em que o(a) CONTRATANTE tenha dado causa por nao comparecimento sem motivo justificado, serao cobrados honorarios integrais pela tabela da OAB/SC, ficando a CONTRATADA desobrigada de quaisquer deveres e obrigacoes.');
    cl('Clausula 15a.', 'Se porventura a CONTRATADA depender do CONTRATANTE para promover algum ato extrajudicial ou judicial, e este nao o corresponder tempestivamente, a responsabilidade recaira exclusivamente sobre o CONTRATANTE, nao podendo argui-la em seu favor posteriormente, restando, da mesma forma, isenta a CONTRATADA de qualquer responsabilidade.');
    cl('Clausula 16a.', 'Este contrato enquadra-se no rol dos titulos executivos extrajudiciais, nos termos do artigo 784, Inciso XII, do Codigo de Processo Civil, combinado com o artigo 24 da Lei 8.906/94 (EOAB).');
    cl('Clausula 17a.', 'O CONTRATANTE autoriza o tratamento e armazenamento de seus dados digitais pela CONTRATADA, tais como documentos, midias e informacoes privadas, para o exercicio regular de seus direitos no processo judicial ou administrativo, objetos do presente contrato, ficando vedado para qualquer outro fim. Conforme Lei 13.709 de 2018 (LGPD).');
    cl('Clausula 18a.', 'Caso a parte CONTRATANTE compartilhe dados pessoais e processuais sensiveis para terceiros, sem o consentimento do titular dos dados ou da CONTRATADA de forma expressa, assumira todos os onus decorrentes do referido compartilhamento, conforme hipoteses previstas na LGPD.');
    cl('Clausula 19a.', 'As partes reconhecem e acordam que o presente contrato podera ser assinado eletronicamente por meio de plataforma eletronica Docusign, ZapSign ou pelo sistema de assinatura gov.br, produzindo os mesmos efeitos legais da via assinada fisicamente, nos termos da Lei no 13.874/2019 e do Decreto no 10.278/2020 e acordam ainda em nao contestar a sua validade, conteudo, autenticidade e integridade.');
    nl(0.5);

    text('DA ELEICAO DO FORO', { f: bold, sz: 11, ctr: true }); nl(0.3); sep();
    text(`As partes acima identificadas elegem o Foro de ${cidade} para dirimir quaisquer divergencias originarias deste contrato, e firmam-no em 02 (duas) vias iguais.`, { ind: 20 });
    nl(2);
    text(`${cidade}, ${hoje}.`, { ctr: true }); nl(2);

    const midX = M + W / 2;
    chk();
    if (sigImg) { const sh = 38; const sw = sigImg.width * (sh / sigImg.height); page.drawImage(sigImg, { x: midX + 22, y: y + 4, width: sw, height: sh }); }
    page.drawLine({ start: { x: M + 10, y }, end: { x: midX - 20, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: midX + 20, y }, end: { x: M + W - 10, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    nl();
    page.drawText('CONTRATANTE', { x: M + 10, y, font: bold, size: 9, color: rgb(0, 0, 0) });
    page.drawText('CONTRATADA', { x: midX + 20, y, font: bold, size: 9, color: rgb(0, 0, 0) });
    nl();
    page.drawText(dados.clienteNome.toUpperCase(), { x: M + 10, y, font: regular, size: 9, color: rgb(0, 0, 0) });
    page.drawText('DOMINGOS ADVOCACIA E ASSESSORIA EMPRESARIAL', { x: midX + 20, y, font: regular, size: 8, color: rgb(0, 0, 0) });
    nl(3);
    text('TESTEMUNHAS:', { f: bold }); nl(2);
    page.drawLine({ start: { x: M, y }, end: { x: midX - 20, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: midX + 20, y }, end: { x: M + W, y }, thickness: 0.5, color: rgb(0, 0, 0) });
    nl(); nl(0.3);
    page.drawText('Nome:', { x: M, y, font: bold, size: 9, color: rgb(0, 0, 0) });
    page.drawText('Nome:', { x: midX + 20, y, font: bold, size: 9, color: rgb(0, 0, 0) });
    nl(); nl(0.3);
    page.drawText('CPF:', { x: M, y, font: bold, size: 9, color: rgb(0, 0, 0) });
    page.drawText('CPF:', { x: midX + 20, y, font: bold, size: 9, color: rgb(0, 0, 0) });

    ftr(page);
    return Buffer.from(await pdfDoc.save()).toString('base64');
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
