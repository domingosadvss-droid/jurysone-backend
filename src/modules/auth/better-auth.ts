/**
 * JURYSONE — Login pelo Better Auth (desde 22/11/2026).
 *
 * O Better Auth cuida de toda a autenticação: e-mail e senha, login pelo Google, "esqueci a
 * senha", sessões, limite de tentativas e verificação em duas etapas (app autenticador + códigos
 * de reserva + "confiar neste computador por 30 dias"). Fica em /api/ba/*.
 *
 * Depois que o Better Auth confirma quem é a pessoa (inclusive o 2º fator), a tela chama
 * POST /api/auth/sessao, que troca a sessão do Better Auth pelo token interno do JurysOne — assim
 * as permissões e a auditoria de todas as telas continuam as mesmas.
 *
 *   • O usuário do Better Auth é a tabela "users" (name -> nome, image -> avatarUrl).
 *   • Senhas em argon2, como antes: ninguém precisou trocar de senha.
 *   • Ninguém se cadastra sozinho: contas são criadas pela equipe; o Google só entra em conta que já existe.
 *   • O login pelo Google também pede o código de 6 dígitos quando a pessoa ligou o 2FA
 *     (por padrão o Better Auth só pede no login com senha).
 *
 * O pacote better-auth é só ESM; o Node 22+ carrega ESM com require(), por isso os require abaixo.
 */
/* eslint-disable @typescript-eslint/no-var-requires */
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { enviarEmail } from '../../common/email';

const { betterAuth } = require('better-auth');
const { twoFactor } = require('better-auth/plugins');
const { createAuthMiddleware } = require('better-auth/api');
const { deleteSessionCookie } = require('better-auth/cookies');
const { generateRandomString } = require('better-auth/crypto');
const { Pool } = require('pg');

const logger = new Logger('BetterAuth');

export const BASE_PATH_BETTER_AUTH = '/api/ba';
export const ISSUER_2FA = 'JurysOne';

/** Registro de eventos de login na auditoria (preenchido pelo AuthService ao iniciar) */
type Auditar = (e: { usuarioId: string; escritorioId?: string; acao: string; detalhes?: any; request?: any }) => Promise<void>;
let auditar: Auditar = async () => undefined;
export function definirAuditoriaLogin(fn: Auditar) { auditar = fn; }

function urlBase() {
  return (process.env.BETTER_AUTH_URL || process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/+$/, '');
}

/**
 * Exige o 2º fator também no retorno do Google: aplica o mesmo desafio que o plugin oficial usa
 * no login com senha (apaga a sessão recém-criada, grava o desafio e o cookie "two_factor") e
 * leva a pessoa para a tela do código. A verificação depois usa as rotas oficiais do plugin.
 */
function doisFatoresNoGoogle() {
  return {
    id: 'jurysone-2fa-google',
    hooks: {
      after: [{
        matcher: (ctx: any) => String(ctx.path ?? '').startsWith('/callback/'),
        handler: createAuthMiddleware(async (ctx: any) => {
          const nova = ctx.context.newSession;
          if (!nova?.user?.twoFactorEnabled) return;
          const segredo = await ctx.context.adapter.findOne({ model: 'twoFactor', where: [{ field: 'userId', value: nova.user.id }] });
          if (!segredo || segredo.verified === false) return;
          deleteSessionCookie(ctx, true);
          await ctx.context.internalAdapter.deleteSession(nova.session.token);
          ctx.context.setNewSession(null);
          const maxAge = 10 * 60;
          const cookie = ctx.context.createAuthCookie('two_factor', { maxAge });
          const identificador = `2fa-${generateRandomString(20)}`;
          const expiresAt = new Date(Date.now() + maxAge * 1000);
          await ctx.context.internalAdapter.createVerificationValue({ value: nova.user.id, identifier: identificador, expiresAt });
          await ctx.context.internalAdapter.createVerificationValue({ value: '0', identifier: `2fa-attempts-${identificador}`, expiresAt });
          await ctx.setSignedCookie(cookie.name, identificador, ctx.context.secret, cookie.attributes);
          throw ctx.redirect(`${urlBase()}/login.html?dois-fatores=google`);
        }),
      }],
    },
  };
}

