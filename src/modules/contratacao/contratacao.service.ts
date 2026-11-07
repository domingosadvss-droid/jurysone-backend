/**
 * JURYSONE — Pacote de contratação
 *
 * Fluxo (decidido em 07/11/2026):
 *   1. O advogado gera o pacote: contrato de honorários, procuração, termo de entrevista
 *      e, quando houver, declaração de hipossuficiência. Os PDFs vão para a pasta
 *      "01 Contratação" do processo como RASCUNHO.
 *   2. O advogado revisa e manda para assinatura (o link volta para envio pelo WhatsApp).
 *   3. Quando o cliente assina, o webhook guarda os PDFs assinados na mesma pasta e marca
 *      sozinho os itens da etapa "Contratação" da linha de produção.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { ChavesService } from '../chaves/chaves.service';
import { EsignService } from '../esign/esign.service';
import { ArquivosService } from '../arquivos/arquivos.service';
import { AssinaturaSimulada, AssinaturaZapSign, ProvedorAssinatura, simuladoPermitido } from './provedores-assinatura';
import { gerarTermoEntrevista } from './termo-entrevista';

export const TIPOS_DOCUMENTO = ['contrato', 'procuracao', 'termo_entrevista', 'hipossuficiencia'] as const;
type TipoDoc = (typeof TIPOS_DOCUMENTO)[number];

const ROTULO: Record<TipoDoc, string> = {
  contrato: 'Contrato de honorários',
  procuracao: 'Procuração',
  termo_entrevista: 'Termo de entrevista',
  hipossuficiencia: 'Declaração de hipossuficiência',
};

/** Procuração e hipossuficiência vão aos autos: preferir certificado digital quando o cliente tiver */
const ASSINATURA: Record<TipoDoc, string> = {
  contrato: 'ELETRONICA',
  termo_entrevista: 'ELETRONICA',
  procuracao: 'CERTIFICADO_PREFERENCIAL',
  hipossuficiencia: 'CERTIFICADO_PREFERENCIAL',
};

/** Palavras que identificam o item do checklist da etapa de contratação */
const CHAVE_CHECKLIST: Record<TipoDoc, string> = {
  contrato: 'contrato de honorarios',
  procuracao: 'procuracao',
  termo_entrevista: 'termo de entrevista',
  hipossuficiencia: 'hipossuficiencia',
};

const norm = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

@Injectable()
export class ContratacaoService {
  private readonly logger = new Logger(ContratacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chaves: ChavesService,
    private readonly esign: EsignService,
    private readonly arquivos: ArquivosService,
  ) {}

  // ── Provedor ──

  async provedorDo(escritorioId: string, nome?: string): Promise<ProvedorAssinatura> {
    const preferido = (nome ?? process.env.ASSINATURA_PROVEDOR ?? '').toUpperCase();
    if (preferido === 'SIMULADO') {
      if (!simuladoPermitido()) throw new BadRequestException('Assinatura simulada não é permitida em produção.');
      return new AssinaturaSimulada();
    }
    const token = await this.chaves.getChave(escritorioId, 'zapsign');
    if (token) return new AssinaturaZapSign(token);
    if (simuladoPermitido() && preferido !== 'ZAPSIGN') return new AssinaturaSimulada();
    throw new BadRequestException('Configure a plataforma de assinatura (token da ZapSign) antes de enviar documentos.');
  }

  // ── Gerar pacote ──

