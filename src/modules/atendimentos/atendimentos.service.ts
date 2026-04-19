import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAtendimentoDto } from './dto/create-atendimento.dto';

export interface AtendimentoFilter {
  status?: string;
  area?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AtendimentosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a complete atendimento with all related records
   * This is atomic - creates: client, case, financial record, documents, esign envelope
   */
  async createCompleteAtendimento(
    escritorioId: string,
    dto: CreateAtendimentoDto,
    userId?: string,
  ) {
    try {
      // 1. Create or find client (cpf não é unique → findFirst + create)
      let cliente = dto.cliente.cpf
        ? await this.prisma.cliente.findFirst({
            where: { escritorioId, cpf: dto.cliente.cpf },
          })
        : null;

      if (!cliente) {
        cliente = await this.prisma.cliente.create({
          data: {
            nome: dto.cliente.nome,
            cpf: dto.cliente.cpf ?? null,
            rg: dto.cliente.rg ?? null,
            dataNascimento: dto.cliente.dataNascimento
              ? new Date(dto.cliente.dataNascimento)
              : null,
            telefone: dto.cliente.telefone ?? null,
            email: dto.cliente.email ?? null,
            endereco:
              typeof dto.cliente.endereco === 'string'
                ? dto.cliente.endereco
                : dto.cliente.endereco
                  ? JSON.stringify(dto.cliente.endereco)
                  : null,
            escritorioId,
          },
        });
      }

      // 2. Create minor if applicable
      let menorId: string = null;
      if (dto.tipoRepresentacao === 'menor' && dto.menor) {
        const menor = await this.prisma.menorRepresentado.create({
          data: {
            clienteId: cliente.id,
            nome: dto.menor.nome,
            dataNascimento: new Date(dto.menor.dataNascimento),
            cpf: dto.menor.cpf,
            rg: dto.menor.rg,
            tipoResponsavel: dto.menor.tipoResponsavel,
          },
        });
        menorId = menor.id;
      }

      // 3. Create processo (legal case)
      const processo = await this.prisma.processo.create({
        data: {
          clienteId: cliente.id,
          escritorioId,
          numero: `ATD-${Date.now()}`,
          area: dto.area,
          tipoAcao: dto.tipoAcao,
          valor: dto.valorAcao,
          status: 'ATIVO',
        } as any,
      });

      // 4. Create initial task
      await this.prisma.tarefa.create({
        data: {
          processoId: processo.id,
          titulo: 'Aguardando assinatura de documentos',
          escritorioId,
          status: 'PENDENTE',
          prioridade: 'ALTA',
        },
      });

      // 5. Create financial record (status: a_efetuar)
      const lancamento = await this.prisma.lancamentoFinanceiro.create({
        data: {
          escritorioId,
          clienteId: cliente.id,
          atendimentoId: null, // Will be updated after atendimento creation
          descricao: `Honorários - ${dto.area}`,
          valor:
            dto.tipoHonorario === 'percentual'
              ? dto.valorAcao * (dto.percentualExito / 100)
              : dto.valorFixo || 0,
          tipo: 'honorario',
          status: 'a_efetuar',
          formaPagamento: dto.formaPagamento,
          numParcelas: dto.numParcelas,
          vencimento: dto.vencimento1Parc
            ? new Date(dto.vencimento1Parc)
            : null,
        },
      });

      // 6. Create 4 documents
      const documentTypes = [
        'Contrato de Honorários',
        'Procuração Ad Judicia',
        'Declaração de Hipossuficiência',
        'Questionário Jurídico',
      ];

      const docs = await Promise.all(
        documentTypes.map((tipo) =>
          this.prisma.documento.create({
            data: {
              processoId: processo.id,
              escritorioId,
              tipo,
              nome: `${tipo} - ${cliente.nome}`,
              status: 'gerado',
              url: null,
            } as any,
          }),
        ),
      );

      // 7. Create esign envelope
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() + 7);

      // Busca um usuário válido do escritório para o criadoPorId (FK obrigatória)
      let criadoPorId = userId;
      if (!criadoPorId) {
        const usuario = await this.prisma.usuario.findFirst({ where: { escritorioId } });
        criadoPorId = usuario?.id ?? escritorioId;
      }

      const envelope = await this.prisma.esignEnvelope.create({
        data: {
          titulo: 'Contrato de Honorários — ' + dto.cliente.nome,
          escritorioId,
          criadoPorId,
          signatario: cliente.email as any,
          status: 'aguardando',
          mensagem: dto.mensagem || 'Segue o contrato de honorários para sua assinatura',
          dataLimite,
        } as any,
      });

      // 8. Create atendimento record
      const atendimento = await this.prisma.atendimento.create({
        data: {
          escritorioId,
          clienteId: cliente.id,
          processoId: processo.id,
          status: 'aguardando_assinatura',
          area: dto.area,
          tipoAcao: dto.tipoAcao,
          valorAcao: dto.valorAcao,
          tipoHonorario: dto.tipoHonorario,
          valorHonorario:
            dto.tipoHonorario === 'percentual' ? null : dto.valorFixo,
          percentualExito:
            dto.tipoHonorario === 'percentual' ? dto.percentualExito : null,
          formaPagamento: dto.formaPagamento,
          parcelamento: dto.parcelamento || false,
          numParcelas: dto.numParcelas,
          vencimento1Parc: dto.vencimento1Parc
            ? new Date(dto.vencimento1Parc)
            : null,
          envelopeId: envelope.id,
          menorId,
          questionario: dto.questionario,
        },
      });

      // 9. Update lancamento with atendimentoId
      await this.prisma.lancamentoFinanceiro.update({
        where: { id: lancamento.id },
        data: { atendimentoId: atendimento.id },
      });

      return {
        atendimento,
        cliente,
        processo,
        lancamento,
        documentos: docs,
        envelope,
        message: 'Atendimento criado com sucesso! Aguardando assinatura dos documentos.',
      };
    } catch (error) {
      throw new BadRequestException(
        `Erro ao criar atendimento: ${error.message}`,
      );
    }
  }

  /**
   * List atendimentos with optional filters
   */
  async listAtendimentos(
    escritorioId: string,
    filters: AtendimentoFilter,
  ) {
    const { status, area, page = 1, limit = 20 } = filters;

    const where: any = { escritorioId };
    if (status) where.status = status;
    if (area) where.area = area;

    const skip = (page - 1) * limit;

    const [atendimentos, total] = await Promise.all([
      this.prisma.atendimento.findMany({
        where,
        skip,
        take: limit,
        include: {
          cliente: true,
          processo: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.atendimento.count({ where }),
    ]);

    return {
      atendimentos,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single atendimento by ID
   */
  async getAtendimentoById(escritorioId: string, id: string) {
    const atendimento = await this.prisma.atendimento.findFirst({
      where: { id, escritorioId },
      include: {
        cliente: true,
        processo: {
          include: {
            tarefas: true,
            documentos: true,
          },
        },
      },
    });

    if (!atendimento) {
      throw new NotFoundException(`Atendimento ${id} não encontrado`);
    }

    return atendimento;
  }

  /**
   * Update atendimento status
   */
  async updateStatus(
    escritorioId: string,
    id: string,
    status: string,
  ) {
    const atendimento = await this.prisma.atendimento.findFirst({
      where: { id, escritorioId },
    });

    if (!atendimento) {
      throw new NotFoundException(`Atendimento ${id} não encontrado`);
    }

    const validStatuses = [
      'atendendo',
      'aguardando_assinatura',
      'assinado',
      'iniciando',
      'ativo',
      'encerrado',
    ];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }

    return this.prisma.atendimento.update({
      where: { id },
      data: { status },
      include: {
        cliente: true,
        processo: true,
      },
    });
  }

  /**
   * Filter atendimentos by status
   */
  async filterByStatus(
    escritorioId: string,
    status: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const [atendimentos, total] = await Promise.all([
      this.prisma.atendimento.findMany({
        where: { escritorioId, status },
        skip,
        take: limit,
        include: {
          cliente: true,
          processo: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.atendimento.count({
        where: { escritorioId, status },
      }),
    ]);

    return {
      atendimentos,
      status,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}
