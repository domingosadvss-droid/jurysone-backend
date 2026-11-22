/**
 * JURYSONE — Filtro de conversas do WhatsApp Web (privacidade do número do advogado).
 *
 * Regra combinada com o escritório: grava a conversa quando o contato
 *   • é cliente cadastrado no JurysOne, ou
 *   • NÃO está salvo na agenda do celular (provável cliente novo), ou
 *   • já tem conversa aceita no JurysOne.
 * Contatos salvos na agenda que não são clientes (família, amigos) ficam de fora.
 */

/**
 * Chave de comparação de telefones: DDD + 8 últimos dígitos para números do Brasil
 * (ignora o +55 e o 9 extra dos celulares, que aparecem ou não conforme a origem).
 */
export function chaveTelefone(valor: unknown): string {
  let d = String(valor ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length >= 11) d = d.replace(/^0+/, '');
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : String(valor ?? '').replace(/\D/g, '');
}

export interface AgendaSalva {
  carregadaEm: string | null; // ISO; null = ainda não leu a agenda inteira do celular
  telefones: string[];        // chaves (chaveTelefone) dos contatos salvos
  lids: string[];             // códigos internos (@lid) dos contatos salvos
}
