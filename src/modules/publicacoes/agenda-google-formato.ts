/**
 * JURYSONE — Formato dos eventos no Google Agenda (o mesmo da planilha de prazos do escritório)
 *
 *   • Prazo fatal: 9h, 30 min, VERMELHO, lembretes na hora e 1 dia antes.
 *   • Alerta D-3: 9h, 15 min, AMARELO, lembrete na hora (só se a data ainda não passou).
 *   • Audiência/sessão: no horário, 1 h, AZUL, lembretes 2 dias e 2 horas antes.
 *   • Prazo cumprido: título "✅ CUMPRIDO – …" e sem lembretes.
 *   • A descrição leva a etiqueta [prazo:<id>:<dias>:fatal|d3] ou [audiencia:<processo>:<data>],
 *     a mesma convenção da planilha, para nunca duplicar evento.
 * Funções puras: nada aqui fala com o Google.
 */
export const CORES_GOOGLE = { VERMELHO: '11', AMARELO: '5', AZUL: '9', LARANJA: '6' } as const;

function curto(s: string | null | undefined, n: number) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function br(dia: string) {
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a}`;
}

function somarMinutos(dia: string, hora: string, min: number) {
  const d = new Date(`${dia}T${hora}:00-03:00`);
  return new Date(d.getTime() + min * 60_000).toISOString();
}

export interface DadosPrazoAgenda {
  prazoId: string;
  dias: number | null;
  vencimento: string; // AAAA-MM-DD
  alertaD3: string | null; // AAAA-MM-DD
  oQueFazer: string;
  processo: string | null;
  tribunal: string | null;
  orgao: string | null;
  cliente: string | null;
  responsaveis: string[];
  conferir: boolean;
  cumprido: boolean;
}

export function descricaoPrazo(p: DadosPrazoAgenda) {
  return [
    `Processo ${p.processo ?? '—'}${p.tribunal ? ` – ${p.tribunal}` : ''}${p.orgao ? ` – ${p.orgao}` : ''}`,
    `Cliente: ${p.cliente ?? '—'}`,
    `O que fazer: ${p.oQueFazer}`,
    `Responsável: ${p.responsaveis.join(' e ') || '—'}`,
    ...(p.conferir ? ['⚠️ CONFERIR: prazo deduzido ou provisório; confirmar nos autos.'] : []),
    '(JurysOne)',
  ].join('\n');
}

export function corpoPrazoFatal(p: DadosPrazoAgenda) {
  const tag = `[prazo:${p.prazoId}:${p.dias ?? ''}:fatal]`;
  const titulo = `⚖️ PRAZO FATAL – ${curto(p.oQueFazer, 60)} – ${curto(p.cliente, 30)}`;
  return {
    summary: p.cumprido ? `✅ CUMPRIDO – ${titulo.replace(/^\S+\s/, '')}` : titulo,
    description: `${descricaoPrazo(p)}\n${tag}`,
    start: { dateTime: somarMinutos(p.vencimento, '09:00', 0), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: somarMinutos(p.vencimento, '09:00', 30), timeZone: 'America/Sao_Paulo' },
    colorId: CORES_GOOGLE.VERMELHO,
    reminders: { useDefault: false, overrides: p.cumprido ? [] : [{ method: 'popup', minutes: 0 }, { method: 'popup', minutes: 1440 }] },
    status: 'confirmed',
  };
}

/** null quando não há alerta a criar (sem data ou data já passada e evento inexistente) */
export function corpoAlertaD3(p: DadosPrazoAgenda) {
  if (!p.alertaD3) return null;
  const tag = `[prazo:${p.prazoId}:${p.dias ?? ''}:d3]`;
  const titulo = `🔔 Alerta D-3 – ${curto(p.oQueFazer, 60)} (vence ${br(p.vencimento).slice(0, 5)}) – ${curto(p.cliente, 30)}`;
  return {
    summary: p.cumprido ? `✅ CUMPRIDO – ${titulo.replace(/^\S+\s/, '')}` : titulo,
    description: `${descricaoPrazo(p)}\n${tag}`,
    start: { dateTime: somarMinutos(p.alertaD3, '09:00', 0), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: somarMinutos(p.alertaD3, '09:00', 15), timeZone: 'America/Sao_Paulo' },
    colorId: CORES_GOOGLE.AMARELO,
    reminders: { useDefault: false, overrides: p.cumprido ? [] : [{ method: 'popup', minutes: 0 }] },
    status: 'confirmed',
  };
}

export function corpoAudiencia(e: { titulo: string; descricao: string | null; inicio: Date; fim: Date | null; local: string | null; processo: string | null; cancelado: boolean }) {
  const dia = new Date(e.inicio.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const sessao = /sess/i.test(e.titulo);
  return {
    summary: `${sessao ? '🏛️' : '👥'} ${curto(e.titulo, 80)}`,
    description: `${e.descricao ?? ''}\n(JurysOne)\n[audiencia:${e.processo ?? ''}:${dia}]`.trim(),
    location: e.local ?? undefined,
    start: { dateTime: e.inicio.toISOString(), timeZone: 'America/Sao_Paulo' },
    end: { dateTime: (e.fim ?? new Date(e.inicio.getTime() + 3600_000)).toISOString(), timeZone: 'America/Sao_Paulo' },
    colorId: CORES_GOOGLE.AZUL,
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 2880 }, { method: 'popup', minutes: 120 }] },
    status: e.cancelado ? 'cancelled' : 'confirmed',
  };
}
