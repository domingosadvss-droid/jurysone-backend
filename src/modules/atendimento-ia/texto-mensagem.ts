/** Texto de uma mensagem da caixa para a IA (mídias viram "[foto]", "[documento: nome]" etc.) */
const TIPOS_MIDIA: Record<string, string> = {
  image: '[foto]', video: '[vídeo]', audio: '[áudio — a IA não ouve áudios]', sticker: '[figurinha]',
  location: '[localização]', contacts: '[contato compartilhado]', reaction: '[reação]',
};

export function textoDaMensagem(m: { tipo: string; texto: string | null; midiaNome: string | null }) {
  const base = (m.texto ?? '').trim();
  if (m.tipo === 'text' || m.tipo === 'button' || m.tipo === 'interactive') return base;
  const rotulo = m.tipo === 'document' ? `[documento${m.midiaNome ? `: ${m.midiaNome}` : ''}]` : TIPOS_MIDIA[m.tipo] ?? `[${m.tipo}]`;
  return base ? `${rotulo} ${base}` : rotulo;
}
