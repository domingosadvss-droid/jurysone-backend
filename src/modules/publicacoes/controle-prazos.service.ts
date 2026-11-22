/**
 * JURYSONE — Controle de prazos no formato da planilha "Controle de Prazos – Domingos Advocacia"
 *
 *   • painel(): a mesma visão da aba Prazos (publicação, início, fatal, alertas D-5/D-3/D-1 e situação),
 *     sempre calculada pelo calendário do tribunal de cada processo.
 *   • importarCalendarioPadrao(): carrega o calendário por tribunal da planilha (calendario-padrao.ts).
 *   • recalcularAbertos(): refaz os prazos em aberto quando o calendário muda (nunca mexe no que o
 *     advogado ajustou à mão nem no vencimento fixado pela importação).
 *   • importarPlanilha(): lê o .xlsx exportado do Google Planilhas (abas Feriados, Prazos e
 *     Audiências e sessões) sem duplicar: prazos do DJEN pelo ID DJEN, os manuais por processo + data + texto.
 *
 * Regra de segurança herdada da planilha: na dúvida, vale a data MAIS CEDO, marcada "conferir".
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PERFIS_GESTAO, temPerfil } from '../../common/perfis';
import { AgendaPrazosService, diaLocal, fimDoDia, PRAZO_PADRAO_DIAS } from './agenda-prazos.service';
import { AvisosService } from './avisos.service';
import { Calendario, Contagem, contarPrazo, formatarBr, iso, somarDias } from './calendario';
import { CALENDARIO_PADRAO } from './calendario-padrao';
import { mascararCnj, numeroCnj, tribunalDoNumero } from './analise';
import { criarClienteIncompleto, procurarCliente } from './clientes-vinculo';

const MARCAS_FIXO = ['ajustado manualmente', 'fixado pela importação'];

function hojeBrasilia(): string {
  return diaLocal(new Date());
}

function normalizar(t?: string | null) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Volta n dias que contam (úteis e não suspensos) a partir de `dia` — como WORKDAY(dia; -n; feriados) */
export function voltarDiasQueContam(cal: Calendario, dia: string, n: number): string {
  let d = dia;
  let faltam = n;
  for (let g = 0; g < 400 && faltam > 0; g++) {
    d = somarDias(d, -1);
    if (cal.ehDiaUtil(d) && !cal.prazoSuspenso(d)) faltam--;
  }
  return d;
}

/** Dias que contam depois de hoje até o vencimento (inclusive) — como NETWORKDAYS(hoje; fatal; feriados) - 1 */
export function diasQueContamAte(cal: Calendario, hoje: string, fatal: string): number {
  let n = 0;
  for (let d = somarDias(hoje, 1), g = 0; d <= fatal && g < 800; d = somarDias(d, 1), g++) {
    if (cal.ehDiaUtil(d) && !cal.prazoSuspenso(d)) n++;
  }
  return n;
}

export function situacaoDoPrazo(cal: Calendario, hoje: string, fatal: string, cumprido: boolean): { codigo: string; texto: string; diasRestantes: number | null } {
  if (cumprido) return { codigo: 'CUMPRIDO', texto: '✅ Cumprido', diasRestantes: null };
  if (fatal < hoje) return { codigo: 'VENCIDO', texto: '⚫ Vencido', diasRestantes: null };
  if (fatal === hoje) return { codigo: 'VENCE_HOJE', texto: '🔴 Vence hoje', diasRestantes: 0 };
  const n = diasQueContamAte(cal, hoje, fatal);
  if (n <= 3) return { codigo: 'URGENTE', texto: '🔴 Urgente', diasRestantes: n };
  if (n <= 5) return { codigo: 'ATENCAO', texto: '🟡 Atenção', diasRestantes: n };
  return { codigo: 'NO_PRAZO', texto: '🟢 No prazo', diasRestantes: n };
}

// ── leitura do .xlsx ─────────────────────────────────────────────────────────

function valorCelula(cell: any): any {
  let v = cell?.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if ('richText' in v) v = (v.richText as any[]).map((r) => r.text).join('');
    else if ('text' in v) v = v.text;
    else if ('hyperlink' in v) v = v.hyperlink;
  }
  return v ?? null;
}

