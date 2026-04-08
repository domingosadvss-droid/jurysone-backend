import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../database/prisma.service';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface FindAllFilters {
  escritorioId: string;
  processoId?: string;
  tipo?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}

export interface UploadDocumentoResult {
  caminho: string;
  url: string;        // URL pública (se bucket público) ou assinada (1h)
  tamanho: number;
  mimeType: string;
}

// Buckets disponíveis no Supabase Storage
export type StorageBucket =
  | 'documentos'
  | 'contratos'
  | 'assinados'
  | 'avatars';

// ─── Serviço ─────────────────────────────────────────────────────────────────

@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);

  /**
   * Cliente Supabase com service_role key → acesso total ao Storage,
   * bypassando RLS. Nunca expor essa key no frontend.
   */
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_KEY');

    if (!url || !key) {
      this.logger.warn(
        'SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados. ' +
          'Upload de documentos estará indisponível.',
      );
    }

    // Mesmo sem credenciais, o cliente é criado (evita crash na inicialização).
    // As operações de storage falharão com erro claro se as envs estiverem ausentes.
    this.supabase = createClient(url ?? '', key ?? '');
  }

  // ─── Storage: operações de arquivo ────────────────────────────────────────

  /**
   * Faz upload de um arquivo para o Supabase Storage.
   *
   * Estrutura de pastas:
   *   documentos/{officeId}/{clienteId}/{processoId}/arquivo.pdf
   *   contratos/{officeId}/{clienteId}/contrato-YYYY-MM.pdf
   *   assinados/{officeId}/{envelopeId}/contrato-assinado.pdf
   *   avatars/{officeId}/{userId}/avatar.jpg
   *
   * Compatível com AWS S3: para migrar, basta substituir o client Supabase
   * por um client S3 mantendo a mesma interface de retorno.
   */
  async uploadDocumento(
    file: Express.Multer.File,
    path: string,
    bucket: StorageBucket = 'documentos',
  ): Promise<UploadDocumentoResult> {
    if (!file) {
      throw new BadRequestException('Arquivo não fornecido');
    }

    // Validar tamanho máximo (50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`Arquivo excede o tamanho máximo de 50MB`);
    }

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: false,        // não sobrescreve — garante imutabilidade
        cacheControl: '3600',
      });

    if (error) {
      this.logger.error(`Erro ao fazer upload para ${bucket}/${path}:`, error);
      throw new InternalServerErrorException(
        `Falha no upload: ${error.message}`,
      );
    }

    // Gera URL assinada (1h) para retornar ao cliente
    const signedUrl = await this.gerarUrlAssinada(data.path, bucket);

    return {
      caminho: data.path,
      url: signedUrl,
      tamanho: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Gera uma URL pré-assinada para download seguro com expiração de 1 hora.
   * Equivalente ao S3 `getSignedUrl` com `expiresIn: 3600`.
   */
  async gerarUrlAssinada(
    path: string,
    bucket: StorageBucket = 'documentos',
    expiresInSeconds = 3600,
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error || !data?.signedUrl) {
      this.logger.error(
        `Erro ao gerar URL assinada para ${bucket}/${path}:`,
        error,
      );
      throw new InternalServerErrorException(
        `Não foi possível gerar URL de acesso: ${error?.message ?? 'desconhecido'}`,
      );
    }

    return data.signedUrl;
  }

  /**
   * Remove um arquivo do Supabase Storage.
   * Equivalente ao S3 `deleteObject`.
   */
  async deletarDocumento(
    path: string,
    bucket: StorageBucket = 'documentos',
  ): Promise<void> {
    const { error } = await this.supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      this.logger.error(`Erro ao deletar ${bucket}/${path}:`, error);
      throw new InternalServerErrorException(
        `Falha ao remover arquivo: ${error.message}`,
      );
    }
  }

  /**
   * Lista arquivos de um processo dentro do bucket.
   * Path esperado: `{officeId}/{clienteId}/{processoId}`
   */
  async listarArquivosStorage(
    folderPath: string,
    bucket: StorageBucket = 'documentos',
  ): Promise<{ nome: string; tamanho: number; ultimaModificacao: string }[]> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .list(folderPath, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      this.logger.error(`Erro ao listar ${bucket}/${folderPath}:`, error);
      throw new InternalServerErrorException(
        `Falha ao listar arquivos: ${error.message}`,
      );
    }

    return (data ?? []).map((file) => ({
      nome: file.name,
      tamanho: file.metadata?.size ?? 0,
      ultimaModificacao: file.updated_at ?? file.created_at ?? '',
    }));
  }

  // ─── CRUD: registros no banco (Prisma) ────────────────────────────────────

  async findAll(filters: FindAllFilters): Promise<PaginatedResponse<any>> {
    const {
      escritorioId,
      processoId,
      tipo,
      status,
      page = 1,
      limit = 10,
    } = filters;

    const skip = (page - 1) * limit;

    const where: any = {
      escritorioId,
      deletedAt: null,
    };

    if (processoId) where.processoId = processoId;
    if (tipo) where.tipo = tipo;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.documento.findMany({
        where,
        skip,
        take: limit,
        include: { processo: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.documento.count({ where }),
    ]);

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  async findById(id: string, officeId?: string): Promise<any> {
    const doc = await this.prisma.documento.findUnique({
      where: { id },
      include: { processo: true },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');

    // Validar que o documento pertence ao escritório do usuário
    if (officeId && (doc as any).escritorioId !== officeId) {
      throw new BadRequestException('Você não tem permissão para acessar este documento');
    }

    return doc;
  }

  async create(dto: any, authenticatedOfficeId?: string): Promise<any> {
    if (!dto.escritorioId) {
      throw new BadRequestException('escritorioId é obrigatório');
    }

    // Se autenticado, validar que o documento pertence ao escritório do usuário
    if (authenticatedOfficeId && dto.escritorioId !== authenticatedOfficeId) {
      throw new BadRequestException('Você não tem permissão para criar documentos neste escritório');
    }

    return this.prisma.documento.create({
      data: {
        nome: dto.nome,
        tipo: dto.tipo,
        tamanho: dto.tamanho,
        caminho: dto.caminho,
        status: dto.status || 'rascunho',
        processoId: dto.processoId,
        escritorioId: dto.escritorioId,
        urlAssinatura: null,
      },
      include: { processo: true },
    });
  }

  async update(id: string, dto: any): Promise<any> {
    return this.prisma.documento.update({
      where: { id },
      data: {
        nome: dto.nome,
        tipo: dto.tipo,
        tamanho: dto.tamanho,
      },
      include: { processo: true },
    });
  }

  async remove(id: string, officeId?: string): Promise<any> {
    const doc = await this.prisma.documento.findUnique({ where: { id } });

    if (!doc) throw new NotFoundException('Documento não encontrado');

    // Validar que o documento pertence ao escritório do usuário
    if (officeId && (doc as any).escritorioId !== officeId) {
      throw new BadRequestException('Você não tem permissão para deletar este documento');
    }

    // Soft-delete no banco
    const updated = await this.prisma.documento.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Remove do Storage se tiver caminho registrado
    if ((doc as any).caminho) {
      const bucket = this.inferirBucket((doc as any).caminho);
      await this.deletarDocumento((doc as any).caminho, bucket).catch((err) =>
        this.logger.warn(`Não foi possível remover do storage: ${err.message}`),
      );
    }

    return updated;
  }

  /**
   * Upload completo: envia o arquivo para o Supabase Storage e salva
   * o registro no banco com o caminho e tamanho corretos.
   *
   * Estrutura de path:
   *   documentos/{escritorioId}/{clienteId?}/{processoId}/filename-timestamp.ext
   */
  async upload(
    file: Express.Multer.File,
    dto: {
      nome?: string;
      processoId: string;
      clienteId?: string;
      escritorioId: string;
    },
    authenticatedOfficeId?: string,
  ): Promise<any> {
    if (!file) throw new BadRequestException('Arquivo não fornecido');

    if (!dto.escritorioId) {
      throw new BadRequestException('escritorioId é obrigatório');
    }

    // Se autenticado, validar que o documento pertence ao escritório do usuário
    if (authenticatedOfficeId && dto.escritorioId !== authenticatedOfficeId) {
      throw new BadRequestException('Você não tem permissão para fazer upload neste escritório');
    }

    const ext = file.originalname.split('.').pop() ?? '';
    const nomeArquivo = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    const pasta = [
      dto.escritorioId,
      dto.clienteId ?? 'sem-cliente',
      dto.processoId,
    ].join('/');
    const path = `${pasta}/${nomeArquivo}`;

    // 1. Faz upload para o Supabase Storage
    const storageResult = await this.uploadDocumento(file, path, 'documentos');

    // 2. Persiste registro no banco
    const documento = await this.prisma.documento.create({
      data: {
        nome: dto.nome ?? file.originalname,
        tipo: file.mimetype,
        tamanho: file.size,
        caminho: storageResult.caminho,
        status: 'rascunho',
        processoId: dto.processoId,
        escritorioId: dto.escritorioId,
        urlAssinatura: null,
      },
      include: { processo: true },
    });

    return {
      ...documento,
      urlTemporaria: storageResult.url,     // válida por 1 hora
    };
  }

  async findByProcesso(processoId: string): Promise<any[]> {
    const docs = await this.prisma.documento.findMany({
      where: { processoId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // Enriquece com URLs assinadas (1h cada)
    return Promise.all(
      docs.map(async (doc) => {
        const caminho = (doc as any).caminho as string | null;
        if (!caminho) return doc;

        try {
          const bucket = this.inferirBucket(caminho);
          const urlTemporaria = await this.gerarUrlAssinada(caminho, bucket);
          return { ...doc, urlTemporaria };
        } catch {
          return doc; // retorna sem URL se falhar
        }
      }),
    );
  }

  async updateStatus(id: string, status: string): Promise<any> {
    const validStatuses = ['rascunho', 'final', 'assinado'];

    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }

    const documento = await this.prisma.documento.findUnique({ where: { id } });

    if (!documento) throw new NotFoundException('Documento não encontrado');

    const statusOrder: Record<string, number> = {
      rascunho: 0,
      final: 1,
      assinado: 2,
    };

    const currentOrder = statusOrder[(documento as any).status ?? 'rascunho'];
    const newOrder = statusOrder[status];

    if (newOrder < currentOrder) {
      throw new BadRequestException(
        `Não é possível reverter status de "${(documento as any).status}" para "${status}"`,
      );
    }

    return this.prisma.documento.update({
      where: { id },
      data: {
        status,
        dataAssinatura: status === 'assinado' ? new Date() : null,
      },
      include: { processo: true },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Infere o bucket a partir do caminho armazenado.
   * Se o caminho contiver prefixo explícito (ex: "contratos/..."), usa-o.
   * Padrão: 'documentos'.
   */
  private inferirBucket(caminho: string): StorageBucket {
    const buckets: StorageBucket[] = [
      'documentos',
      'contratos',
      'assinados',
      'avatars',
    ];
    for (const b of buckets) {
      if (caminho.startsWith(`${b}/`)) return b;
    }
    return 'documentos';
  }
}
