// Sem @types/nodemailer no projeto: carregado com require, como nos demais envios de e-mail
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer');

/**
 * Envio de e-mail pelo SMTP configurado no ambiente:
 *   SMTP_HOST, SMTP_PORT (padrão 587), SMTP_SECURE ('true' para 465), SMTP_USER, SMTP_PASS,
 *   SMTP_FROM (padrão: SMTP_USER) e SMTP_FROM_NAME (padrão: JurysOne).
 * Para Gmail, SMTP_PASS precisa ser uma "senha de app" (a senha normal da conta é recusada).
 */
export function emailConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function enviarEmail(msg: { para: string; assunto: string; texto: string; html?: string }): Promise<void> {
  if (!emailConfigurado()) {
    throw new Error('E-mail não configurado (faltam SMTP_HOST, SMTP_USER ou SMTP_PASS)');
  }
  const transporte = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const remetente = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporte.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'JurysOne'}" <${remetente}>`,
    to: msg.para,
    subject: msg.assunto,
    text: msg.texto,
    html: msg.html,
  });
}
