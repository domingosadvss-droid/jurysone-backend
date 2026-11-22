/**
 * JURYSONE — Conexões de WhatsApp. Desde 22/11/2026 cada LOGIN conecta o próprio número:
 *   • a caixa de um número só aparece para o dono e para quem o dono liberar (acessoIds);
 *   • nem o administrador vê a caixa de outro login sem ser liberado;
 *   • o número do escritório é o número conectado no login do escritório, que decide quem vê.
 * O token da API oficial fica cifrado no banco (AES-256-GCM, common/cripto).
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { cifrar, criptografiaConfigurada, decifrar } from '../../common/cripto';
import { ErroGraph, GraphWhatsapp } from './graph-cliente';

type ConexaoBanco = Awaited<ReturnType<PrismaService['whatsappConexao']['findFirst']>>;
type Usuario = { id: string; officeId: string };

@Injectable()
export class ConexoesWhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  porPhoneNumberId(phoneNumberId: string) {
    return this.prisma.whatsappConexao.findFirst({ where: { phoneNumberId, ativo: true } });
  }

  /** O número conectado no login do usuário (um por login) */
  minha(user: Usuario) {
    return this.prisma.whatsappConexao.findFirst({ where: { escritorioId: user.officeId, usuarioId: user.id, ativo: true }, orderBy: { createdAt: 'desc' } });
  }

  /** Filtro do Prisma: conexões (ativas ou não, para manter o histórico) que o usuário pode ver */
  filtroVisiveis(user: Usuario) {
    return { escritorioId: user.officeId, OR: [{ usuarioId: user.id }, { acessoIds: { has: user.id } }] };
  }

  podeVer(user: Usuario, c: { escritorioId: string; usuarioId: string | null; acessoIds: string[] }) {
    return c.escritorioId === user.officeId && (c.usuarioId === user.id || (c.acessoIds ?? []).includes(user.id));
  }

  graph(conexao: NonNullable<ConexaoBanco>) {
    return new GraphWhatsapp(decifrar(conexao.tokenCifrado));
  }

  /** Situação para a tela: o número do próprio login e os números liberados para ele (sem token) */
  async status(user: Usuario) {
    const c = await this.minha(user);
    const outras = await this.prisma.whatsappConexao.findMany({
      where: { escritorioId: user.officeId, ativo: true, acessoIds: { has: user.id }, NOT: { usuarioId: user.id } },
      orderBy: { createdAt: 'asc' },
    });
    const donos = await this.prisma.usuario.findMany({ where: { id: { in: outras.map((o) => o.usuarioId!).filter(Boolean) } }, select: { id: true, nome: true } });
    const compartilhadas = outras.map((o) => ({
      id: o.id, origem: o.origem, numero: o.numeroExibicao, nome: o.nomeExibicao,
      dono: donos.find((d) => d.id === o.usuarioId)?.nome ?? null,
    }));
    if (!c) return { conectado: false, compartilhadas };
    return {
      conectado: true, id: c.id, origem: c.origem, coexistencia: c.coexistencia, numero: c.numeroExibicao, nome: c.nomeExibicao,
      phoneNumberId: c.phoneNumberId, historicoImportadoEm: c.historicoImportadoEm, desde: c.createdAt,
      acessoIds: c.acessoIds, iaAtivo: c.iaAtivo, compartilhadas,
    };
  }

  /** Quem pode ver a caixa do meu número, e a equipe para escolher */
  async acessos(user: Usuario) {
    const c = await this.minha(user);
    const equipe = await this.prisma.usuario.findMany({
      where: { escritorioId: user.officeId, ativo: true, NOT: { id: user.id } },
      select: { id: true, nome: true, email: true }, orderBy: { nome: 'asc' },
    });
    return { conectado: !!c, numero: c?.numeroExibicao ?? null, acessoIds: c?.acessoIds ?? [], equipe };
  }

  async definirAcessos(user: Usuario, dto: { usuarioIds?: unknown }) {
    const c = await this.minha(user);
    if (!c) throw new NotFoundException('Conecte o seu WhatsApp antes de liberar o acesso.');
    if (!Array.isArray(dto?.usuarioIds)) throw new BadRequestException('Informe usuarioIds (lista).');
    const ids = [...new Set(dto.usuarioIds.map(String))].filter((id) => id !== user.id);
    const validos = await this.prisma.usuario.count({ where: { id: { in: ids }, escritorioId: user.officeId } });
    if (validos !== ids.length) throw new ForbiddenException('Usuário de fora do escritório.');
    await this.prisma.whatsappConexao.update({ where: { id: c.id }, data: { acessoIds: ids } });
    return this.acessos(user);
  }

  /**
   * Conexão informada à mão (número de teste da Meta ou token de usuário do sistema),
   * gravada no login de quem conectou. A conexão comercial virá do Embedded Signup.
   */
  async salvarManual(user: Usuario, dto: { phoneNumberId?: string; wabaId?: string; token?: string; origem?: string }) {
    const escritorioId = user.officeId;
    const phoneNumberId = String(dto?.phoneNumberId ?? '').trim();
    const wabaId = String(dto?.wabaId ?? '').trim();
    const token = String(dto?.token ?? '').trim();
    if (!/^\d{6,}$/.test(phoneNumberId) || !/^\d{6,}$/.test(wabaId) || token.length < 20) {
      throw new BadRequestException('Informe phoneNumberId, wabaId (números da Meta) e o token de acesso.');
    }
    if (!criptografiaConfigurada()) throw new BadRequestException('Configure CHAVE_CRIPTOGRAFIA no servidor antes de conectar o WhatsApp.');
    const outro = await this.prisma.whatsappConexao.findFirst({ where: { phoneNumberId, NOT: { escritorioId } } });
    if (outro) throw new BadRequestException('Este número já está conectado a outro escritório.');
    const deOutroLogin = await this.prisma.whatsappConexao.findFirst({ where: { phoneNumberId, escritorioId, ativo: true, NOT: { usuarioId: user.id } } });
    if (deOutroLogin) throw new BadRequestException('Este número já está conectado em outro login do escritório.');
    // Confere o token antes de gravar: a Meta devolve os dados do número
    let dados: Awaited<ReturnType<GraphWhatsapp['numero']>>;
    try {
      dados = await new GraphWhatsapp(token).numero(phoneNumberId);
    } catch (e: any) {
      if (e instanceof ErroGraph) throw new BadRequestException(`A Meta não aceitou esses dados. ${e.message}`);
      throw e;
    }
    const origem = ['TESTE', 'MANUAL', 'EMBEDDED_SIGNUP'].includes(String(dto?.origem)) ? String(dto.origem) : 'MANUAL';
    await this.prisma.whatsappConexao.updateMany({ where: { escritorioId, usuarioId: user.id, NOT: { phoneNumberId } }, data: { ativo: false } });
    await this.prisma.whatsappConexao.upsert({
      where: { phoneNumberId },
      create: { escritorioId, usuarioId: user.id, phoneNumberId, wabaId, tokenCifrado: cifrar(token), origem, numeroExibicao: dados.display_phone_number ?? null, nomeExibicao: dados.verified_name ?? null },
      update: { escritorioId, usuarioId: user.id, wabaId, tokenCifrado: cifrar(token), origem, ativo: true, numeroExibicao: dados.display_phone_number ?? null, nomeExibicao: dados.verified_name ?? null },
    });
    return this.status(user);
  }

  async desconectar(user: Usuario) {
    const c = await this.minha(user);
    if (!c) throw new NotFoundException('Nenhum WhatsApp conectado no seu login.');
    await this.prisma.whatsappConexao.update({ where: { id: c.id }, data: { ativo: false } });
    return { conectado: false };
  }
}