  async gerarPacote(escritorioId: string, processoId: string, dto: any, user: any) {
    const processo = await this.prisma.processo.findFirst({
      where: { id: processoId, escritorioId, deletedAt: null },
      include: { cliente: true, escritorio: { select: { nome: true } } },
    });
    if (!processo) throw new NotFoundException('Processo não encontrado');

    // Atendimento do próprio processo; se não houver, o mais recente do cliente
    const atendimento =
      (await this.prisma.atendimento.findFirst({ where: { escritorioId, processoId }, orderBy: { createdAt: 'desc' } })) ??
      (await this.prisma.atendimento.findFirst({ where: { escritorioId, clienteId: processo.clienteId }, orderBy: { createdAt: 'desc' } }));

    const area = String(processo.area ?? atendimento?.area ?? '').toUpperCase();
    let tipos: TipoDoc[] = Array.isArray(dto?.documentos) && dto.documentos.length
      ? dto.documentos.map((t: string) => String(t).toLowerCase())
      : ['contrato', 'procuracao', 'termo_entrevista', ...(area.includes('TRABALHISTA') || dto?.incluirHipossuficiencia ? ['hipossuficiencia' as TipoDoc] : [])];
    tipos = [...new Set(tipos)];
    const invalidos = tipos.filter((t) => !TIPOS_DOCUMENTO.includes(t));
    if (invalidos.length) throw new BadRequestException(`Documentos inválidos: ${invalidos.join(', ')}. Use: ${TIPOS_DOCUMENTO.join(', ')}`);

    const c = processo.cliente;
    if (!c.cpfCnpj && !c.cpf) throw new BadRequestException('Complete o CPF/CNPJ do cliente antes de gerar os documentos.');

    // Contrato, procuração e hipossuficiência: geradores já existentes do escritório
    const precisaJuridicos = tipos.some((t) => t !== 'termo_entrevista');
    const juridicos = precisaJuridicos
      ? await this.esign.gerarTodosDocumentosPdf({
          clienteNome: c.nome,
          clienteCpf: c.cpf ?? c.cpfCnpj ?? undefined,
          clienteRG: c.rg ?? undefined,
          clienteEmail: c.email ?? undefined,
          clienteTelefone: c.telefone ?? undefined,
          clienteEndereco: c.endereco ?? undefined,
          clienteCidade: c.cidade ?? undefined,
          clienteEstado: c.estado ?? undefined,
          clienteCEP: c.cep ?? undefined,
          area: area || 'GERAL',
          tipoAcao: processo.tipoAcao ?? processo.titulo ?? undefined,
          valorAcao: processo.valor ? Number(processo.valor) : undefined,
          tipoHonorario: atendimento?.tipoHonorario ?? undefined,
          valorHonorario: atendimento?.valorHonorario ? Number(atendimento.valorHonorario) : undefined,
          percentualExito: atendimento?.percentualExito ? Number(atendimento.percentualExito) : undefined,
          formaPagamento: atendimento?.formaPagamento ?? undefined,
          numParcelas: atendimento?.numParcelas ?? undefined,
          vencimento1Parc: atendimento?.vencimento1Parc ?? null,
        })
      : [];
    const indice: Record<string, number> = { contrato: 0, procuracao: 1, hipossuficiencia: 2 };

    const documentos: any[] = [];
    for (const tipo of tipos) {
      const pdf = tipo === 'termo_entrevista'
        ? await gerarTermoEntrevista({
            escritorioNome: processo.escritorio.nome,
            clienteNome: c.nome,
            clienteDocumento: c.cpfCnpj ?? c.cpf,
            area: area || null,
            processoTitulo: processo.titulo,
            questionario: dto?.questionario ?? atendimento?.questionario,
          })
        : Buffer.from(juridicos[indice[tipo]].base64, 'base64');
      const doc = await this.arquivos.salvarNoProcesso(escritorioId, processoId, {
        nome: `RASCUNHO - ${ROTULO[tipo]} - ${c.nome}.pdf`,
        mimeType: 'application/pdf', conteudo: pdf, categoria: 'CONTRATACAO', origem: 'GERADO',
        enviadoPorId: user.id, tipo,
      });
      documentos.push({ tipo, nome: ROTULO[tipo], documentoId: doc.id, assinatura: ASSINATURA[tipo], assinadoDocumentoId: null });
    }

    const etapa = await this.etapaDeContratacao(escritorioId, processoId);
    return this.prisma.pacoteAssinatura.create({
      data: {
        escritorioId, processoId, etapaId: etapa?.id ?? null,
        provedor: (await this.provedorDo(escritorioId, dto?.provedor)).nome,
        status: 'RASCUNHO', documentos, criadoPorId: user.id,
      },
    });
  }

