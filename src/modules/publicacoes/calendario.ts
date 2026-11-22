/**
 * JURYSONE — Calendário forense e contagem de prazos (funções puras, sem banco)
 *
 * Datas sempre como texto 'AAAA-MM-DD' (dia civil), para não sofrer com fuso horário.
 *
 * Regras aplicadas:
 *   • Lei 11.419/2006, art. 4º, §§ 3º e 4º: considera-se publicada no primeiro dia útil
 *     seguinte ao da disponibilização no diário; o prazo começa no primeiro dia útil seguinte.
 *   • CPC, art. 219: prazo em dias úteis. CLT, art. 775: idem no trabalho.
 *   • CPP, art. 798: prazo penal em dias corridos; se vencer em dia sem expediente, prorroga.
 *   • CPC, art. 220; CLT, art. 775-A; CPP, art. 798-A: prazos suspensos de 20/12 a 20/01
 *     (no penal, a suspensão não corre em processo com réu preso).
 *   • Recesso forense de 20/12 a 06/01: sem expediente.
 *   • Feriados nacionais (Leis 662/1949, 6.802/1980, 10.607/2002 e 14.759/2023), Carnaval e
 *     Sexta-feira Santa (sem expediente forense).
 *   • Corpus Christi NÃO é nacional: entra pelo calendário de cada tribunal (TJSC, TRT12...).
 *     Regra do escritório (20/11/2026): na dúvida o prazo calculado nunca pode ficar mais longo que o real.
 *   • TRF (Lei 5.010/1966, art. 62): quarta e quinta da Semana Santa, 11/08, 01/11 e 08/12.
 *   • Feriados estaduais e municipais e suspensões de expediente de cada tribunal são
 *     cadastrados pelo escritório (FeriadoCalendario).
 */

export type Contagem = 'UTEIS' | 'CORRIDOS';

export interface DiaSemExpediente {
  inicio: string; // AAAA-MM-DD
  fim: string; // AAAA-MM-DD (inclusive)
  tipo: string; // NACIONAL | RECESSO | FORENSE | ESTADUAL | MUNICIPAL | SUSPENSAO | OUTRO
  descricao: string;
  tribunal?: string | null;
  comarca?: string | null;
}

export interface ContextoCalendario {
  tribunal?: string | null;
  comarca?: string | null;
}

// ── Datas ────────────────────────────────────────────────────────────────────

export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

export function formatarBr(dia: string): string {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher) */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Dias sem expediente que o sistema conhece sozinho (valem para todos os tribunais) */
export function diasNacionais(ano: number): DiaSemExpediente[] {
  const p = pascoa(ano);
  const um = (dia: string, descricao: string, tipo = 'NACIONAL'): DiaSemExpediente => ({ inicio: dia, fim: dia, tipo, descricao });
  return [
    um(`${ano}-01-01`, 'Confraternização Universal'),
    um(somarDias(p, -48), 'Carnaval (segunda-feira)', 'FORENSE'),
    um(somarDias(p, -47), 'Carnaval (terça-feira)', 'FORENSE'),
    um(somarDias(p, -2), 'Sexta-feira Santa'),
    um(`${ano}-04-21`, 'Tiradentes'),
    um(`${ano}-05-01`, 'Dia do Trabalho'),
    um(`${ano}-09-07`, 'Independência do Brasil'),
    um(`${ano}-10-12`, 'Nossa Senhora Aparecida'),
    um(`${ano}-11-02`, 'Finados'),
    um(`${ano}-11-15`, 'Proclamação da República'),
    um(`${ano}-11-20`, 'Dia Nacional de Zumbi e da Consciência Negra'),
    um(`${ano}-12-25`, 'Natal'),
    { inicio: `${ano}-12-20`, fim: `${ano}-12-31`, tipo: 'RECESSO', descricao: 'Recesso forense (20/12 a 06/01)' },
    { inicio: `${ano}-01-01`, fim: `${ano}-01-06`, tipo: 'RECESSO', descricao: 'Recesso forense (20/12 a 06/01)' },
  ];
}

