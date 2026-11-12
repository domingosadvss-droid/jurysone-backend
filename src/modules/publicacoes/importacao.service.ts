/**
 * JURYSONE — Importação dos processos antigos pela OAB e conciliações pelo número
 *
 *   109 entram direto os processos com publicação nos últimos 2 anos; o resto vai para a
 *       lista de decisão do advogado;
 *   110 cliente: procura nos cadastros; não achou, cria com o nome e marca "cadastro incompleto";
 *   111 mesmo nome sem CPF: vincula sozinho só se a cidade bater; senão pede confirmação;
 *   117 conciliador: informa só os números; as partes vêm do DataJud (quando o tribunal as
 *       publica) ou dos destinatários das comunicações do DJEN, e ficam impedidas por 1 ano.
 */
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS, perfisDo } from '../../common/perfis';
import { DatajudService } from '../datajud/datajud.service';
import { ConflitosService } from '../conflitos/conflitos.service';
import { PublicacoesService } from './publicacoes.service';
import { ComunicacaoDjen } from './djen-cliente';
import { diaLocal } from './agenda-prazos.service';
import { somarDias } from './calendario';
import { comarcaDoOrgao, mascararCnj, numeroCnj, tribunalDoNumero } from './analise';
import { criarClienteIncompleto, procurarCliente } from './clientes-vinculo';

const ANOS_RECENTES = 2;

@Injectable()
export class ImportacaoService {
  private readonly logger = new Logger(ImportacaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publicacoes: PublicacoesService,
    private readonly datajud: DatajudService,
    private readonly conflitos: ConflitosService,
  ) {}

  private gestao(user: any) {
    return perfisDo(user).some((p) => [PERFIS.ADMIN, PERFIS.SOCIO, PERFIS.ADVOGADO].includes(p as any));
  }

  /** Importa os processos de uma OAB (do próprio usuário; o titular/sócia podem importar de outro) */
  async importar(user: any, dto: any = {}) {
    const usuarioId = dto?.usuarioId ?? user.id;
    if (usuarioId !== user.id && !this.gestao(user)) throw new ForbiddenException('Só é possível importar pela própria OAB.');
    const u = await this.prisma.usuario.findFirst({ where: { id: usuarioId, escritorioId: user.officeId }, select: { id: true, oabNumero: true, oabEstado: true } });
    if (!u?.oabNumero || !u?.oabEstado) throw new BadRequestException('Cadastre a OAB (número e UF) do advogado antes de importar.');
    const hoje = diaLocal(new Date());
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(String(dto?.desde ?? '')) ? dto.desde : somarDias(hoje, -365 * 5);
    const { itens, completo } = await this.publicacoes.djen.porOab(u.oabNumero, u.oabEstado, desde, hoje);
    return this.importarComunicacoes(user.officeId, u.id, itens, completo);
  }

  /** Agrupa por processo e decide: cria direto, pede decisão ou pede confirmação do cliente */
  async importarComunicacoes(escritorioId: string, usuarioId: string, itens: ComunicacaoDjen[], completo = true) {
    const limite = somarDias(diaLocal(new Date()), -365 * ANOS_RECENTES);
    const existentes = new Set(
      (await this.prisma.processo.findMany({ where: { escritorioId, deletedAt: null }, select: { numero: true } }))
        .map((p) => numeroCnj(p.numero)).filter(Boolean) as string[],
    );
    const grupos = new Map<string, ComunicacaoDjen[]>();
    for (const c of itens) {
      if (c.motivoCancelamento) continue;
      const lista = grupos.get(c.numeroProcesso) ?? [];
      lista.push(c);
      grupos.set(c.numeroProcesso, lista);
    }
    const resultado = { processosCriados: 0, jaCadastrados: 0, paraDecidir: 0, clientesAConfirmar: 0, clientesNovos: 0, clientesVinculados: 0, completo };
    for (const [numero, lista] of grupos) {
      if (existentes.has(numero)) { resultado.jaCadastrados++; continue; }
      lista.sort((a, b) => (a.dataDisponibilizacao < b.dataDisponibilizacao ? 1 : -1));
      const ultima = lista[0];
      const partes = this.partesDe(lista);
      const base = {
        escritorioId, usuarioId, numeroProcesso: mascararCnj(numero), tribunal: ultima.tribunal || tribunalDoNumero(numero),
        orgao: ultima.orgao, classe: ultima.classe, ultimaPublicacao: new Date(`${ultima.dataDisponibilizacao}T12:00:00-03:00`), partes: partes as any,
      };
      if (ultima.dataDisponibilizacao < limite) {
        await this.prisma.pendenciaImportacao.upsert({
          where: { escritorioId_usuarioId_numeroProcesso: { escritorioId, usuarioId, numeroProcesso: base.numeroProcesso } },
          create: { ...base, tipo: 'DECIDIR_ANTIGO', motivo: `Última publicação em ${ultima.dataDisponibilizacao.split('-').reverse().join('/')} (mais de ${ANOS_RECENTES} anos).` },
          update: { ultimaPublicacao: base.ultimaPublicacao },
        });
        resultado.paraDecidir++;
        continue;
      }
      const r = await this.criarProcessoImportado(escritorioId, usuarioId, base, partes);
      if (r === 'CONFIRMAR') resultado.clientesAConfirmar++;
      else {
        resultado.processosCriados++;
        if (r === 'NOVO') resultado.clientesNovos++;
        else resultado.clientesVinculados++;
      }
    }
    return resultado;
  }