function linkCelula(cell: any): string | null {
  const v = cell?.value;
  if (v && typeof v === 'object') {
    if (v.hyperlink) return String(v.hyperlink);
    if (Array.isArray(v.richText)) {
      const r = v.richText.find((x: any) => x?.hyperlink);
      if (r) return String(r.hyperlink);
    }
  }
  return cell?.hyperlink ? String(cell.hyperlink) : null;
}

/** Data da planilha → 'AAAA-MM-DD' (aceita Date, número de série do Excel e 'dd/mm/aaaa') */
export function dataDaCelula(v: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  // o ExcelJS devolve a data da célula em UTC (meia-noite ou meio-dia do próprio dia)
  if (v instanceof Date && !isNaN(v.getTime())) return iso(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return iso(new Date(Math.round((v - 25569) * 86400000) + 12 * 3600_000));
  const s = String(v).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function texto(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return iso(v);
  return String(v).trim();
}

interface LinhaPrazoPlanilha {
  linha: number; id: string; disponibilizacao: string | null; processo: string; tribunal: string; orgao: string; cliente: string;
  oQueFazer: string; tipo: string; dias: number | null; contagem: Contagem; fatal: string | null; responsavel: string;
  conferir: boolean; cumpridoEm: string | null; cumpridoPor: string; observacoes: string; link: string | null;
}

@Injectable()
export class ControlePrazosService {
  private readonly logger = new Logger(ControlePrazosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agenda: AgendaPrazosService,
    private readonly avisos: AvisosService,
  ) {}

  private async cal(escritorioId: string, tribunal: string | null | undefined, comarca?: string | null) {
    const ano = Number(hojeBrasilia().slice(0, 4));
    return this.agenda.calendario(escritorioId, { tribunal, comarca }, [ano - 1, ano, ano + 1]);
  }

  // ═══════════════════════ CALENDÁRIO ═════════════════════════════════════

  /** Carrega o calendário padrão por tribunal (sem duplicar) e recalcula os prazos em aberto */
  async importarCalendarioPadrao(escritorioId: string, user: any) {
    const r = await this.gravarFeriados(escritorioId, user?.id ?? null, CALENDARIO_PADRAO.map((l) => ({
      data: l.data, dataFim: l.dataFim ?? null, descricao: `${l.descricao} (${l.fonte})`, tribunal: l.tribunal, tipo: l.tipo,
    })));
    const recalculo = await this.recalcularAbertos(escritorioId, 'calendário padrão por tribunal aplicado');
    return { feriados: r, recalculo };
  }

  private async gravarFeriados(escritorioId: string, usuarioId: string | null, linhas: Array<{ data: string; dataFim: string | null; descricao: string; tribunal: string | null; tipo: string }>) {
    const existentes = await this.prisma.feriadoCalendario.findMany({ where: { escritorioId } });
    const chave = (d: string, f: string | null, t: string | null, tipo: string) => `${d}|${f ?? d}|${(t ?? '').toUpperCase()}|${tipo}`;
    const ja = new Set(existentes.map((f) => chave(iso(f.data), f.dataFim ? iso(f.dataFim) : null, f.tribunal, f.tipo)));
    let novos = 0;
    for (const l of linhas) {
      const k = chave(l.data, l.dataFim, l.tribunal, l.tipo);
      if (ja.has(k)) continue;
      await this.prisma.feriadoCalendario.create({
        data: {
          escritorioId, tipo: l.tipo, data: new Date(`${l.data}T00:00:00Z`), dataFim: l.dataFim ? new Date(`${l.dataFim}T00:00:00Z`) : null,
          tribunal: l.tribunal ? l.tribunal.toUpperCase() : null, comarca: null, descricao: l.descricao.slice(0, 300), criadoPorId: usuarioId,
        },
      });
      ja.add(k);
      novos++;
    }
    return { novos, existentes: linhas.length - novos };
  }

  // ═══════════════════════ RECÁLCULO ══════════════════════════════════════

  /**
   * Refaz os prazos em aberto pelo calendário atual. Não mexe em prazo ajustado à mão nem no
   * vencimento fixado pela importação da planilha. Avisa no sino cada responsável quando a data muda.
   */
  async recalcularAbertos(escritorioId: string, motivo: string) {
    const prazos = await this.prisma.prazo.findMany({
      where: { escritorioId, deletedAt: null, status: 'pendente', diasPrazo: { not: null }, contagem: { not: null } },
      include: { processo: { select: { numero: true, tribunal: true, camposCustom: true } } },
    });
    const intimacoes = await this.prisma.intimacao.findMany({
      where: { id: { in: prazos.map((p) => p.intimacaoId).filter(Boolean) as string[] } },
      select: { id: true, tribunal: true, dataPublicacao: true },
    });
    const intim = new Map(intimacoes.map((i) => [i.id, i]));
    const alterados: any[] = [];
    let mantidos = 0;
    for (const p of prazos) {
      const memoria = ((p.memoriaCalculo as any) ?? []) as string[];
      if (memoria.some((m) => MARCAS_FIXO.some((x) => normalizar(m).includes(normalizar(x))))) { mantidos++; continue; }
      const i = p.intimacaoId ? intim.get(p.intimacaoId) : null;
      const disp = i ? diaLocal(i.dataPublicacao) : this.disponibilizacaoDaMemoria(memoria);
      if (!disp) { mantidos++; continue; }
      const tribunal = this.tribunalUtil(i?.tribunal) ?? p.processo?.tribunal ?? tribunalDoNumero(p.processo?.numero);
      const comarca = (p.processo?.camposCustom as any)?.comarca ?? null;
      const ano = Number(disp.slice(0, 4));
      const cal = await this.agenda.calendario(escritorioId, { tribunal, comarca }, [ano, ano + 1]);
      const penal = p.contagem === 'CORRIDOS';
      const r = contarPrazo({ disponibilizacao: disp, dias: p.diasPrazo!, contagem: p.contagem as Contagem, calendario: cal, penal });
      const antes = diaLocal(p.dataPrazo);
      if (r.vencimento === antes) { mantidos++; continue; }
      // mantém as anotações que não são do cálculo (provisório, responsável, observações, recálculos anteriores)
      const doCalculo = /^(Disponibilizada no DJEN|Publicação considerada|Contagem em|Dias não contados|O dia seguinte à publicação|Vencimento em )/;
      const anotacoes = memoria.filter((m) => !doCalculo.test(m));
      const nova = [...r.memoria, ...anotacoes, `Recalculado em ${formatarBr(hojeBrasilia())} (${motivo}): vencimento passou de ${formatarBr(antes)} para ${formatarBr(r.vencimento)}.`];
      await this.prisma.prazo.update({ where: { id: p.id }, data: { dataPrazo: fimDoDia(r.vencimento), dataInicio: fimDoDia(r.inicio), memoriaCalculo: nova as any } });
      if (p.eventoId) {
        await this.prisma.evento.updateMany({ where: { id: p.eventoId, escritorioId }, data: { data: fimDoDia(r.vencimento), descricao: nova.join('\n') } });
        await this.agenda.enviarAoGoogle(p.eventoId).catch(() => undefined);
      }
      for (const u of p.responsaveisIds) {
        await this.avisos.sino(escritorioId, u, 'PRAZO_RECALCULADO', 'Prazo recalculado pelo calendário do tribunal',
          `Processo ${p.processo?.numero ?? ''}: ${p.descricao.slice(0, 120)} — vencimento passou de ${formatarBr(antes)} para ${formatarBr(r.vencimento)}.`,
          '/controle-prazos', r.vencimento < antes ? 'alta' : 'normal');
      }
      alterados.push({ prazoId: p.id, processo: p.processo?.numero ?? null, antes, depois: r.vencimento });
    }
    return { analisados: prazos.length, alterados, mantidos };
  }

  private disponibilizacaoDaMemoria(memoria: string[]): string | null {
    for (const m of memoria) {
      const x = /Disponibilizada no DJEN em (\d{2})\/(\d{2})\/(\d{4})/.exec(m);
      if (x) return `${x[3]}-${x[2]}-${x[1]}`;
    }
    return null;
  }

  /** O DJEN às vezes grava "DJEN" no lugar do tribunal: aí vale o tribunal do processo */
  private tribunalUtil(t?: string | null): string | null {
    const s = String(t ?? '').trim();
    if (!s || /^DJEN/i.test(s)) return null;
    return s.toUpperCase();
  }

  // ═══════════════════════ PAINEL ═════════════════════════════════════════

  async painel(user: any, q: any = {}) {
    const escritorioId = user.officeId ?? user.escritorioId;
    const filtro = String(q?.filtro ?? 'abertos');
    const where: any = { escritorioId, deletedAt: null, status: { not: 'cancelado' } };
    if (filtro === 'abertos') where.status = 'pendente';
    if (filtro === 'cumpridos') where.status = 'cumprido';
    if (filtro === 'conferir') { where.status = 'pendente'; where.conferir = true; }
    if (!temPerfil(user, PERFIS_GESTAO)) where.responsaveisIds = { has: user.id };
    const prazos = await this.prisma.prazo.findMany({
      where, orderBy: { dataPrazo: 'asc' }, take: 1000,
      include: { processo: { select: { id: true, numero: true, tribunal: true, camposCustom: true, cliente: { select: { nome: true } } } } },
    });
    const intimacoes = await this.prisma.intimacao.findMany({
      where: { id: { in: prazos.map((p) => p.intimacaoId).filter(Boolean) as string[] } },
      select: { id: true, djenId: true, tribunal: true, orgao: true, dataPublicacao: true, urlOrigem: true },
    });
    const intim = new Map(intimacoes.map((i) => [i.id, i]));
    const usuarios = await this.prisma.usuario.findMany({ where: { escritorioId }, select: { id: true, nome: true } });
    const nomeDe = new Map(usuarios.map((u) => [u.id, u.nome]));
    const hoje = hojeBrasilia();
    const cache = new Map<string, Calendario>();
    const linhas = [];
    const contagem: Record<string, number> = { VENCIDO: 0, VENCE_HOJE: 0, URGENTE: 0, ATENCAO: 0, NO_PRAZO: 0, CUMPRIDO: 0, CONFERIR: 0 };
    for (const p of prazos) {
      const i = p.intimacaoId ? intim.get(p.intimacaoId) : null;
      const tribunal = this.tribunalUtil(i?.tribunal) ?? p.processo?.tribunal ?? tribunalDoNumero(p.processo?.numero) ?? null;
      const comarca = (p.processo?.camposCustom as any)?.comarca ?? null;
      const k = `${tribunal}|${comarca}`;
      if (!cache.has(k)) cache.set(k, await this.cal(escritorioId, tribunal, comarca));
      const cal = cache.get(k)!;
      const fatal = diaLocal(p.dataPrazo);
      const disp = i ? diaLocal(i.dataPublicacao) : this.disponibilizacaoDaMemoria(((p.memoriaCalculo as any) ?? []) as string[]);
      const publicacao = disp ? cal.proximoDiaUtil(somarDias(disp, 1)) : null;
      const sit = situacaoDoPrazo(cal, hoje, fatal, p.status === 'cumprido');
      contagem[sit.codigo] = (contagem[sit.codigo] ?? 0) + 1;
      if (p.conferir && p.status === 'pendente') contagem.CONFERIR++;
      linhas.push({
        id: p.id,
        idDjen: i?.djenId ?? null,
        disponibilizacao: disp,
        publicacao,
        processoId: p.processo?.id ?? null,
        processo: p.processo?.numero ?? null,
        tribunal,
        orgao: i?.orgao ?? (p.processo?.camposCustom as any)?.orgao ?? null,
        cliente: p.processo?.cliente?.nome ?? null,
        oQueFazer: p.descricao,
        dias: p.diasPrazo,
        contagem: p.contagem === 'CORRIDOS' ? 'Corridos' : 'Úteis',
        inicio: p.dataInicio ? diaLocal(p.dataInicio) : null,
        fatal,
        alertaD5: voltarDiasQueContam(cal, fatal, 5),
        alertaD3: voltarDiasQueContam(cal, fatal, 3),
        alertaD1: voltarDiasQueContam(cal, fatal, 1),
        situacao: sit.texto,
        situacaoCodigo: sit.codigo,
        diasRestantes: sit.diasRestantes,
        responsaveis: p.responsaveisIds.map((u) => nomeDe.get(u) ?? '—'),
        responsaveisIds: p.responsaveisIds,
        conferir: p.conferir,
        cumpridoEm: p.cumpridoEm ? diaLocal(p.cumpridoEm) : null,
        cumpridoPor: p.cumpridoPorId ? nomeDe.get(p.cumpridoPorId) ?? null : null,
        origem: p.origem,
        link: i?.urlOrigem ?? null,
        memoria: (p.memoriaCalculo as any) ?? [],
      });
    }
    return { hoje, filtro, resumo: contagem, prazos: linhas };
  }

  // ═══════════════════════ IMPORTAÇÃO DA PLANILHA ═════════════════════════

  async importarPlanilha(user: any, arquivo: { buffer: Buffer; originalname?: string } | undefined) {
    const escritorioId = user.officeId ?? user.escritorioId;
    if (!arquivo?.buffer?.length) throw new BadRequestException('Envie o arquivo .xlsx da planilha (campo "arquivo").');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(arquivo.buffer); } catch { throw new BadRequestException('Não consegui ler o arquivo. Exporte a planilha do Google como .xlsx (Arquivo → Fazer download → Microsoft Excel).'); }
    const abaPrazos = wb.getWorksheet('Prazos');
    if (!abaPrazos) throw new BadRequestException('A planilha não tem a aba "Prazos".');

    const relatorio: any = {
      feriados: { novos: 0, existentes: 0 },
      prazos: { novos: 0, jaExistiam: 0, cumpridos: 0, divergencias: [] as any[], ignorados: [] as any[] },
      audiencias: { novas: 0, jaExistiam: 0 },
      processosCriados: 0, clientesCriados: 0, avisos: [] as string[],
    };

    // 1) Feriados primeiro: o cálculo dos prazos depende deles
    const abaFeriados = wb.getWorksheet('Feriados');
    if (abaFeriados) {
      const linhas: any[] = [];
      abaFeriados.eachRow((row: any, n: number) => {
        if (n === 1) return;
        const data = dataDaCelula(valorCelula(row.getCell(1)));
        const motivo = texto(valorCelula(row.getCell(2)));
        if (!data || !motivo) return;
        const trib = texto(valorCelula(row.getCell(3)));
        const efeito = normalizar(texto(valorCelula(row.getCell(4))));
        const fonte = texto(valorCelula(row.getCell(5)));
        linhas.push({
          data, dataFim: null, descricao: fonte ? `${motivo} (${fonte})` : motivo,
          tribunal: !trib || normalizar(trib) === 'todos' ? null : trib.toUpperCase(),
          tipo: efeito.startsWith('so suspende') ? 'SUSPENSAO_PRAZO' : 'FORENSE',
        });
      });
      relatorio.feriados = await this.gravarFeriados(escritorioId, user.id, linhas);
    }

    // 2) Prazos
    const usuarios = await this.prisma.usuario.findMany({ where: { escritorioId, ativo: true }, select: { id: true, nome: true } });
    const linhasPrazo: LinhaPrazoPlanilha[] = [];
    abaPrazos.eachRow((row: any, n: number) => {
      if (n === 1) return;
      const v = (c: number) => valorCelula(row.getCell(c));
      const processo = texto(v(4));
      if (!processo) return;
      const diasTxt = texto(v(10));
      const dias = diasTxt && Number.isFinite(Number(diasTxt.replace(',', '.'))) ? Math.round(Number(diasTxt.replace(',', '.'))) : null;
      linhasPrazo.push({
        linha: n, id: texto(v(1)).replace(/\.0+$/, ''), disponibilizacao: dataDaCelula(v(2)), processo, tribunal: texto(v(5)).toUpperCase(),
        orgao: texto(v(6)), cliente: texto(v(7)), oQueFazer: texto(v(8)), tipo: texto(v(9)) || 'Prazo', dias,
        contagem: normalizar(texto(v(11))).startsWith('corrid') ? 'CORRIDOS' : 'UTEIS', fatal: dataDaCelula(v(13)),
        responsavel: texto(v(18)), conferir: normalizar(texto(v(19))) === 'sim', cumpridoEm: dataDaCelula(v(20)), cumpridoPor: texto(v(21)),
        observacoes: texto(v(22)), link: linkCelula(row.getCell(23)),
      });
    });

    for (const l of linhasPrazo) {
      try {
        await this.importarLinhaPrazo(escritorioId, user, usuarios, l, relatorio);
      } catch (e: any) {
        relatorio.prazos.ignorados.push({ linha: l.linha, processo: l.processo, motivo: `erro: ${String(e?.message ?? e).slice(0, 200)}` });
      }
    }

    // 3) Audiências e sessões
    const abaAud = wb.getWorksheet('Audiências e sessões');
    if (abaAud) {
      const rows: any[] = [];
      abaAud.eachRow((row: any, n: number) => { if (n > 1) rows.push(row); });
      for (const row of rows) {
        const v = (c: number) => valorCelula(row.getCell(c));
        const data = dataDaCelula(v(1));
        const proc = texto(v(4));
        if (!data || !proc) continue;
        const horaTxt = texto(v(2)).replace('h', ':');
        const hora = /^\d{1,2}:\d{2}/.test(horaTxt) ? horaTxt.padStart(5, '0').slice(0, 5) : null;
        const processo = await this.processoDe(escritorioId, user, proc, null, texto(v(5)), texto(v(6)), relatorio);
        const ini = new Date(`${data}T00:00:00-03:00`), fim = new Date(`${data}T23:59:59-03:00`);
        const ja = await this.prisma.evento.findFirst({ where: { escritorioId, tipo: 'AUDIENCIA', processoId: processo.id, data: { gte: ini, lte: fim } } });
        if (ja) { relatorio.audiencias.jaExistiam++; continue; }
        const resp = this.responsaveisDe(usuarios, texto(v(8)), user.id);
        await this.agenda.criarAudiencia({
          escritorioId, processoId: processo.id, clienteId: processo.clienteId, responsaveisIds: resp.ids,
          data, hora, virtual: /virtual|video|teams|zoom|meet/i.test(texto(v(7))) || /virtual/i.test(texto(v(3))),
          descricao: [`${texto(v(3)) || 'Audiência'} — ${texto(v(5))}`, texto(v(7)) && `Local/link: ${texto(v(7))}`,
            texto(v(9)) && `Providências: ${texto(v(9))}`, 'Importado da planilha de prazos.'].filter(Boolean).join('\n'),
          criadoPorId: user.id,
        });
        relatorio.audiencias.novas++;
      }
    }

    // 4) Prazos que já existiam no programa e não vieram da planilha: refaz pelo calendário novo
    relatorio.recalculo = await this.recalcularAbertos(escritorioId, 'calendário importado da planilha');
    return relatorio;
  }

  private responsaveisDe(usuarios: { id: string; nome: string }[], txt: string, padrao: string) {
    const nomes = txt.split(/\s+e\s+|,|;|\//i).map((s) => normalizar(s)).filter(Boolean);
    const ids: string[] = [];
    const naoAchados: string[] = [];
    for (const n of nomes) {
      const u = usuarios.find((x) => normalizar(x.nome).split(/\s+/)[0] === n.split(/\s+/)[0]);
      if (u) ids.push(u.id); else naoAchados.push(n);
    }
    if (!ids.length) ids.push(padrao);
    return { ids: [...new Set(ids)], naoAchados };
  }

  private async processoDe(escritorioId: string, user: any, numeroTxt: string, tribunal: string | null, orgao: string, clienteTxt: string, relatorio: any) {
    const digitos = numeroCnj(numeroTxt);
    const numero = digitos ? mascararCnj(digitos) : numeroTxt.trim();
    const existente = await this.prisma.processo.findFirst({
      where: { escritorioId, deletedAt: null, numero: { in: [numero, digitos ?? numero, numeroTxt.trim()] } },
      select: { id: true, clienteId: true, tribunal: true, numero: true, camposCustom: true },
    });
    if (existente) return existente;
    const semNome = !clienteTxt || /sigilos|^conferir/i.test(clienteTxt);
    const nome = semNome ? `Cliente do processo ${numero}` : clienteTxt.replace(/\s*\(.*$/, '').trim();
    let clienteId: string | null = null;
    if (!semNome) {
      const busca = await procurarCliente(this.prisma, escritorioId, nome, orgao);
      if (busca.tipo === 'VINCULADO') clienteId = busca.clienteId;
      else if (busca.tipo === 'CONFIRMAR' && busca.candidatos.length === 1) clienteId = busca.candidatos[0].id;
      else if (busca.tipo === 'CONFIRMAR') relatorio.avisos.push(`Processo ${numero}: há mais de um cliente chamado "${nome}"; foi criado um cadastro novo — conferir.`);
    }
    if (!clienteId) {
      const c = await criarClienteIncompleto(this.prisma, escritorioId, { nome, origem: 'PLANILHA_PRAZOS', observacao: `Criado na importação da planilha de prazos. Texto da planilha: ${clienteTxt}`.slice(0, 500) });
      clienteId = c.id;
      relatorio.clientesCriados++;
    }
    const trib = tribunal || tribunalDoNumero(numero);
    const criado = await this.prisma.processo.create({
      data: {
        escritorioId, numero, tribunal: trib, titulo: `Processo ${numero} — ${nome}`.slice(0, 250), clienteId, responsavelId: user.id,
        camposCustom: { importado: 'PLANILHA_PRAZOS', orgao: orgao || null } as any,
      },
      select: { id: true, clienteId: true, tribunal: true, numero: true, camposCustom: true },
    });
    relatorio.processosCriados++;
    return criado;
  }

  private async importarLinhaPrazo(escritorioId: string, user: any, usuarios: { id: string; nome: string }[], l: LinhaPrazoPlanilha, relatorio: any) {
    if (normalizar(l.tipo) === 'ciencia') { relatorio.prazos.ignorados.push({ linha: l.linha, processo: l.processo, motivo: 'só ciência (sem prazo)' }); return; }
    if (!l.disponibilizacao && !l.fatal) { relatorio.prazos.ignorados.push({ linha: l.linha, processo: l.processo, motivo: 'sem data de disponibilização nem prazo fatal' }); return; }
    const processo = await this.processoDe(escritorioId, user, l.processo, l.tribunal || null, l.orgao, l.cliente, relatorio);
    const tribunal = l.tribunal || processo.tribunal || tribunalDoNumero(processo.numero);
    const idDjen = /^\d+$/.test(l.id) ? l.id : null;

    // já existe? DJEN pelo ID + nº de dias (uma publicação pode gerar mais de um prazo, como na etiqueta
    // [prazo:ID:dias] da planilha); manual por processo + data + texto
    let intimacao = idDjen ? await this.prisma.intimacao.findFirst({ where: { escritorioId, djenId: idDjen } }) : null;
    if (intimacao) {
      const doMesmoId = await this.prisma.prazo.findMany({ where: { escritorioId, intimacaoId: intimacao.id, deletedAt: null } });
      const diasLinha = l.dias ?? PRAZO_PADRAO_DIAS;
      const prazo = doMesmoId.find((x) => x.diasPrazo === diasLinha) ?? (doMesmoId.length === 1 && l.dias === null ? doMesmoId[0] : null);
      if (prazo) {
        relatorio.prazos.jaExistiam++;
        if (l.fatal && l.fatal !== diaLocal(prazo.dataPrazo)) {
          relatorio.prazos.divergencias.push({ linha: l.linha, processo: processo.numero, planilha: l.fatal, jurysone: diaLocal(prazo.dataPrazo), acao: 'mantida a data do JurysOne; conferir' });
        }
        if (l.cumpridoEm && prazo.status === 'pendente') { await this.marcarCumprido(escritorioId, prazo.id, usuarios, l, user); relatorio.prazos.cumpridos++; }
        return;
      }
    }

    // cálculo pelo calendário do programa (que já recebeu a aba Feriados)
    const resp = this.responsaveisDe(usuarios, l.responsavel, user.id);
    const memoria: string[] = [];
    let conferir = l.conferir;
    let dias = l.dias;
    let vencimento: string | null = null;
    let inicio: string | null = null;
    if (l.disponibilizacao) {
      const ano = Number(l.disponibilizacao.slice(0, 4));
      const cal = await this.agenda.calendario(escritorioId, { tribunal, comarca: null }, [ano, ano + 1]);
      if (dias === null) { dias = PRAZO_PADRAO_DIAS; conferir = true; memoria.push('Prazo não informado na planilha: provisório de 5 dias úteis. CONFERIR.'); }
      const r = contarPrazo({ disponibilizacao: l.disponibilizacao, dias, contagem: l.contagem, calendario: cal, penal: l.contagem === 'CORRIDOS' });
      memoria.push(...r.memoria);
      vencimento = r.vencimento;
      inicio = r.inicio;
    }
    if (l.fatal && vencimento && l.fatal !== vencimento) {
      const cedo = l.fatal < vencimento ? l.fatal : vencimento;
      relatorio.prazos.divergencias.push({ linha: l.linha, processo: processo.numero, planilha: l.fatal, jurysone: vencimento, acao: `usada a data mais cedo (${cedo}); conferir` });
      memoria.push(`Planilha dizia ${formatarBr(l.fatal)} e o JurysOne calculou ${formatarBr(vencimento)}: vencimento fixado pela importação na data mais cedo (${formatarBr(cedo)}). CONFERIR.`);
      vencimento = cedo;
      conferir = true;
    } else if (l.fatal && !vencimento) {
      vencimento = l.fatal;
      memoria.push(`Vencimento ${formatarBr(l.fatal)} trazido da planilha (sem data de disponibilização): fixado pela importação.`);
    }
    if (resp.naoAchados.length) memoria.push(`Responsável na planilha não encontrado na equipe: ${resp.naoAchados.join(', ')}.`);
    if (l.observacoes) memoria.push(`Observações da planilha: ${l.observacoes}`);
    memoria.push(`Importado da planilha de prazos (linha ${l.linha}${l.id ? `, ID ${l.id}` : ''}).`);

    if (!idDjen) {
      const ini = new Date(`${vencimento}T00:00:00-03:00`), fim = new Date(`${vencimento}T23:59:59-03:00`);
      const ja = await this.prisma.prazo.findFirst({ where: { escritorioId, processoId: processo.id, deletedAt: null, descricao: l.oQueFazer.slice(0, 500), dataPrazo: { gte: ini, lte: fim } } });
      if (ja) { relatorio.prazos.jaExistiam++; return; }
    }

    // a intimação do DJEN é gravada com o ID, para a captura automática não duplicar depois
    if (idDjen && !intimacao) {
      intimacao = await this.prisma.intimacao.create({
        data: {
          escritorioId, fonte: 'DJEN', tribunal: tribunal || 'DJEN', diarioNome: 'DJEN',
          dataPublicacao: new Date(`${l.disponibilizacao ?? vencimento}T12:00:00-03:00`),
          titulo: `Intimação (importada da planilha) — ${processo.numero}`.slice(0, 250),
          conteudo: [l.oQueFazer, l.observacoes].filter(Boolean).join('\n\n') || 'Importada da planilha de prazos.',
          urlOrigem: l.link, numeroProcesso: processo.numero, processoId: processo.id, clienteId: processo.clienteId,
          djenId: idDjen, orgao: l.orgao || null, intimadosIds: resp.ids,
          status: l.cumpridoEm ? 'RESPONDIDA' : 'LIDA', lida: true, lidaEm: new Date(),
        } as any,
      });
    }

    const prazo = await this.agenda.criarPrazo({
      escritorioId, intimacaoId: intimacao?.id ?? null, processoId: processo.id, clienteId: processo.clienteId,
      responsaveisIds: resp.ids, descricao: l.oQueFazer || 'Prazo importado da planilha', origem: idDjen ? 'DJEN' : 'MANUAL',
      criadoPorId: user.id, conferir, diasPrazo: dias ?? 0, contagem: l.contagem, inicio: inicio ?? vencimento!, vencimento: vencimento!, memoria,
    });
    relatorio.prazos.novos++;
    if (l.cumpridoEm) { await this.marcarCumprido(escritorioId, prazo.id, usuarios, l, user); relatorio.prazos.cumpridos++; }
  }

  private async marcarCumprido(escritorioId: string, prazoId: string, usuarios: { id: string; nome: string }[], l: LinhaPrazoPlanilha, user: any) {
    const por = this.responsaveisDe(usuarios, l.cumpridoPor || l.responsavel, user.id).ids[0];
    await this.agenda.cumprir(escritorioId, prazoId, { id: por }, { observacao: 'Cumprido (importado da planilha)' });
    await this.prisma.prazo.update({ where: { id: prazoId }, data: { cumpridoEm: new Date(`${l.cumpridoEm}T12:00:00-03:00`) } });
  }
}