  /** Etapa ativa/pendente da linha do processo que tem itens de contratação no checklist */
  private async etapaDeContratacao(escritorioId: string, processoId: string) {
    const etapas = await this.prisma.etapaLinha.findMany({
      where: { escritorioId, linha: { processoId, status: 'ATIVA' }, status: { in: ['EM_ANDAMENTO', 'PENDENTE'] } },
      orderBy: { ordem: 'asc' },
    });
    return etapas.find((e) => ((e.checklist as any[]) ?? []).some((i) => norm(i.texto).includes('procuracao'))) ?? null;
  }

  // ── Enviar para assinatura ──

  async enviar(escritorioId: string, pacoteId: string, dto: any) {
    const pacote = await this.prisma.pacoteAssinatura.findFirst({ where: { id: pacoteId, escritorioId } });
    if (!pacote) throw new NotFoundException('Pacote não encontrado');
    if (pacote.status !== 'RASCUNHO') throw new BadRequestException('Só pacotes em rascunho podem ser enviados.');
    const processo = await this.prisma.processo.findUnique({ where: { id: pacote.processoId }, include: { cliente: true } });
    const cli = processo!.cliente;
    const signatario = {
      nome: dto?.nome ?? cli.nome,
      email: dto?.email ?? cli.email,
      telefone: dto?.telefone ?? cli.telefone,
    };
    if (!signatario.email && !signatario.telefone) {
      throw new BadRequestException('O cliente precisa de e-mail ou telefone para receber o link de assinatura.');
    }

    const docs = await this.carregarOriginais(escritorioId, pacote.documentos as any[]);
    const prov = await this.provedorDo(escritorioId, pacote.provedor);
    const envelope = await prov.criarEnvelope(`Contratação - ${cli.nome}`, docs, [signatario], pacote.id);

    return this.prisma.pacoteAssinatura.update({
      where: { id: pacote.id },
      data: {
        status: 'ENVIADO', externoId: envelope.externoId, enviadoEm: new Date(),
        signatarios: envelope.signatarios as any, linkAssinatura: envelope.signatarios[0]?.url ?? null,
      },
    });
  }

  private async carregarOriginais(escritorioId: string, documentos: any[]) {
    const saida = [];
    for (const d of documentos) {
      saida.push({ nome: d.nome, pdf: await this.arquivos.conteudoInterno(escritorioId, d.documentoId) });
    }
    return saida;
  }

  // ── Webhook ──