  private partesDe(lista: ComunicacaoDjen[]) {
    const vistos = new Map<string, { nome: string; polo: string | null }>();
    for (const c of lista) for (const d of c.destinatarios) if (!vistos.has(d.nome)) vistos.set(d.nome, d);
    return [...vistos.values()];
  }

  /** O cliente é o destinatário intimado na pessoa do advogado (o primeiro que não é órgão público) */
  private clienteProvavel(partes: { nome: string; polo: string | null }[]) {
    return partes.find((p) => !/minist[eé]rio\s+p[uú]blico|defensoria|fazenda|uni[aã]o|estado\s+de|munic[ií]pio\s+de|instituto\s+nacional/i.test(p.nome)) ?? partes[0];
  }

  private async criarProcessoImportado(escritorioId: string, usuarioId: string, base: any, partes: { nome: string; polo: string | null }[],
    clienteEscolhidoId?: string | null): Promise<'NOVO' | 'VINCULADO' | 'CONFIRMAR'> {
    const cli = this.clienteProvavel(partes);
    const comarca = comarcaDoOrgao(base.orgao);
    let clienteId = clienteEscolhidoId ?? null;
    let tipo: 'NOVO' | 'VINCULADO' = 'VINCULADO';
    if (!clienteId) {
      const busca = cli ? await procurarCliente(this.prisma, escritorioId, cli.nome, comarca ?? base.orgao) : ({ tipo: 'NOVO' } as const);
      if (busca.tipo === 'CONFIRMAR') {
        await this.prisma.pendenciaImportacao.upsert({
          where: { escritorioId_usuarioId_numeroProcesso: { escritorioId, usuarioId, numeroProcesso: base.numeroProcesso } },
          create: { ...base, tipo: 'CONFIRMAR_CLIENTE', clienteSugeridoId: busca.candidatos[0]?.id ?? null, motivo: `Mesmo nome de cliente já cadastrado (${busca.candidatos.map((c) => c.nome + (c.cidade ? ` — ${c.cidade}` : '')).join('; ')}), sem outro dado que confirme.` },
          update: {},
        });
        return 'CONFIRMAR';
      }
      if (busca.tipo === 'VINCULADO') clienteId = busca.clienteId;
      else {
        const novo = await criarClienteIncompleto(this.prisma, escritorioId, { nome: cli?.nome ?? `Cliente do processo ${base.numeroProcesso}`, cidade: comarca, origem: 'IMPORTACAO' });
        clienteId = novo.id;
        tipo = 'NOVO';
      }
    }
    await this.prisma.processo.create({
      data: {
        escritorioId, numero: base.numeroProcesso, tribunal: base.tribunal, tipoAcao: base.classe ?? null,
        titulo: `${base.classe ?? 'Processo'} — ${cli?.nome ?? ''}`.slice(0, 250), clienteId: clienteId!, responsavelId: usuarioId,
        camposCustom: { importado: 'DJEN', orgao: base.orgao ?? null, comarca, partes: partes.filter((p) => p.nome !== cli?.nome) } as any,
      },
    });
    return tipo;
  }

  listarPendencias(user: any, q: any = {}) {
    const where: any = { escritorioId: user.officeId, status: q.status ? String(q.status).toUpperCase() : 'PENDENTE' };
    if (!this.gestao(user) || q.minhas === 'true') where.usuarioId = user.id;
    if (q.tipo) where.tipo = String(q.tipo).toUpperCase();
    return this.prisma.pendenciaImportacao.findMany({ where, orderBy: { ultimaPublicacao: 'desc' } });
  }

