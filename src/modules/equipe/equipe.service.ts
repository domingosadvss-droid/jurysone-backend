/**
 * JURYSONE — Equipe
 * Cadastro dos usuários do escritório, com perfil de acesso e termo de responsabilidade.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS, PERFIS_VALIDOS, perfisDo } from '../../common/perfis';

const CAMPOS_PUBLICOS = {
  id: true, nome: true, email: true, roles: true, oabNumero: true, oabEstado: true,
  telefone: true, ativo: true, parceiroId: true, termoAceitoEm: true,
  termoDocumentoUrl: true, createdAt: true,
} as const;

@Injectable()
export class EquipeService {
  constructor(private readonly prisma: PrismaService) {}

  listar(escritorioId: string) {
    return this.prisma.usuario.findMany({
      where: { escritorioId },
      select: CAMPOS_PUBLICOS,
      orderBy: { nome: 'asc' },
    });
  }

  private normalizarPerfil(perfil: any): string {
    const p = String(perfil ?? '').trim().toUpperCase();
    if (!PERFIS_VALIDOS.includes(p)) {
      throw new BadRequestException(`Perfil inválido. Use: ${PERFIS_VALIDOS.join(', ')}`);
    }
    return p;
  }

  private async validarParceiro(parceiroId: string | undefined, perfil: string, escritorioId: string) {
    if (perfil !== PERFIS.PARCEIRO) return null;
    if (!parceiroId) throw new BadRequestException('Usuário parceiro precisa estar vinculado a um cadastro de parceiro (parceiroId).');
    const parceiro = await this.prisma.parceiro.findFirst({ where: { id: parceiroId, escritorioId } });
    if (!parceiro) throw new BadRequestException('Parceiro não encontrado neste escritório.');
    return parceiroId;
  }

  async criar(dto: any, escritorioId: string) {
    const perfil = this.normalizarPerfil(dto.perfil ?? dto.roles);
    if (!dto.nome || !dto.email || !dto.senha) {
      throw new BadRequestException('Informe nome, email e senha.');
    }
    if (String(dto.senha).length < 10) {
      throw new BadRequestException('A senha precisa ter pelo menos 10 caracteres.');
    }
    const email = String(dto.email).trim().toLowerCase();
    const existe = await this.prisma.usuario.findUnique({ where: { email } });
    if (existe) throw new BadRequestException('Já existe um usuário com este email.');

    const parceiroId = await this.validarParceiro(dto.parceiroId, perfil, escritorioId);

    return this.prisma.usuario.create({
      data: {
        nome: dto.nome,
        email,
        senha: await argon2.hash(dto.senha),
        roles: perfil,
        oabNumero: dto.oabNumero,
        oabEstado: dto.oabEstado,
        telefone: dto.telefone,
        parceiroId,
        escritorioId,
        ativo: true,
      },
      select: CAMPOS_PUBLICOS,
    });
  }

  async atualizar(id: string, dto: any, escritorioId: string, autor: any) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, escritorioId } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');

    const data: any = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.telefone !== undefined) data.telefone = dto.telefone;
    if (dto.oabNumero !== undefined) data.oabNumero = dto.oabNumero;
    if (dto.oabEstado !== undefined) data.oabEstado = dto.oabEstado;
    if (dto.ativo !== undefined) data.ativo = Boolean(dto.ativo);

    const novoPerfil = dto.perfil ?? dto.roles;
    if (novoPerfil !== undefined) {
      data.roles = this.normalizarPerfil(novoPerfil);
      data.parceiroId = await this.validarParceiro(dto.parceiroId ?? usuario.parceiroId ?? undefined, data.roles, escritorioId);
    } else if (dto.parceiroId !== undefined) {
      data.parceiroId = await this.validarParceiro(dto.parceiroId, perfisDo(usuario)[0], escritorioId);
    }

    // O titular não pode se rebaixar nem se desativar sozinho
    if (id === autor.id) {
      const perdeAdmin = data.roles !== undefined && !perfisDo({ roles: data.roles }).includes(PERFIS.ADMIN);
      if (perdeAdmin || data.ativo === false) {
        throw new BadRequestException('Você não pode remover o seu próprio perfil de administrador nem se desativar.');
      }
    }

    return this.prisma.usuario.update({ where: { id }, data, select: CAMPOS_PUBLICOS });
  }

  /** Registra o termo de ciência e responsabilidade assinado (link do documento assinado). */
  async registrarTermo(id: string, dto: any, escritorioId: string) {
    const usuario = await this.prisma.usuario.findFirst({ where: { id, escritorioId } });
    if (!usuario) throw new NotFoundException('Usuário não encontrado');
    if (!dto?.documentoUrl) {
      throw new BadRequestException('Informe o link do termo assinado (documentoUrl).');
    }
    return this.prisma.usuario.update({
      where: { id },
      data: {
        termoAceitoEm: dto.assinadoEm ? new Date(dto.assinadoEm) : new Date(),
        termoDocumentoUrl: dto.documentoUrl,
      },
      select: CAMPOS_PUBLICOS,
    });
  }
}
