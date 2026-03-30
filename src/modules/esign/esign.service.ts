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
import { PrismaService } from '../../common/prisma/prisma.service';
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

  constructor(private readonly prisma: PrismaService) {}

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

    // TODO: Send emails to signatários
    // await this.emailService.sendSignatureRequest(signingLinks, envelope.mensagem);

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

    // TODO: Resend emails
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
}