/** Feriados da Justiça Federal (Lei 5.010/1966, art. 62) — só para TRFs */
export function diasJusticaFederal(ano: number): DiaSemExpediente[] {
  const p = pascoa(ano);
  const um = (dia: string, descricao: string): DiaSemExpediente => ({ inicio: dia, fim: dia, tipo: 'FORENSE', descricao, tribunal: 'TRF*' });
  return [
    um(somarDias(p, -4), 'Quarta-feira da Semana Santa (Lei 5.010/66)'),
    um(somarDias(p, -3), 'Quinta-feira da Semana Santa (Lei 5.010/66)'),
    um(`${ano}-08-11`, 'Dia da criação dos cursos jurídicos (Lei 5.010/66)'),
    um(`${ano}-11-01`, 'Todos os Santos (Lei 5.010/66)'),
    um(`${ano}-12-08`, 'Dia da Justiça (Lei 5.010/66)'),
  ];
}

/** Suspensão de prazos de 20/12 a 20/01 (há expediente de 07/01 a 20/01, mas o prazo não corre) */
function emSuspensaoDeFimDeAno(dia: string): boolean {
  const md = dia.slice(5);
  return md >= '12-20' || md <= '01-20';
}

export function normalizarLocal(txt?: string | null): string {
  return String(txt ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tribunalBate(regra: string | null | undefined, tribunal: string | null | undefined): boolean {
  if (!regra) return true;
  const r = regra.toUpperCase();
  const t = String(tribunal ?? '').toUpperCase();
  if (r.endsWith('*')) return t.startsWith(r.slice(0, -1));
  return r === t;
}

// ── Calendário ───────────────────────────────────────────────────────────────

export class Calendario {
  private readonly dias: DiaSemExpediente[];

  constructor(cadastrados: DiaSemExpediente[], private readonly ctx: ContextoCalendario = {}) {
    this.dias = cadastrados;
  }

  /** Cria o calendário com os dias nacionais dos anos informados + os cadastrados pelo escritório */
  static para(anos: number[], cadastrados: DiaSemExpediente[], ctx: ContextoCalendario): Calendario {
    const base: DiaSemExpediente[] = [];
    for (const ano of new Set(anos)) base.push(...diasNacionais(ano), ...diasJusticaFederal(ano));
    return new Calendario([...base, ...cadastrados], ctx);
  }

  private aplicaveis(dia: string) {
    const comarca = normalizarLocal(this.ctx.comarca);
    return this.dias.filter((d) => {
      if (dia < d.inicio || dia > d.fim) return false;
      if (!tribunalBate(d.tribunal, this.ctx.tribunal)) return false;
      if (d.comarca && normalizarLocal(d.comarca) !== comarca) return false;
      return true;
    });
  }

  /** Motivo de o dia não ter expediente (null se é dia útil) */
  motivoSemExpediente(dia: string): string | null {
    const ds = diaDaSemana(dia);
    if (ds === 0) return 'domingo';
    if (ds === 6) return 'sábado';
    const f = this.aplicaveis(dia).find((d) => d.tipo !== 'SUSPENSAO_PRAZO');
    return f ? f.descricao : null;
  }

  ehDiaUtil(dia: string): boolean {
    return this.motivoSemExpediente(dia) === null;
  }

  proximoDiaUtil(dia: string): string {
    let d = dia;
    for (let i = 0; i < 400 && !this.ehDiaUtil(d); i++) d = somarDias(d, 1);
    return d;
  }

  /** O prazo fica parado neste dia? (suspensão de fim de ano, salvo penal com réu preso) */
  prazoSuspenso(dia: string, opts: { penal?: boolean; reuPreso?: boolean } = {}): boolean {
    if (opts.penal && opts.reuPreso) return false;
    if (emSuspensaoDeFimDeAno(dia)) return true;
    return this.aplicaveis(dia).some((d) => d.tipo === 'SUSPENSAO_PRAZO');
  }
}

// ── Contagem ─────────────────────────────────────────────────────────────────

export interface ResultadoContagem {
  disponibilizacao: string;
  publicacao: string;
  inicio: string;
  vencimento: string;
  dias: number;
  contagem: Contagem;
  memoria: string[];
}

export function contarPrazo(opts: {
  disponibilizacao: string;
  dias: number;
  contagem: Contagem;
  calendario: Calendario;
  penal?: boolean;
  reuPreso?: boolean;
}): ResultadoContagem {
  const { disponibilizacao, dias, contagem, calendario: cal } = opts;
  const susp = { penal: opts.penal, reuPreso: opts.reuPreso };
  const memoria: string[] = [`Disponibilizada no DJEN em ${formatarBr(disponibilizacao)}.`];

  const publicacao = cal.proximoDiaUtil(somarDias(disponibilizacao, 1));
  memoria.push(`Publicação considerada em ${formatarBr(publicacao)} (1º dia útil seguinte — Lei 11.419/06, art. 4º, § 3º).`);

  if (dias <= 0) {
    return { disponibilizacao, publicacao, inicio: publicacao, vencimento: publicacao, dias, contagem, memoria };
  }

  let inicio: string;
  let vencimento: string;
  const pulados: string[] = [];

  if (contagem === 'UTEIS') {
    let d = somarDias(publicacao, 1);
    let contados = 0;
    inicio = '';
    for (let guarda = 0; guarda < 2000 && contados < dias; guarda++, d = somarDias(d, 1)) {
      const motivo = cal.motivoSemExpediente(d);
      if (motivo) {
        if (motivo !== 'sábado' && motivo !== 'domingo') pulados.push(`${formatarBr(d)} (${motivo})`);
        continue;
      }
      if (cal.prazoSuspenso(d, susp)) { pulados.push(`${formatarBr(d)} (prazos suspensos)`); continue; }
      if (!inicio) inicio = d;
      contados++;
    }
    vencimento = somarDias(d, -1);
    memoria.push(`Contagem em dias úteis: começa em ${formatarBr(inicio)} e vence em ${formatarBr(vencimento)} (${dias} dias úteis).`);
  } else {
    inicio = somarDias(publicacao, 1);
    if (!cal.ehDiaUtil(inicio) || cal.prazoSuspenso(inicio, susp)) {
      let d = inicio;
      for (let g = 0; g < 400 && (!cal.ehDiaUtil(d) || cal.prazoSuspenso(d, susp)); g++) d = somarDias(d, 1);
      memoria.push(`O dia seguinte à publicação não tem expediente/está suspenso: o prazo começa em ${formatarBr(d)}.`);
      inicio = d;
    }
    let d = inicio;
    let contados = 0;
    for (let guarda = 0; guarda < 2000; guarda++, d = somarDias(d, 1)) {
      if (cal.prazoSuspenso(d, susp)) { pulados.push(`${formatarBr(d)} (prazos suspensos)`); continue; }
      contados++;
      if (contados === dias) break;
    }
    vencimento = d;
    if (!cal.ehDiaUtil(vencimento)) {
      const novo = cal.proximoDiaUtil(vencimento);
      memoria.push(`Vencimento em ${formatarBr(vencimento)} (${cal.motivoSemExpediente(vencimento)}) prorrogado para ${formatarBr(novo)}.`);
      vencimento = novo;
    }
    memoria.push(`Contagem em dias corridos (CPP, art. 798): começa em ${formatarBr(inicio)} e vence em ${formatarBr(vencimento)}.`);
  }

  if (pulados.length) memoria.push(`Dias não contados: ${pulados.slice(0, 40).join('; ')}${pulados.length > 40 ? '…' : ''}.`);
  return { disponibilizacao, publicacao, inicio, vencimento, dias, contagem, memoria };
}
