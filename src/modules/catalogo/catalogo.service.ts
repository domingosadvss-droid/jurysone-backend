/**
 * JURYSONE — Etapa B: catálogo de serviços
 *
 *   • Cada serviço: preço SUGERIDO, documentos, perguntas da triagem, orientações e respostas frequentes.
 *   • Toda alteração gera versão (a anterior fica no histórico).
 *   • Sugestões (da IA, ao aprender nas conversas, ou de usuários) entram numa fila e só valem
 *     depois que um advogado de gestão aprova — pode aprovar como veio, editar ou recusar.
 *   • paraAtendimento(): a visão que a IA do WhatsApp usa — SEM PREÇO (o preço só chega ao
 *     cliente depois que o advogado confirma, decisão de 20/11/2026).
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS_GESTAO, temPerfil } from '../../common/perfis';
import { CATALOGO_PADRAO } from './catalogo-padrao';

const AREAS = ['IMOBILIARIO', 'EMPRESARIAL', 'TRABALHISTA', 'PREVIDENCIARIO', 'FAMILIA', 'CIVEL', 'CONSUMIDOR', 'CRIMINAL', 'TRIBUTARIO', 'OUTRA'];
const TIPOS_HONORARIO = ['FIXO', 'EXITO', 'FIXO_MAIS_EXITO', 'MENSAL', 'POR_ATO'];
const CAMPOS = ['nome', 'area', 'descricao', 'modeloLinhaCodigo', 'responsavelId', 'precoSugerido', 'tipoHonorario', 'percentualExito',
  'documentos', 'perguntas', 'orientacoes', 'faq', 'palavrasChave'] as const;

function slug(t: string) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'SERVICO';
}

const n2 = (v: any) => (v === null || v === undefined ? null : Number(v));

@Injectable()
export class CatalogoService {
  constructor(private readonly prisma: PrismaService) {}

  private gestao(user: any) {
    if (!temPerfil(user, PERFIS_GESTAO)) throw new ForbiddenException('Só advogados de gestão alteram o catálogo.');
  }

  /** Valida e normaliza os campos de um serviço (parcial quando `parcial`) */
  normalizar(dto: any, parcial = false): Record<string, any> {
    const d: Record<string, any> = {};
    const tem = (k: string) => dto && Object.prototype.hasOwnProperty.call(dto, k);
    if (!parcial || tem('nome')) {
      const nome = String(dto?.nome ?? '').trim();
      if (nome.length < 3) throw new BadRequestException('Informe o nome do serviço.');
      d.nome = nome.slice(0, 200);
    }
    if (!parcial || tem('area')) {
      const area = String(dto?.area ?? '').trim().toUpperCase();
      if (!AREAS.includes(area)) throw new BadRequestException(`Área inválida. Use: ${AREAS.join(', ')}`);
      d.area = area;
    }
    if (tem('descricao')) d.descricao = dto.descricao ? String(dto.descricao).slice(0, 4000) : null;
    if (tem('modeloLinhaCodigo')) d.modeloLinhaCodigo = dto.modeloLinhaCodigo ? String(dto.modeloLinhaCodigo).slice(0, 80) : null;
    if (tem('responsavelId')) d.responsavelId = dto.responsavelId || null;
    if (tem('precoSugerido')) {
      const v = dto.precoSugerido === '' || dto.precoSugerido === null ? null : Number(String(dto.precoSugerido).replace(/\./g, '').replace(',', '.'));
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 10_000_000)) throw new BadRequestException('Preço sugerido inválido.');
      d.precoSugerido = v;
    }
    if (tem('tipoHonorario')) {
      const t = dto.tipoHonorario ? String(dto.tipoHonorario).toUpperCase() : null;
      if (t && !TIPOS_HONORARIO.includes(t)) throw new BadRequestException(`Tipo de honorário inválido. Use: ${TIPOS_HONORARIO.join(', ')}`);
      d.tipoHonorario = t;
    }
    if (tem('percentualExito')) {
      const v = dto.percentualExito === '' || dto.percentualExito === null ? null : Number(String(dto.percentualExito).replace(',', '.'));
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 100)) throw new BadRequestException('Percentual de êxito entre 0 e 100.');
      d.percentualExito = v;
    }
    const listaObj = (k: string, campo: string, flag: string) => {
      if (!tem(k)) return;
      if (!Array.isArray(dto[k])) throw new BadRequestException(`"${k}" deve ser uma lista.`);
      // texto simples aceita o prefixo "(opcional)", como na tela
      d[k] = dto[k].map((x: any) => (typeof x === 'string'
        ? { [campo]: x.replace(/^\s*\(opcional\)\s*/i, '').trim(), [flag]: !/^\s*\(opcional\)/i.test(x) }
        : { [campo]: String(x?.[campo] ?? '').trim(), [flag]: x?.[flag] !== false }))
        .filter((x: any) => x[campo]).slice(0, 60).map((x: any) => ({ ...x, [campo]: x[campo].slice(0, 500) }));
    };
    listaObj('documentos', 'texto', 'obrigatorio');
    listaObj('perguntas', 'pergunta', 'obrigatoria');
    if (tem('orientacoes')) d.orientacoes = dto.orientacoes ? String(dto.orientacoes).slice(0, 4000) : null;
    if (tem('faq')) {
      if (!Array.isArray(dto.faq)) throw new BadRequestException('"faq" deve ser uma lista.');
      d.faq = dto.faq.map((x: any) => ({ pergunta: String(x?.pergunta ?? '').trim().slice(0, 500), resposta: String(x?.resposta ?? '').trim().slice(0, 2000) }))
        .filter((x: any) => x.pergunta && x.resposta).slice(0, 60);
    }
    if (tem('palavrasChave')) {
      d.palavrasChave = (Array.isArray(dto.palavrasChave) ? dto.palavrasChave : String(dto.palavrasChave ?? '').split(','))
        .map((x: any) => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 40);
    }
    return d;
  }

  private publico(s: any) {
    return { ...s, precoSugerido: n2(s.precoSugerido), percentualExito: n2(s.percentualExito) };
  }

  private retrato(s: any) {
    const r: Record<string, any> = {};
    for (const k of CAMPOS) r[k] = k === 'precoSugerido' || k === 'percentualExito' ? n2(s[k]) : s[k];
    r.status = s.status;
    return r;
  }

  // ═══════════════════════ LEITURA ════════════════════════════════════════

  async listar(user: any, q: any = {}) {
    const where: any = { escritorioId: user.officeId };
    if (q?.status && q.status !== 'TODOS') where.status = String(q.status).toUpperCase();
    else if (!q?.status) where.status = 'ATIVO';
    if (q?.area) where.area = String(q.area).toUpperCase();
    const lista = await this.prisma.servicoCatalogo.findMany({ where, orderBy: [{ area: 'asc' }, { nome: 'asc' }] });
    const usuarios = await this.prisma.usuario.findMany({ where: { escritorioId: user.officeId }, select: { id: true, nome: true } });
    const nome = new Map(usuarios.map((u) => [u.id, u.nome]));
    const pendentes = await this.prisma.sugestaoCatalogo.count({ where: { escritorioId: user.officeId, status: 'PENDENTE' } });
    return {
      servicos: lista.map((s) => ({ ...this.publico(s), responsavelNome: s.responsavelId ? nome.get(s.responsavelId) ?? null : null, semPreco: s.precoSugerido === null })),
      sugestoesPendentes: pendentes,
    };
  }

  async detalhe(user: any, id: string) {
    const s = await this.prisma.servicoCatalogo.findFirst({
      where: { id, escritorioId: user.officeId }, include: { versoes: { orderBy: { versao: 'desc' } } },
    });
    if (!s) throw new NotFoundException('Serviço não encontrado');
    return this.publico(s);
  }

  /**
   * O catálogo como a IA do atendimento vê: só serviços ATIVOS e SEM PREÇO.
   * (o preço sugerido nunca sai daqui — o advogado confirma o valor de cada caso)
   */
  async paraAtendimento(escritorioId: string) {
    const lista = await this.prisma.servicoCatalogo.findMany({ where: { escritorioId, status: 'ATIVO' }, orderBy: { nome: 'asc' } });
    return lista.map((s) => ({
      id: s.id, codigo: s.codigo, nome: s.nome, area: s.area, descricao: s.descricao, responsavelId: s.responsavelId,
      documentos: s.documentos, perguntas: s.perguntas, orientacoes: s.orientacoes, faq: s.faq, palavrasChave: s.palavrasChave,
    }));
  }

  // ═══════════════════════ ESCRITA ════════════════════════════════════════

  async criar(user: any, dto: any, origem = 'MANUAL') {
    this.gestao(user);
    const d = this.normalizar(dto);
    const escritorioId = user.officeId;
    if (d.responsavelId) await this.conferirUsuario(escritorioId, d.responsavelId);
    let codigo = dto?.codigo ? slug(dto.codigo) : slug(d.nome);
    for (let i = 2; await this.prisma.servicoCatalogo.findUnique({ where: { escritorioId_codigo: { escritorioId, codigo } } }); i++) codigo = `${slug(dto?.codigo || d.nome).slice(0, 55)}_${i}`;
    const s = await this.prisma.servicoCatalogo.create({
      data: { escritorioId, codigo, ...(d as any), origem, status: 'ATIVO', aprovadoPorId: user.id, aprovadoEm: new Date() },
    });
    return this.publico(s);
  }

  async alterar(user: any, id: string, dto: any, motivo?: string) {
    this.gestao(user);
    const atual = await this.prisma.servicoCatalogo.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!atual) throw new NotFoundException('Serviço não encontrado');
    const d = this.normalizar(dto, true);
    if (!Object.keys(d).length) throw new BadRequestException('Nada para alterar.');
    if (d.responsavelId) await this.conferirUsuario(user.officeId, d.responsavelId);
    await this.prisma.servicoCatalogoVersao.create({
      data: { servicoId: id, versao: atual.versao, dados: this.retrato(atual) as any, alteradoPorId: user.id, motivo: motivo ?? dto?.motivo ?? null },
    });
    const s = await this.prisma.servicoCatalogo.update({
      where: { id }, data: { ...(d as any), versao: atual.versao + 1, aprovadoPorId: user.id, aprovadoEm: new Date() },
    });
    return this.publico(s);
  }

  async definirStatus(user: any, id: string, status: 'ATIVO' | 'INATIVO') {
    this.gestao(user);
    const atual = await this.prisma.servicoCatalogo.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!atual) throw new NotFoundException('Serviço não encontrado');
    return this.publico(await this.prisma.servicoCatalogo.update({ where: { id }, data: { status } }));
  }

  private async conferirUsuario(escritorioId: string, usuarioId: string) {
    const u = await this.prisma.usuario.findFirst({ where: { id: usuarioId, escritorioId } });
    if (!u) throw new BadRequestException('Responsável não é da equipe do escritório.');
  }

  /** Carga inicial: os 8 serviços da linha de produção, sem preço (não duplica) */
  async cargaInicial(user: any) {
    this.gestao(user);
    let novos = 0;
    for (const p of CATALOGO_PADRAO) {
      const ja = await this.prisma.servicoCatalogo.findUnique({ where: { escritorioId_codigo: { escritorioId: user.officeId, codigo: p.codigo } } });
      if (ja) continue;
      await this.prisma.servicoCatalogo.create({
        data: {
          escritorioId: user.officeId, codigo: p.codigo, nome: p.nome, area: p.area, descricao: p.descricao, modeloLinhaCodigo: p.modeloLinhaCodigo,
          tipoHonorario: p.tipoHonorario, percentualExito: p.percentualExito ?? null, precoSugerido: null,
          documentos: p.documentos as any, perguntas: p.perguntas as any, orientacoes: p.orientacoes, faq: p.faq as any, palavrasChave: p.palavrasChave,
          origem: 'PADRAO', status: 'ATIVO', aprovadoPorId: user.id, aprovadoEm: new Date(),
        },
      });
      novos++;
    }
    return { novos, existentes: CATALOGO_PADRAO.length - novos };
  }

  // ═══════════════════════ SUGESTÕES (fila de aprovação) ══════════════════

  /**
   * Registra uma sugestão. Usado pela IA do atendimento (etapa C) e pela tela.
   * NOVO_SERVICO: `dados` é o serviço inteiro; AJUSTE: `dados` só com os campos a mudar.
   */
  async sugerir(escritorioId: string, s: {
    tipo: 'NOVO_SERVICO' | 'AJUSTE'; servicoId?: string | null; dados: any; justificativa?: string | null;
    origem?: 'IA' | 'USUARIO'; conversaId?: string | null; atendimentoId?: string | null; criadoPorId?: string | null;
  }) {
    if (!['NOVO_SERVICO', 'AJUSTE'].includes(s.tipo)) throw new BadRequestException('Tipo de sugestão inválido.');
    let dados: Record<string, any>;
    if (s.tipo === 'AJUSTE') {
      if (!s.servicoId) throw new BadRequestException('Ajuste precisa do serviço.');
      const alvo = await this.prisma.servicoCatalogo.findFirst({ where: { id: s.servicoId, escritorioId } });
      if (!alvo) throw new NotFoundException('Serviço não encontrado');
      dados = this.normalizar(s.dados, true);
      if (!Object.keys(dados).length) throw new BadRequestException('A sugestão não muda nada.');
    } else {
      dados = this.normalizar(s.dados);
    }
    const sug = await this.prisma.sugestaoCatalogo.create({
      data: {
        escritorioId, tipo: s.tipo, servicoId: s.servicoId ?? null, dados: dados as any, justificativa: s.justificativa?.slice(0, 4000) ?? null,
        origem: s.origem ?? 'IA', conversaId: s.conversaId ?? null, atendimentoId: s.atendimentoId ?? null, criadoPorId: s.criadoPorId ?? null,
      },
    });
    await this.avisarGestores(escritorioId, s.tipo === 'NOVO_SERVICO'
      ? { titulo: 'Novo serviço sugerido para o catálogo', mensagem: `"${dados.nome}" (${dados.area}) aguarda sua aprovação.${s.justificativa ? ` Motivo: ${s.justificativa.slice(0, 200)}` : ''}` }
      : { titulo: 'Ajuste sugerido no catálogo', mensagem: `Há uma sugestão de ajuste aguardando sua aprovação.${s.justificativa ? ` Motivo: ${s.justificativa.slice(0, 200)}` : ''}` });
    return sug;
  }

  private async avisarGestores(escritorioId: string, n: { titulo: string; mensagem: string }) {
    const usuarios = await this.prisma.usuario.findMany({ where: { escritorioId, ativo: true }, select: { id: true, roles: true } });
    for (const u of usuarios.filter((x) => temPerfil({ roles: x.roles }, PERFIS_GESTAO))) {
      await this.prisma.notificacao.create({
        data: { escritorioId, usuarioId: u.id, tipo: 'CATALOGO_SUGESTAO', titulo: n.titulo, mensagem: n.mensagem.slice(0, 1000), link: '/catalogo/sugestoes', prioridade: 'normal' },
      });
    }
  }

  async listarSugestoes(user: any, q: any = {}) {
    this.gestao(user);
    const where: any = { escritorioId: user.officeId };
    where.status = q?.status ? String(q.status).toUpperCase() : 'PENDENTE';
    if (where.status === 'TODAS') delete where.status;
    const lista = await this.prisma.sugestaoCatalogo.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
    const ids = lista.map((s) => s.servicoId).filter(Boolean) as string[];
    const servicos = await this.prisma.servicoCatalogo.findMany({ where: { id: { in: ids } } });
    const por = new Map(servicos.map((s) => [s.id, s]));
    return lista.map((s) => {
      const alvo = s.servicoId ? por.get(s.servicoId) : null;
      return {
        ...s,
        servicoNome: alvo?.nome ?? null,
        // no ajuste, mostra o "antes" de cada campo que muda
        antes: alvo ? Object.fromEntries(Object.keys(s.dados as any).map((k) => [k, (this.retrato(alvo) as any)[k] ?? null])) : null,
      };
    });
  }

  /** Aprova a sugestão — `dto.dados` (opcional) é a versão editada pelo advogado antes de aprovar */
  async aprovarSugestao(user: any, id: string, dto: any = {}) {
    this.gestao(user);
    const s = await this.prisma.sugestaoCatalogo.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!s) throw new NotFoundException('Sugestão não encontrada');
    if (s.status !== 'PENDENTE') throw new BadRequestException('Esta sugestão já foi decidida.');
    const editada = dto?.dados && typeof dto.dados === 'object';
    const dados = editada ? { ...(s.dados as any), ...dto.dados } : (s.dados as any);
    let servico;
    if (s.tipo === 'NOVO_SERVICO') {
      servico = await this.criar(user, dados, s.origem === 'IA' ? 'IA' : 'MANUAL');
    } else {
      servico = await this.alterar(user, s.servicoId!, dados, `Sugestão ${s.origem === 'IA' ? 'da IA' : 'de usuário'} aprovada${editada ? ' com edição' : ''}`);
    }
    await this.prisma.sugestaoCatalogo.update({
      where: { id }, data: { status: 'APROVADA', decididoPorId: user.id, decididoEm: new Date(), motivoDecisao: editada ? 'aprovada com edição' : (dto?.motivo ?? null), dados: dados as any },
    });
    return { sugestao: id, servico };
  }

  async recusarSugestao(user: any, id: string, dto: any = {}) {
    this.gestao(user);
    const s = await this.prisma.sugestaoCatalogo.findFirst({ where: { id, escritorioId: user.officeId } });
    if (!s) throw new NotFoundException('Sugestão não encontrada');
    if (s.status !== 'PENDENTE') throw new BadRequestException('Esta sugestão já foi decidida.');
    return this.prisma.sugestaoCatalogo.update({
      where: { id }, data: { status: 'RECUSADA', decididoPorId: user.id, decididoEm: new Date(), motivoDecisao: dto?.motivo ? String(dto.motivo).slice(0, 1000) : null },
    });
  }
}