function criar() {
  const google = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;
  const base = urlBase();
  return betterAuth({
    appName: ISSUER_2FA,
    baseURL: base,
    basePath: BASE_PATH_BETTER_AUTH,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [base, ...(process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)],
    database: new Pool({ connectionString: process.env.DATABASE_URL, max: 5 }),
    // ids no mesmo formato do resto do sistema (uuid), gerados aqui
    advanced: { database: { generateId: () => randomUUID() } },
    user: {
      modelName: 'users',
      fields: { name: 'nome', image: 'avatarUrl' },
      // Colunas obrigatórias do JurysOne: declaradas para a checagem de esquema do Better Auth,
      // mas ele nunca recebe nem devolve (ninguém se cadastra pelo Better Auth)
      additionalFields: {
        senha: { type: 'string', required: false, input: false, returned: false },
        escritorioId: { type: 'string', required: false, input: false, returned: false },
      },
    },
    session: {
      modelName: 'ba_sessoes',
      expiresIn: 60 * 60 * 24 * 7,  // 7 dias
      updateAge: 60 * 60 * 24,
    },
    account: {
      modelName: 'ba_contas',
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    verification: { modelName: 'ba_verificacoes' },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,           // contas só pela equipe (Configurações → Equipe)
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      password: {
        hash: (senha: string) => argon2.hash(senha),
        verify: async ({ hash, password }: { hash: string; password: string }) => {
          try { return await argon2.verify(hash, password); } catch { return false; }
        },
      },
      sendResetPassword: async ({ user, url }: any, request: any) => {
        await auditar({ usuarioId: user.id, acao: 'PEDIDO_NOVA_SENHA', detalhes: { email: user.email }, request });
        await enviarEmail({
          para: user.email,
          assunto: 'JurysOne — redefinir sua senha',
          texto: `Olá, ${user.name ?? ''}.\n\nPara criar uma nova senha no JurysOne, abra o link abaixo (vale por 30 minutos):\n${url}\n\nSe você não pediu, ignore este e-mail.`,
        }).catch((e) => logger.warn(`E-mail de nova senha não enviado: ${e?.message ?? e}`));
      },
      onPasswordReset: async ({ user }: any, request: any) => {
        await auditar({ usuarioId: user.id, acao: 'SENHA_REDEFINIDA', request });
      },
    },
    socialProviders: google ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // Agenda: o login já pede a permissão do Google Agenda (para mandar os prazos)
        scope: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'],
        accessType: 'offline',
        prompt: 'select_account consent',
        disableImplicitSignUp: true, // o Google só entra em conta que já existe no JurysOne
      },
    } : {},
    plugins: [
      twoFactor({
        issuer: ISSUER_2FA,
        twoFactorTable: 'ba_dois_fatores',
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: 'encrypted' },
      }),
      doisFatoresNoGoogle(),
    ],
    hooks: {
      after: createAuthMiddleware(async (ctx: any) => {
        // Senha errada / conta bloqueada: registra a tentativa (o Better Auth já limita tentativas)
        if (ctx.path === '/sign-in/email') {
          const r = ctx.context.returned;
          if (r && (r instanceof Error || r?.status >= 400 || r?.statusCode >= 400)) {
            const email = String(ctx.body?.email ?? '').toLowerCase().slice(0, 200);
            logger.warn(`Login recusado: ${email}`);
            await auditar({ usuarioId: '', acao: 'LOGIN_FALHOU', detalhes: { email, metodo: 'senha' }, request: ctx.request });
          }
        }
      }),
    },
    rateLimit: { enabled: true, window: 60, max: 30 },
  });
}

let instancia: any = null;
/** A instância do Better Auth (criada na primeira chamada) */
export function betterAuthInstancia(): any {
  if (!instancia) instancia = criar();
  return instancia;
}

/** Handler Express de /api/ba/* (montar ANTES do express.json) */
export function handlerBetterAuth() {
  const { toNodeHandler } = require('better-auth/node');
  return toNodeHandler(betterAuthInstancia());
}

export function headersDaRequisicao(req: any) {
  const { fromNodeHeaders } = require('better-auth/node');
  return fromNodeHeaders(req.headers);
}
