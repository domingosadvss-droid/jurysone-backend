/**
 * JURYSONE — Conexão do número de WhatsApp de cada escritório (API oficial).
 * O token de acesso fica cifrado no banco (AES-256-GCM, common/cripto).
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { cifrar, criptografiaConfigurada, decifrar } from '../../common/cripto';
import { ErroGraph, GraphWhatsapp } from './graph-cliente';

type ConexaoBanco = Awaited<ReturnType<PrismaService['whatsappConexao']['findFirst']>>;

@Injectable()
export class ConexoesWhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  porPhoneNumberId(phoneNumberId: string) {
    return this.prisma.whatsappConexao.findFirst({ where: { phoneNumberId, ativo: true } });
  }

  doEscritorio(escritorioId: string) {
    return this.prisma.whatsappConexao.findFirst({ where: { escritorioId, ativo: true }, orderBy: { createdAt: 'desc' } });
  }

  graph(conexao: NonNullable<ConexaoBanco>) {
    return new GraphWhatsapp(decifrar(conexao.tokenCifrado));
  }

  /** Situação da conexão para a tela (sem nunca devolver o token) */
  async status(escritorioId: string) {
    const c = await this.doEscritorio(escritorioId);
    if (!c) return { conectado: false };
    return {
      conectado: true, origem: c.origem, coexistencia: c.coexistencia, numero: c.numeroExibicao, nome: c.nomeExibicao,
      phoneNumberId: c.phoneNumberId, historicoImportadoEm: c.historicoImportadoEm, desde: c.createdAt,
    };
  }

  /**
   * Conexão informada à mão (número de teste da Meta ou token de usuário do sistema).
   * A conexão comercial dos clientes virá do Embedded Signup.
   */
  async salvarManual(escritorioId: string, dto: { phoneNumberId?: string; wabaId?: string; token?: string; origem?: string }) {
    const phoneNumberId = String(dto?.phoneNumberId ?? '').trim();
    const wabaId = String(dto?.wabaId ?? '').trim();
    const token = String(dto?.token ?? '').trim();
    if (!/^\d{6,}$/.test(phoneNumberId) || !/^\d{6,}$/.test(wabaId) || token.length < 20) {
      throw new BadRequestException('Informe phoneNumberId, wabaId (números da Meta) e o token de acesso.');
    }
    if (!criptografiaConfigurada()) throw new BadRequestException('Configure CHAVE_CRIPTOGRAFIA no servidor antes de conectar o WhatsApp.');
    const outro = await this.prisma.whatsappConexao.findFirst({ where: { phoneNumberId, NOT: { escritorioId } } });
    if (outro) throw new BadRequestException('Este número já está conectado a outro escritório.');
    // Confere o token antes de gravar: a Meta devolve os dados do número
    let dados: Awaited<ReturnType<GraphWhatsapp['numero']>>;
    try {
      dados = await new GraphWhatsapp(token).numero(phoneNumberId);
    } catch (e: any) {
      if (e instanceof ErroGraph) throw new BadRequestException(`A Meta não aceitou esses dados. ${e.message}`);
      throw e;
    }
    const origem = ['TESTE', 'MANUAL', 'EMBEDDED_SIGNUP'].includes(String(dto?.origem)) ? String(dto.origem) : 'MANUAL';
    await this.prisma.whatsappConexao.updateMany({ where: { escritorioId, NOT: { phoneNumberId } }, data: { ativo: false } });
    await this.prisma.whatsappConexao.upsert({
      where: { phoneNumberId },
      create: { escritorioId, phoneNumberId, wabaId, tokenCifrado: cifrar(token), origem, numeroExibicao: dados.display_phone_number ?? null, nomeExibicao: dados.verified_name ?? null },
      update: { escritorioId, wabaId, tokenCifrado: cifrar(token), origem, ativo: true, numeroExibicao: dados.display_phone_number ?? null, nomeExibicao: dados.verified_name ?? null },
    });
    return this.status(escritorioId);
  }

  async desconectar(escritorioId: string) {
    const c = await this.doEscritorio(escritorioId);
    if (!c) throw new NotFoundException('Nenhum WhatsApp conectado.');
    await this.prisma.whatsappConexao.update({ where: { id: c.id }, data: { ativo: false } });
    return { conectado: false };
  }
}
