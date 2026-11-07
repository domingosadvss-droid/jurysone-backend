/**
 * JURYSONE — Criptografia de segredos guardados no banco (tokens OAuth, chaves de API).
 * AES-256-GCM com a chave da variável CHAVE_CRIPTOGRAFIA (64 caracteres hex = 32 bytes).
 * Gerar: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function chave(): Buffer {
  const hex = process.env.CHAVE_CRIPTOGRAFIA ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('CHAVE_CRIPTOGRAFIA ausente ou inválida (precisa de 64 caracteres hexadecimais).');
  }
  return Buffer.from(hex, 'hex');
}

export function criptografiaConfigurada(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env.CHAVE_CRIPTOGRAFIA ?? '');
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), dados.toString('base64')].join(':');
}

export function decifrar(pacote: string): string {
  const [versao, iv, tag, dados] = String(pacote).split(':');
  if (versao !== 'v1' || !iv || !tag || !dados) throw new Error('Segredo em formato desconhecido.');
  const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64')), d.final()]).toString('utf8');
}