  /** acao: IMPORTAR (com clienteId opcional para confirmar o vínculo) | DESCARTAR */
  async decidirPendencia(user: any, id: string, dto: any) {
    const p = await this.prisma.pendenciaImportacao.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!p) throw new NotFoundException('Pendência não encontrada');
    if (p.usuarioId !== user.id && !this.gestao(user)) throw new ForbiddenException('Pendência de outro advogado.');
    if (p.status !== 'PENDENTE') throw new BadRequestException('Pendência já decidida.');
    const acao = String(dto?.acao ?? '').toUpperCase();
    if (acao === 'DESCARTAR') return this.prisma.pendenciaImportacao.update({ where: { id }, data: { status: 'DESCARTADO' } });
    if (acao !== 'IMPORTAR') throw new BadRequestException('acao: IMPORTAR ou DESCARTAR');
    let clienteId: string | null = null;
    if (dto?.clienteId) {
      const c = await this.prisma.cliente.findFirst({ where: { id: dto.clienteId, escritorioId: user.officeId } });
      if (!c) throw new NotFoundException('Cliente não encontrado');
      clienteId = c.id;
    } else if (p.tipo === 'CONFIRMAR_CLIENTE' && dto?.novoCliente !== true) {
      throw new BadRequestException('Informe clienteId (é a mesma pessoa) ou novoCliente: true (é outra pessoa).');
    } else if (dto?.novoCliente === true) {
      const partes = (p.partes as any[]) ?? [];
      const cli = this.clienteProvavel(partes);
      clienteId = (await criarClienteIncompleto(this.prisma, user.officeId, { nome: cli?.nome ?? `Cliente do processo ${p.numeroProcesso}`, cidade: comarcaDoOrgao(p.orgao), origem: 'IMPORTACAO' })).id;
    }
    const base = { escritorioId: p.escritorioId, usuarioId: p.usuarioId, numeroProcesso: p.numeroProcesso, tribunal: p.tribunal, orgao: p.orgao, classe: p.classe };
    const r = await this.criarProcessoImportado(p.escritorioId, p.usuarioId, base, (p.partes as any[]) ?? [], clienteId);
    if (r === 'CONFIRMAR') throw new BadRequestException('Cliente ainda ambíguo: informe clienteId ou novoCliente: true.');
    const proc = await this.prisma.processo.findFirst({ where: { escritorioId: p.escritorioId, numero: p.numeroProcesso }, orderBy: { createdAt: 'desc' } });
    return this.prisma.pendenciaImportacao.update({ where: { id }, data: { status: 'IMPORTADO', processoId: proc?.id ?? null } });
  }

  // ═══════════════════════ 117: CONCILIAÇÕES PELO NÚMERO ══════════════════

  async conciliacoesPorNumero(user: any, dto: any) {
    const numeros: string[] = Array.isArray(dto?.numeros) ? dto.numeros : [];
    if (!numeros.length) throw new BadRequestException('Informe numeros: ["0000000-00.0000.0.00.0000", ...]');
    const dataSessao = /^\d{4}-\d{2}-\d{2}$/.test(String(dto?.dataSessao ?? '')) ? dto.dataSessao : diaLocal(new Date());
    const usuarioId = dto?.usuarioId ?? user.id;
    const resultado: any[] = [];
    for (const bruto of numeros) {
      const dig = numeroCnj(bruto);
      if (!dig) { resultado.push({ numero: bruto, erro: 'Número CNJ inválido' }); continue; }
      const numero = mascararCnj(dig);
      const partes = new Map<string, { nome: string; cpfCnpj?: string | null; fonte: string }>();
      const tribunal = tribunalDoNumero(dig);
      // 1) DataJud (alguns tribunais publicam as partes)
      if (tribunal) {
        try {
          const r = await this.datajud.buscarPorNumero(dig, tribunal);
          for (const p of (r?.dados?.partes ?? []) as any[]) {
            const nome = String(p?.nome ?? '').trim();
            if (nome) partes.set(nome, { nome, cpfCnpj: p?.documento ?? p?.cpfCnpj ?? null, fonte: 'DataJud' });
          }
        } catch (e: any) { this.logger.warn(`DataJud ${numero}: ${e?.message ?? e}`); }
      }
      // 2) DJEN: destinatários das comunicações do processo (intimação para a sessão)
      if (!partes.size) {
        try {
          for (const c of await this.publicacoes.djen.porProcesso(dig)) {
            for (const d of c.destinatarios) {
              if (/minist[eé]rio\s+p[uú]blico|defensoria/i.test(d.nome)) continue;
              if (!partes.has(d.nome)) partes.set(d.nome, { nome: d.nome, fonte: 'DJEN' });
            }
          }
        } catch (e: any) { this.logger.warn(`DJEN ${numero}: ${e?.message ?? e}`); }
      }
      if (!partes.size) {
        resultado.push({ numero, partes: [], aviso: 'Partes não encontradas no DataJud nem no DJEN: cadastre-as manualmente.' });
        continue;
      }
      const r = await this.conflitos.registrarSessaoConciliacao(user.officeId, {
        usuarioId, dataSessao, processoNumero: numero, partes: [...partes.values()].map((p) => ({ nome: p.nome, cpfCnpj: p.cpfCnpj ?? undefined })),
      }, user);
      await this.prisma.impedimento.updateMany({ where: { id: { in: r.impedimentos.map((i: any) => i.id) } }, data: { processoNumero: numero } });
      resultado.push({ numero, partes: [...partes.values()], impedimentosCriados: r.registrados });
    }
    if (resultado.some((r) => r.aviso)) {
      await this.publicacoesAviso(user, resultado.filter((r) => r.aviso).map((r) => r.numero));
    }
    return { dataSessao, validoAte: somarDias(dataSessao, 365), resultado };
  }

  private async publicacoesAviso(user: any, numeros: string[]) {
    await this.prisma.notificacao.create({
      data: {
        escritorioId: user.officeId, usuarioId: user.id, tipo: 'CONCILIACAO_SEM_PARTES', titulo: 'Conciliação sem partes encontradas',
        mensagem: `Cadastre manualmente as partes de: ${numeros.join(', ')}.`, prioridade: 'alta', link: '/conflitos/impedimentos',
      },
    });
  }
}
