/**
 * Calculadora de Prazos Processuais — JurysOne
 *
 * Implementa as regras do CPC:
 *   Art. 219 — prazos em dias úteis excluem sábados, domingos e feriados
 *   Art. 224 — início da contagem: primeiro dia útil seguinte ao da intimação
 *   Art. 132 — prorrogação automática quando vencimento cai em dia não útil
 *
 * Feriados nacionais via BrasilAPI (https://brasilapi.com.br/api/feriados/v1/{ano})
 */

import axios from 'axios';

const BRASIL_API = 'https://brasilapi.com.br/api/feriados/v1';

// Cache simples de feriados por ano
const feriadosCache = new Map<number, Date[]>();

async function carregarFeriados(ano: number): Promise<Date[]> {
  if (feriadosCache.has(ano)) return feriadosCache.get(ano)!;

  try {
    const { data } = await axios.get(`${BRASIL_API}/${ano}`, { timeout: 5_000 });
    const datas: Date[] = (data as any[]).map(
      (f) => new Date(`${f.date}T12:00:00`),
    );
    feriadosCache.set(ano, datas);
    return datas;
  } catch {
    feriadosCache.set(ano, []);
    return [];
  }
}

function isFinalDeSemana(d: Date): boolean {
  const dia = d.getDay();
  return dia === 0 || dia === 6;
}

function isFeriado(d: Date, feriados: Date[]): boolean {
  return feriados.some(
    (f) =>
      f.getFullYear() === d.getFullYear() &&
      f.getMonth() === d.getMonth() &&
      f.getDate() === d.getDate(),
  );
}

function isDiaUtil(d: Date, feriados: Date[]): boolean {
  return !isFinalDeSemana(d) && !isFeriado(d, feriados);
}

function addDias(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export interface ResultadoPrazo {
  dataVencimento: Date;
  dataInicioPrazo: Date;
  diasUteis: number;
  diasCorridos: number;
  feriadosNoPeriodo: string[];
}

export interface OpcoesPrazo {
  /** Data da publicação / intimação */
  dataPublicacao: Date;
  /** Quantidade de dias do prazo */
  diasPrazo: number;
  /** 'util' = dias úteis (default, CPC art. 219) | 'corrido' = todos os dias */
  tipoPrazo?: 'util' | 'corrido' | 'fatal';
}

/**
 * Calcula a data de vencimento de um prazo processual.
 * - Para prazos em dias úteis (default), começa no 1° dia útil após a publicação
 *   e avança contando apenas dias úteis (sem fins de semana e feriados nacionais).
 * - Se o vencimento cair em dia não útil, prorroga para o próximo dia útil (CPC 132).
 */
export async function calcularVencimento(
  opts: OpcoesPrazo,
): Promise<ResultadoPrazo> {
  const { dataPublicacao, diasPrazo, tipoPrazo = 'util' } = opts;

  // Pré-carregar feriados para o ano da publicação e o seguinte
  const anoBase = dataPublicacao.getFullYear();
  const [feriadosAno, feriadosProximo] = await Promise.all([
    carregarFeriados(anoBase),
    carregarFeriados(anoBase + 1),
  ]);
  const feriados = [...feriadosAno, ...feriadosProximo];

  let dataVencimento: Date;
  let diasUteis = 0;
  let diasCorridos = 0;
  let dataInicioPrazo: Date;

  if (tipoPrazo === 'corrido') {
    // Prazo corrido: conta todos os dias a partir da publicação
    dataInicioPrazo = addDias(dataPublicacao, 1);
    dataVencimento = addDias(dataPublicacao, diasPrazo);
    diasCorridos = diasPrazo;

    // Conta dias úteis no intervalo
    let d = new Date(dataInicioPrazo);
    while (d <= dataVencimento) {
      if (isDiaUtil(d, feriados)) diasUteis++;
      d = addDias(d, 1);
    }
  } else {
    // Dias úteis (CPC art. 224): início = primeiro dia útil após publicação
    dataInicioPrazo = addDias(dataPublicacao, 1);
    while (!isDiaUtil(dataInicioPrazo, feriados)) {
      dataInicioPrazo = addDias(dataInicioPrazo, 1);
    }

    // Avança contando apenas dias úteis
    let restantes = diasPrazo;
    let cursor = new Date(dataInicioPrazo);
    dataVencimento = new Date(dataInicioPrazo);

    while (restantes > 0) {
      if (isDiaUtil(cursor, feriados)) {
        restantes--;
        dataVencimento = new Date(cursor);
        diasUteis++;
      }
      diasCorridos++;
      if (restantes > 0) cursor = addDias(cursor, 1);
    }

    // Prorrogação CPC 132: vencimento em dia não útil → próximo útil
    while (!isDiaUtil(dataVencimento, feriados)) {
      dataVencimento = addDias(dataVencimento, 1);
    }
  }

  // Coleta feriados que caíram no período (para exibição)
  const feriadosNoPeriodo = feriados
    .filter((f) => f >= dataInicioPrazo && f <= dataVencimento)
    .map((f) => f.toISOString().slice(0, 10));

  return {
    dataVencimento,
    dataInicioPrazo,
    diasUteis,
    diasCorridos,
    feriadosNoPeriodo,
  };
}
