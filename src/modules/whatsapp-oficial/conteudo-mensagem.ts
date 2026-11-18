/**
 * JURYSONE — Tradução de uma mensagem da Cloud API para o formato da caixa.
 * Funções puras (sem banco), usadas para mensagens recebidas, ecos do celular e histórico.
 */

export interface ConteudoMensagem {
  tipo: string;
  texto: string | null;
  midiaId: string | null;
  midiaMime: string | null;
  midiaNome: string | null;
}

const TIPOS_COM_MIDIA = ['image', 'document', 'audio', 'video', 'sticker'];

/** Só dígitos (a Meta manda o wa_id já com DDI e sem "+") */
export function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

export function dataDaMeta(timestamp: unknown): Date {
  const s = Number(timestamp);
  return Number.isFinite(s) && s > 0 ? new Date(s * 1000) : new Date();
}

export function conteudoDe(msg: any): ConteudoMensagem {
  const tipo = String(msg?.type ?? 'unsupported');
  const base: ConteudoMensagem = { tipo, texto: null, midiaId: null, midiaMime: null, midiaNome: null };
  if (tipo === 'text') return { ...base, texto: msg.text?.body ?? null };
  if (TIPOS_COM_MIDIA.includes(tipo)) {
    const m = msg[tipo] ?? {};
    return { ...base, texto: m.caption ?? null, midiaId: m.id ?? null, midiaMime: m.mime_type ?? null, midiaNome: m.filename ?? null };
  }
  if (tipo === 'location') {
    const l = msg.location ?? {};
    return { ...base, texto: [l.name, l.address, `https://maps.google.com/?q=${l.latitude},${l.longitude}`].filter(Boolean).join(' — ') };
  }
  if (tipo === 'contacts') {
    const nomes = (msg.contacts ?? []).map((c: any) => [c?.name?.formatted_name, ...(c?.phones ?? []).map((p: any) => p?.phone)].filter(Boolean).join(' '));
    return { ...base, texto: `Contato compartilhado: ${nomes.join('; ')}` };
  }
  if (tipo === 'interactive') return { ...base, texto: msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null };
  if (tipo === 'button') return { ...base, texto: msg.button?.text ?? null };
  if (tipo === 'reaction') return { ...base, texto: msg.reaction?.emoji ? `Reagiu com ${msg.reaction.emoji}` : 'Removeu a reação' };
  return { ...base, tipo: 'unsupported', texto: 'Mensagem de um tipo que o WhatsApp não envia pela API (ex.: enquete).' };
}

/** Status da Meta → status da caixa */
export function statusDaMeta(s: unknown): string | null {
  const mapa: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };
  return mapa[String(s)] ?? null;
}