  async processarWebhook(provedorNome: string, corpo: any, tokenRecebido?: string) {
    const nome = String(provedorNome ?? '').toUpperCase();
    if (nome === 'SIMULADO') {
      if (!simuladoPermitido()) throw new ForbiddenException('Webhook simulado desativado em produção.');
    } else if (nome === 'ZAPSIGN') {
      const esperado = process.env.ZAPSIGN_WEBHOOK_TOKEN ?? '';
      const ok = !!esperado && !!tokenRecebido && esperado.length === tokenRecebido.length &&
        timingSafeEqual(Buffer.from(esperado), Buffer.from(tokenRecebido));
      if (!ok) throw new ForbiddenException('Token do webhook inválido.');
    } else {
      throw new BadRequestException('Provedor desconhecido.');
    }

    const prov = nome === 'SIMULADO' ? new AssinaturaSimulada() : null;
    const evento = (prov ?? new AssinaturaZapSign('webhook')).interpretarWebhook(corpo);
    if (!evento) return { ignorado: true };

    const pacote = await this.prisma.pacoteAssinatura.findFirst({ where: { externoId: evento.externoId, provedor: nome } });
    if (!pacote) return { ignorado: true, motivo: 'pacote não encontrado' };
    if (pacote.status === 'ASSINADO') return { jaProcessado: true };

    if (evento.evento === 'RECUSADO') {
      await this.prisma.pacoteAssinatura.update({ where: { id: pacote.id }, data: { status: 'RECUSADO' } });
      await this.notificarResponsavel(pacote, 'Cliente recusou a assinatura', 'O cliente recusou os documentos de contratação.');
      return { status: 'RECUSADO' };
    }
    if (evento.evento !== 'ASSINADO') return { ignorado: true };

    const provedor = await this.provedorDo(pacote.escritorioId, nome);
    const documentos = pacote.documentos as any[];
    const originais = await this.carregarOriginais(pacote.escritorioId, documentos);
    const assinados = await provedor.obterAssinados(evento.externoId, originais);
    const processo = await this.prisma.processo.findUnique({ where: { id: pacote.processoId }, include: { cliente: { select: { nome: true } } } });

    for (let i = 0; i < documentos.length; i++) {
      const salvo = await this.arquivos.salvarNoProcesso(pacote.escritorioId, pacote.processoId, {
        nome: `ASSINADO - ${documentos[i].nome} - ${processo?.cliente?.nome ?? ''}.pdf`,
        mimeType: 'application/pdf', conteudo: assinados[i].pdf, categoria: 'CONTRATACAO', origem: 'ASSINADO',
        tipo: documentos[i].tipo,
      });
      documentos[i].assinadoDocumentoId = salvo.id;
    }
    await this.prisma.pacoteAssinatura.update({
      where: { id: pacote.id }, data: { status: 'ASSINADO', assinadoEm: new Date(), documentos },
    });
    const marcados = await this.marcarChecklist(pacote.escritorioId, pacote.processoId, pacote.etapaId, documentos);
    await this.notificarResponsavel(pacote, 'Documentos assinados', `O cliente assinou ${documentos.length} documento(s) de contratação.`);
    return { status: 'ASSINADO', itensMarcados: marcados };
  }

  private async marcarChecklist(escritorioId: string, processoId: string, etapaId: string | null, documentos: any[]) {
    const etapa = etapaId
      ? await this.prisma.etapaLinha.findFirst({ where: { id: etapaId, escritorioId } })
      : await this.etapaDeContratacao(escritorioId, processoId);
    if (!etapa || ['CONCLUIDA', 'PULADA'].includes(etapa.status)) return 0;
    let marcados = 0;
    const agora = new Date().toISOString();
    const lista = ((etapa.checklist as any[]) ?? []).map((item) => {
      const doc = documentos.find((d) => norm(item.texto).includes(CHAVE_CHECKLIST[d.tipo as TipoDoc]));
      if (doc && !item.feito) {
        marcados++;
        return { ...item, feito: true, feitoEm: agora, feitoPorId: null, documentoId: doc.assinadoDocumentoId };
      }
      return item;
    });
    await this.prisma.etapaLinha.update({ where: { id: etapa.id }, data: { checklist: lista as any } });
    return marcados;
  }

  private async notificarResponsavel(pacote: any, titulo: string, mensagem: string) {
    const destino = pacote.criadoPorId;
    if (!destino) return;
    try {
      await this.prisma.notificacao.create({
        data: {
          escritorioId: pacote.escritorioId, usuarioId: destino, tipo: 'assinatura', titulo, mensagem,
          dados: { pacoteId: pacote.id, processoId: pacote.processoId } as any, link: `/processos/${pacote.processoId}`,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Falha ao notificar pacote ${pacote.id}: ${e?.message}`);
    }
  }

  // ── Consultas ──

  listar(escritorioId: string, processoId: string) {
    return this.prisma.pacoteAssinatura.findMany({ where: { escritorioId, processoId }, orderBy: { createdAt: 'desc' } });
  }

  async cancelar(escritorioId: string, pacoteId: string) {
    const p = await this.prisma.pacoteAssinatura.findFirst({ where: { id: pacoteId, escritorioId } });
    if (!p) throw new NotFoundException('Pacote não encontrado');
    if (!['RASCUNHO', 'ENVIADO'].includes(p.status)) throw new BadRequestException('Este pacote não pode mais ser cancelado.');
    return this.prisma.pacoteAssinatura.update({ where: { id: pacoteId }, data: { status: 'CANCELADO' } });
  }
}
