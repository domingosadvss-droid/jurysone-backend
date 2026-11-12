/**
 * JURYSONE — Conflitos de interesse e impedimentos
 *
 * Regras definidas pelo escritório:
 *   • O escritório nunca representa lados opostos.
 *   • Conciliador: as partes de uma sessão de conciliação ficam bloqueadas por 1 ano.
 *   • Auditor do TJD / atuação em juízo: alerta quando o caso novo é naquele órgão.
 * A checagem compara nome normalizado (exato) e CPF/CNPJ (só dígitos). Não faz busca
 * aproximada para evitar falso positivo; o advogado revisa cada ocorrência.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export const TIPOS_IMPEDIMENTO = ['CONCILIACAO', 'TJD', 'JUIZO', 'OUTRO'] as const;

export function normalizarNome(nome?: string | null): string {
  return String(nome ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function soDigitos(doc?: string | null): string {
  return String(doc ?? '').replace(/\D/g, '');
}

function mesmaPessoa(a: { nome?: string | null; doc?: string | null }, b: { nome?: string | null; doc?: string | null }) {
  const da = soDigitos(a.doc), db = soDigitos(b.doc);
  if (da.length >= 11 && db.length >= 11) return da === db;
  const na = normalizarNome(a.nome), nb = normalizarNome(b.nome);
  return na.length >= 5 && na === nb;
}

export interface Ocorrencia {
  tipo: 'CONTATO_E_PARTE_CONTRARIA' | 'PARTE_CONTRARIA_E_CLIENTE' | 'IMPEDIMENTO_CONCILIACAO' | 'IMPEDIMENTO_ORGAO' | 'IMPEDIMENTO_OUTRO';
  bloqueia: boolean;
  mensagem: string;
  processoId?: string;
  clienteId?: string;
  impedimentoId?: string;
  usuarioId?: string;
}

@Injectable()
export class ConflitosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * dto: { nome, cpfCnpj, parteContrariaNome, parteContrariaCpfCnpj, orgao }
   *   nome/cpfCnpj      → quem está procurando o escritório
   *   parteContraria*   → contra quem ele quer agir
   *   orgao             → tribunal/juízo do caso (para impedimentos de função)
   */
  async verificar(escritorioId: string, dto: any) {
    const contato = { nome: dto?.nome, doc: dto?.cpfCnpj };
    const contraria = { nome: dto?.parteContrariaNome, doc: dto?.parteContrariaCpfCnpj };
    if (!normalizarNome(contato.nome) && !soDigitos(contato.doc) && !normalizarNome(contraria.nome) && !soDigitos(contraria.doc)) {
      throw new BadRequestException('Informe ao menos o nome ou CPF/CNPJ do contato ou da parte contrária.');
    }

    const ocorrencias: Ocorrencia[] = [];
    const [processos, clientes, impedimentos] = await Promise.all([
      this.prisma.processo.findMany({
        where: { escritorioId, deletedAt: null },
        select: { id: true, numero: true, camposCustom: true, cliente: { select: { id: true, nome: true, cpfCnpj: true } } },
      }),
      this.prisma.cliente.findMany({
        where: { escritorioId, deletedAt: null },
        select: { id: true, nome: true, cpfCnpj: true, cpf: true },
      }),
      this.prisma.impedimento.findMany({ where: { escritorioId } }),
    ]);

    // 1. O contato aparece como parte em processo de outro cliente do escritório
    if (normalizarNome(contato.nome) || soDigitos(contato.doc)) {
      for (const p of processos) {
        const partes = ((p.camposCustom as any)?.partes ?? []) as any[];
        for (const parte of partes) {
          const alvo = { nome: parte?.nome, doc: parte?.cpfCnpj ?? parte?.cpf ?? parte?.cnpj ?? parte?.documento };
          if (!mesmaPessoa(contato, alvo)) continue;
          if (p.cliente && mesmaPessoa(contato, { nome: p.cliente.nome, doc: p.cliente.cpfCnpj })) continue;
          ocorrencias.push({
            tipo: 'CONTATO_E_PARTE_CONTRARIA',
            bloqueia: true,
            mensagem: `Contato aparece como parte no processo ${p.numero}, do cliente ${p.cliente?.nome ?? '—'}.`,
            processoId: p.id,
            clienteId: p.cliente?.id,
          });
        }
      }
    }

    // 2. A parte contrária é cliente do escritório
    if (normalizarNome(contraria.nome) || soDigitos(contraria.doc)) {
      for (const c of clientes) {
        if (mesmaPessoa(contraria, { nome: c.nome, doc: c.cpfCnpj ?? c.cpf })) {
          ocorrencias.push({
            tipo: 'PARTE_CONTRARIA_E_CLIENTE',
            bloqueia: true,
            mensagem: `A parte contrária (${c.nome}) é cliente do escritório.`,
            clienteId: c.id,
          });
        }
      }
    }

    // 3. Impedimentos pessoais (conciliação, TJD, juízo)
    const agora = new Date();
    const orgao = normalizarNome(dto?.orgao);
    for (const imp of impedimentos) {
      if (imp.validoAte && imp.validoAte < agora) continue;
      const pessoaImp = { nome: imp.nome, doc: imp.cpfCnpj };
      const bateContato = (normalizarNome(imp.nome) || soDigitos(imp.cpfCnpj)) &&
        (mesmaPessoa(contato, pessoaImp) || mesmaPessoa(contraria, pessoaImp));
      const bateOrgao = orgao && imp.orgao && (orgao.includes(normalizarNome(imp.orgao)) || normalizarNome(imp.orgao).includes(orgao));

      if (imp.tipo === 'CONCILIACAO' && bateContato) {
        ocorrencias.push({
          tipo: 'IMPEDIMENTO_CONCILIACAO',
          bloqueia: true,
          mensagem: `Pessoa participou de conciliação conduzida por advogado do escritório (impedimento até ${imp.validoAte?.toLocaleDateString('pt-BR') ?? '—'}).`,
          impedimentoId: imp.id,
          usuarioId: imp.usuarioId,
        });
      } else if (imp.tipo === 'JUIZO' && bateOrgao) {
        // TJD não gera checagem (decisão 118): só as sessões entram na agenda
        ocorrencias.push({
          tipo: 'IMPEDIMENTO_ORGAO',
          bloqueia: true,
          mensagem: `Caso no órgão "${imp.orgao}", onde um advogado do escritório exerce função (${imp.tipo}).`,
          impedimentoId: imp.id,
          usuarioId: imp.usuarioId,
        });
      } else if (imp.tipo === 'OUTRO' && (bateContato || bateOrgao)) {
        ocorrencias.push({
          tipo: 'IMPEDIMENTO_OUTRO',
          bloqueia: true,
          mensagem: imp.descricao || 'Impedimento cadastrado para esta pessoa ou órgão.',
          impedimentoId: imp.id,
          usuarioId: imp.usuarioId,
        });
      }
    }

    return {
      bloqueado: ocorrencias.some((o) => o.bloqueia),
      ocorrencias,
      // Texto neutro para o cliente: não revela o motivo (sigilo)
      mensagemAoContato: ocorrencias.some((o) => o.bloqueia)
        ? 'Agradecemos o contato. Infelizmente, o escritório não poderá atuar neste caso.'
        : null,
    };
  }

  // ── Cadastro de impedimentos ─────────────────────────────────────────────

  listar(escritorioId: string, query: any) {
    const where: any = { escritorioId };
    if (query?.usuarioId) where.usuarioId = query.usuarioId;
    if (query?.tipo) where.tipo = String(query.tipo).toUpperCase();
    if (query?.vigentes === 'true') where.OR = [{ validoAte: null }, { validoAte: { gte: new Date() } }];
    return this.prisma.impedimento.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async criar(escritorioId: string, dto: any, autor: any) {
    const tipo = String(dto?.tipo ?? '').toUpperCase();
    if (!TIPOS_IMPEDIMENTO.includes(tipo as any)) {
      throw new BadRequestException(`Tipo inválido. Use: ${TIPOS_IMPEDIMENTO.join(', ')}`);
    }
    const usuarioId = dto.usuarioId ?? autor.id;
    const u = await this.prisma.usuario.findFirst({ where: { id: usuarioId, escritorioId }, select: { id: true } });
    if (!u) throw new BadRequestException('Usuário não encontrado neste escritório.');

    if (tipo === 'CONCILIACAO' && !dto.nome && !dto.cpfCnpj) {
      throw new BadRequestException('Na conciliação, informe o nome ou CPF/CNPJ da parte.');
    }
    if ((tipo === 'TJD' || tipo === 'JUIZO') && !dto.orgao) {
      throw new BadRequestException('Informe o órgão (tribunal, comarca ou vara).');
    }

    const dataEvento = dto.dataEvento ? new Date(dto.dataEvento) : (tipo === 'CONCILIACAO' ? new Date() : null);
    let validoAte = dto.validoAte ? new Date(dto.validoAte) : null;
    if (tipo === 'CONCILIACAO' && !validoAte && dataEvento) {
      validoAte = new Date(dataEvento);
      validoAte.setFullYear(validoAte.getFullYear() + 1);
    }

    return this.prisma.impedimento.create({
      data: {
        escritorioId, usuarioId, tipo,
        nome: dto.nome ?? null,
        cpfCnpj: dto.cpfCnpj ? soDigitos(dto.cpfCnpj) : null,
        orgao: dto.orgao ?? null,
        descricao: dto.descricao ?? null,
        dataEvento, validoAte,
      },
    });
  }

  /** Lança de uma vez as partes de uma sessão de conciliação */
  async registrarSessaoConciliacao(escritorioId: string, dto: any, autor: any) {
    const partes = Array.isArray(dto?.partes) ? dto.partes : [];
    if (partes.length === 0) throw new BadRequestException('Informe as partes da sessão (partes: [{ nome, cpfCnpj }]).');
    const criados = [];
    for (const parte of partes) {
      criados.push(await this.criar(escritorioId, {
        tipo: 'CONCILIACAO',
        usuarioId: dto.usuarioId,
        nome: parte.nome,
        cpfCnpj: parte.cpfCnpj,
        orgao: dto.orgao,
        dataEvento: dto.dataSessao,
        descricao: dto.processoNumero ? `Sessão de conciliação — processo ${dto.processoNumero}` : 'Sessão de conciliação',
      }, autor));
    }
    return { registrados: criados.length, impedimentos: criados };
  }

  async remover(escritorioId: string, id: string) {
    const imp = await this.prisma.impedimento.findFirst({ where: { id, escritorioId } });
    if (!imp) throw new NotFoundException('Impedimento não encontrado');
    await this.prisma.impedimento.delete({ where: { id } });
    return { message: 'Impedimento removido' };
  }
}
