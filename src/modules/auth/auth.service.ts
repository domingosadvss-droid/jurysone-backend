import { Injectable, BadRequestException, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import * as argon2 from 'argon2';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { enviarEmail } from '../../common/email';
import { cifrar, criptografiaConfigurada } from '../../common/cripto';
import { AuditoriaService, ContextoRequisicao, contextoDa } from '../auditoria/auditoria.service';
import { betterAuthInstancia, definirAuditoriaLogin, headersDaRequisicao } from './better-auth';

/** Contexto (IP, navegador) a partir do Request do Better Auth (Fetch API) */
function contextoDaRequest(r: any): ContextoRequisicao | undefined {
  try {
    const h = r?.headers;
    if (!h?.get) return undefined;
    return contextoDa({ headers: Object.fromEntries(h.entries()), ip: (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || undefined, socket: {} } as any);
  } catch { return undefined; }
}

/** Entrar com Google: identifica a pessoa e, na mesma autorização, libera o Google Agenda */
const ESCOPO_AGENDA = 'https://www.googleapis.com/auth/calendar.events';
const ESCOPOS_LOGIN_GOOGLE = ['openid', 'email', 'profile', ESCOPO_AGENDA];
/** Código de uso único entregue à tela de login depois do Google */
const CODIGO_GOOGLE_VALIDADE_MS = 2 * 60_000;

/** Validade do link de "Esqueceu a senha?" */
const RESET_VALIDADE_MIN = 30;
/** Resposta igual exista ou não o e-mail, para não revelar quem tem conta */
const RESET_MENSAGEM = 'Se este e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Ele vale por 30 minutos.';

function hashCodigo(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}

interface LoginDto {
  email: string;
  password: string;
}

interface RegisterDto {
  email: string;
  password: string;
  nome: string;
  nomeEscritorio: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Códigos de uso único do login Google → usuário (só em memória, valem 2 minutos) */
  private readonly codigosGoogle = new Map<string, { userId: string; expira: number }>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private auditoria: AuditoriaService,
  ) {}

  onModuleInit() {
    // Eventos do Better Auth (pedido de nova senha, senha redefinida, login recusado) vão para a auditoria
    definirAuditoriaLogin(async (e) => {
      try {
        const u = e.usuarioId ? await this.prisma.usuario.findUnique({ where: { id: e.usuarioId }, select: { escritorioId: true } }) : null;
        const porEmail = !u && e.detalhes?.email
          ? await this.prisma.usuario.findFirst({ where: { email: { equals: e.detalhes.email, mode: 'insensitive' } }, select: { id: true, escritorioId: true } })
          : null;
        const escritorioId = u?.escritorioId ?? porEmail?.escritorioId;
        if (!escritorioId) return; // e-mail que não existe: não há escritório para registrar
        await this.auditoria.registrar({
          escritorioId, usuarioId: e.usuarioId || porEmail?.id || null, acao: e.acao as any, tipoEntidade: 'auth',
          ctx: e.request ? contextoDaRequest(e.request) : undefined, detalhes: e.detalhes,
        });
      } catch (err: any) { this.logger.warn(`Auditoria do login: ${err?.message ?? err}`); }
    });
  }

  /**
   * Ponte Better Auth → JurysOne. Depois que o Better Auth confirmou a pessoa (senha ou Google,
   * e o 2º fator quando ligado), troca a sessão dele pelo token interno do JurysOne, que todas as
   * telas e permissões já usam. Também guarda a permissão do Google Agenda, se veio no login.
   */
  async sessaoDoBetterAuth(req: any, ctx?: ContextoRequisicao) {
    const auth = betterAuthInstancia();
    const s = await auth.api.getSession({ headers: headersDaRequisicao(req) });
    if (!s?.user?.id) throw new UnauthorizedException('Sessão expirada. Entre de novo.');
    const user = await this.prisma.usuario.findUnique({ where: { id: s.user.id } });
    if (!user || !user.ativo) {
      await auth.api.signOut({ headers: headersDaRequisicao(req) }).catch(() => undefined);
      throw new ForbiddenException('Este usuário está desativado. Fale com o administrador do escritório.');
    }
    // Google: o Better Auth guardou o token; a agenda usa o refresh token cifrado em users
    const google = await this.prisma.baConta.findFirst({ where: { userId: user.id, providerId: 'google' }, orderBy: { updatedAt: 'desc' } });
    let agendaConectada = !!user.googleAgendaToken;
    if (google?.refreshToken && String(google.scope ?? '').includes('calendar') && criptografiaConfigurada()) {
      await this.prisma.usuario.update({
        where: { id: user.id },
        data: { googleAgendaToken: cifrar(google.refreshToken), googleAgendaId: user.googleAgendaId ?? 'primary', googleAgendaConectadoEm: new Date() },
      });
      agendaConectada = true;
    }
    const metodo = google && Date.now() - new Date(google.updatedAt).getTime() < 5 * 60_000 ? 'google' : 'senha';
    const sessao = await this.emitirSessao(user);
    await this.auditoria.registrar({
      escritorioId: user.escritorioId, usuarioId: user.id, acao: metodo === 'google' ? 'LOGIN_GOOGLE' : 'LOGIN', tipoEntidade: 'auth', ctx,
      detalhes: { metodo, email: user.email, doisFatores: !!user.twoFactorEnabled, agendaConectada },
    });
    return { ...sessao, agendaConectada, doisFatores: !!user.twoFactorEnabled };
  }

  /** QR Code do app autenticador, gerado no próprio servidor (o endereço tem o segredo: não vai a terceiros) */
  async qrDoisFatores(uri: string) {
    if (!/^otpauth:\/\/totp\//.test(String(uri ?? ''))) throw new BadRequestException('Endereço inválido.');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const QRCode = require('qrcode');
    return { imagem: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
  }

  async login(dto: LoginDto, ctx?: ContextoRequisicao): Promise<TokenResponse & { user: any }> {
    const user = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const passwordMatch = await argon2.verify(user.senha, dto.password);

    if (!passwordMatch) {
      // Senha errada para uma conta existente: fica na auditoria do escritório
      await this.auditoria.registrar({
        escritorioId: user.escritorioId, usuarioId: user.id, acao: 'LOGIN_FALHOU', tipoEntidade: 'auth', ctx,
        detalhes: { motivo: 'senha incorreta', email: user.email },
      });
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const sessao = await this.emitirSessao(user);
    await this.auditoria.registrar({
      escritorioId: user.escritorioId, usuarioId: user.id, acao: 'LOGIN', tipoEntidade: 'auth', ctx,
      detalhes: { metodo: 'senha', email: user.email },
    });
    return sessao;
  }

  /** Gera os tokens da sessão (mesma resposta do login por senha) */
  private async emitirSessao(user: {
    id: string; email: string; nome: string; roles: any; escritorioId: string;
  }): Promise<TokenResponse & { user: any }> {
    const tokens = this.generateTokens(user.id, user.email, user.roles as any);

    // Store refresh token hash in DB
    const hashedRefreshToken = await argon2.hash(tokens.refresh_token);
    await this.prisma.usuario.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashedRefreshToken },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        roles: user.roles,
        escritorioId: user.escritorioId,
      },
    };
  }

  async register(dto: RegisterDto): Promise<TokenResponse & { user: any }> {
    // Cadastro público de escritórios: fechado por padrão em produção.
    // Para reabrir (venda como SaaS), defina CADASTRO_ABERTO=true no .env.
    if (process.env.NODE_ENV === 'production' && process.env.CADASTRO_ABERTO !== 'true') {
      throw new ForbiddenException('Cadastro fechado. Peça um convite ao administrador do escritório.');
    }

    // Check if user already exists
    const existingUser = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email já cadastrado');
    }

    // Hash password
    const hashedPassword = await argon2.hash(dto.password);

    // Create escritorio first
    const escritorio = await this.prisma.escritorio.create({
      data: {
        nome: dto.nomeEscritorio,
      },
    });

    // Create user
    const user = await this.prisma.usuario.create({
      data: {
        email: dto.email,
        senha: hashedPassword,
        nome: dto.nome,
        // Quem cria o escritório é o titular (administrador)
        roles: 'ADMIN',
        escritorioId: escritorio.id,
        ativo: true,
      },
    });

    const tokens = this.generateTokens(user.id, user.email, user.roles as any);

    // Store refresh token hash in DB
    const hashedRefreshToken = await argon2.hash(tokens.refresh_token);
    await this.prisma.usuario.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashedRefreshToken },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        roles: user.roles,
        escritorioId: user.escritorioId,
      },
    };
  }

  async refreshToken(token: string): Promise<TokenResponse> {
    try {
      const decoded = this.jwtService.verify(token, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const user = await this.prisma.usuario.findUnique({
        where: { id: decoded.sub },
      });

      if (!user) {
        throw new UnauthorizedException('Usuário não encontrado');
      }

      // Validar que o usuário está ativo
      if (!user.ativo) {
        throw new UnauthorizedException('Conta de usuário inativa');
      }

      if (!user.refreshTokenHash) {
        throw new UnauthorizedException('Token de refresh inválido');
      }

      // Verificar que o token recebido foi hasheado corretamente
      const refreshTokenMatch = await argon2.verify(
        user.refreshTokenHash,
        token,
      );

      if (!refreshTokenMatch) {
        throw new UnauthorizedException('Token de refresh inválido');
      }

      const tokens = this.generateTokens(user.id, user.email, user.roles as any);

      // Update stored refresh token with token rotation
      const hashedRefreshToken = await argon2.hash(tokens.refresh_token);
      await this.prisma.usuario.update({
        where: { id: user.id },
        data: { refreshTokenHash: hashedRefreshToken },
      });

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Token de refresh inválido');
    }
  }

  // ═══════════════════════ ENTRAR COM GOOGLE ═══════════════════════════════

  static googleConfigurado(): boolean {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  /** Endereço de retorno: GOOGLE_LOGIN_REDIRECT_URI ou, sem ele, o do próprio sistema */
  static redirectLoginGoogle(): string {
    const base = (process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/+$/, '');
    return process.env.GOOGLE_LOGIN_REDIRECT_URI || `${base}/api/auth/google/callback`;
  }

  private clienteGoogle() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { google } = require('googleapis');
    return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, AuthService.redirectLoginGoogle());
  }

  private assinarEstadoGoogle(conteudo: string): string {
    const segredo = process.env.JWT_SECRET ?? '';
    if (!segredo) throw new BadRequestException('JWT_SECRET não configurado.');
    return createHmac('sha256', segredo).update(`login-google.${conteudo}`).digest('hex');
  }

  /**
   * URL da tela do Google. `consentir` força a tela de permissões: é o único jeito de o Google
   * devolver o token contínuo da agenda para quem já tinha autorizado antes.
   */
  urlLoginGoogle(opcoes: { consentir?: boolean; email?: string } = {}): string {
    if (!AuthService.googleConfigurado()) throw new BadRequestException('Login com Google ainda não configurado no servidor.');
    const conteudo = `${randomBytes(12).toString('hex')}.${Date.now()}.${opcoes.consentir ? 1 : 0}`;
    return this.clienteGoogle().generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      scope: ESCOPOS_LOGIN_GOOGLE,
      prompt: opcoes.consentir ? 'consent' : 'select_account',
      ...(opcoes.email ? { login_hint: opcoes.email } : {}),
      state: `${conteudo}.${this.assinarEstadoGoogle(conteudo)}`,
    });
  }

  /**
   * Volta do Google: confere o "state", identifica o e-mail e só deixa entrar quem já é usuário
   * ativo. Se veio permissão da agenda, guarda o token (cifrado). Devolve para onde redirecionar.
   */
  async concluirLoginGoogle(code: string, state: string): Promise<{ redirecionar: string }> {
    const partes = String(state ?? '').split('.');
    const assinatura = partes.pop() ?? '';
    const conteudo = partes.join('.');
    const [, tsStr, consentiu] = partes;
    const esperado = conteudo ? this.assinarEstadoGoogle(conteudo) : '';
    const valido = esperado.length === assinatura.length && assinatura.length > 0 &&
      timingSafeEqual(Buffer.from(esperado), Buffer.from(assinatura)) && Date.now() - Number(tsStr) < 15 * 60_000;
    if (!valido) throw new ForbiddenException('Link do Google inválido ou expirado. Tente entrar de novo.');
    if (!code) throw new BadRequestException('O Google não devolveu a autorização.');

    const cliente = this.clienteGoogle();
    const { tokens } = await cliente.getToken(code);
    const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const perfil = ticket.getPayload() ?? {};
    if (!perfil.email || !perfil.email_verified) throw new ForbiddenException('A conta Google não tem e-mail verificado.');

    const user = await this.prisma.usuario.findFirst({
      where: { email: { equals: perfil.email, mode: 'insensitive' }, ativo: true },
      select: { id: true, googleAgendaToken: true },
    });
    if (!user) {
      throw new ForbiddenException(`O e-mail ${perfil.email} não está cadastrado no JurysOne. Peça acesso ao administrador do escritório.`);
    }

    const liberouAgenda = String(tokens.scope ?? '').split(' ').includes(ESCOPO_AGENDA);
    if (tokens.refresh_token && liberouAgenda && criptografiaConfigurada()) {
      await this.prisma.usuario.update({
        where: { id: user.id },
        data: { googleAgendaToken: cifrar(tokens.refresh_token), googleAgendaId: 'primary', googleAgendaConectadoEm: new Date() },
      });
    } else if (!user.googleAgendaToken && liberouAgenda && consentiu !== '1' && criptografiaConfigurada()) {
      // Já tinha autorizado antes e o Google não reenviou o token da agenda: pede a permissão de novo, uma vez
      return { redirecionar: this.urlLoginGoogle({ consentir: true, email: perfil.email }) };
    }

    const agora = Date.now();
    for (const [c, v] of this.codigosGoogle) if (v.expira < agora) this.codigosGoogle.delete(c);
    const codigo = randomBytes(24).toString('base64url');
    this.codigosGoogle.set(codigo, { userId: user.id, expira: agora + CODIGO_GOOGLE_VALIDADE_MS });
    return { redirecionar: `/login.html?google=${codigo}` };
  }

  /** A tela de login troca o código de uso único pela sessão */
  async trocarCodigoGoogle(codigo: string, ctx?: ContextoRequisicao): Promise<TokenResponse & { user: any; agendaConectada: boolean }> {
    const item = this.codigosGoogle.get(String(codigo ?? ''));
    this.codigosGoogle.delete(String(codigo ?? ''));
    if (!item || item.expira < Date.now()) throw new UnauthorizedException('Login com Google expirou. Tente de novo.');
    const user = await this.prisma.usuario.findUnique({ where: { id: item.userId } });
    if (!user || !user.ativo) throw new UnauthorizedException('Conta de usuário inativa');
    const sessao = await this.emitirSessao(user);
    await this.auditoria.registrar({
      escritorioId: user.escritorioId, usuarioId: user.id, acao: 'LOGIN_GOOGLE', tipoEntidade: 'auth', ctx,
      detalhes: { metodo: 'google', email: user.email, agendaConectada: !!user.googleAgendaToken },
    });
    return { ...sessao, agendaConectada: !!user.googleAgendaToken };
  }

  /**
   * "Esqueceu a senha?": gera um código de uso único, guarda só o hash e envia o link por e-mail.
   * Responde sempre a mesma mensagem e não espera o envio, para não revelar quais e-mails existem.
   */
  async solicitarRedefinicaoSenha(emailInformado: string, ctx?: ContextoRequisicao): Promise<{ message: string }> {
    const email = String(emailInformado ?? '').trim();
    if (!email) throw new BadRequestException('Informe o e-mail');

    const user = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ativo: true },
      select: { id: true, nome: true, email: true, escritorioId: true },
    });
    if (!user) return { message: RESET_MENSAGEM };
    await this.auditoria.registrar({
      escritorioId: user.escritorioId, usuarioId: user.id, acao: 'PEDIDO_NOVA_SENHA', tipoEntidade: 'auth', ctx,
      detalhes: { email: user.email },
    });

    const codigo = randomBytes(32).toString('base64url');
    await this.prisma.usuario.update({
      where: { id: user.id },
      data: {
        resetSenhaHash: hashCodigo(codigo),
        resetSenhaExpiraEm: new Date(Date.now() + RESET_VALIDADE_MIN * 60_000),
      },
    });

    const base = (process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
    const link = `${base}/redefinir-senha.html?token=${codigo}`;
    const primeiroNome = (user.nome || '').split(' ')[0] || 'Olá';
    const texto =
      `${primeiroNome}, recebemos um pedido para criar uma nova senha no JurysOne.\n\n` +
      `Abra este link para escolher a nova senha (vale por ${RESET_VALIDADE_MIN} minutos e só pode ser usado uma vez):\n${link}\n\n` +
      'Se não foi você, ignore este e-mail: sua senha atual continua valendo.';
    const html =
      `<p>${primeiroNome}, recebemos um pedido para criar uma nova senha no <b>JurysOne</b>.</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0f2d5e;color:#fff;border-radius:8px;text-decoration:none;font-weight:700">Criar nova senha</a></p>` +
      `<p style="color:#64748b;font-size:13px">O link vale por ${RESET_VALIDADE_MIN} minutos e só pode ser usado uma vez. ` +
      'Se não foi você, ignore este e-mail: sua senha atual continua valendo.</p>';

    enviarEmail({ para: user.email, assunto: 'JurysOne — criar nova senha', texto, html }).catch((e) =>
      this.logger.error(`Falha ao enviar o e-mail de nova senha para ${user.email}: ${e?.message ?? e}`),
    );
    // Fora de produção o link vai também para o log, para testar sem depender do e-mail
    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[DEV] Link de nova senha para ${user.email}: ${link}`);
    }
    return { message: RESET_MENSAGEM };
  }

  /** Troca a senha a partir do código do e-mail; invalida o código e desconecta as sessões abertas. */
  async redefinirSenha(codigo: string, novaSenha: string, ctx?: ContextoRequisicao): Promise<{ message: string }> {
    const senha = String(novaSenha ?? '');
    if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
      throw new BadRequestException('A nova senha precisa ter pelo menos 8 caracteres, com letras e números.');
    }
    const invalido = new BadRequestException('Link inválido ou vencido. Peça um novo em "Esqueceu a senha?".');
    if (!codigo) throw invalido;

    const user = await this.prisma.usuario.findUnique({
      where: { resetSenhaHash: hashCodigo(String(codigo)) },
      select: { id: true, ativo: true, resetSenhaExpiraEm: true, escritorioId: true },
    });
    if (!user || !user.ativo || !user.resetSenhaExpiraEm || user.resetSenhaExpiraEm < new Date()) {
      throw invalido;
    }

    await this.prisma.usuario.update({
      where: { id: user.id },
      data: {
        senha: await argon2.hash(senha),
        resetSenhaHash: null,
        resetSenhaExpiraEm: null,
        refreshTokenHash: null,
      },
    });
    await this.auditoria.registrar({
      escritorioId: user.escritorioId, usuarioId: user.id, acao: 'SENHA_REDEFINIDA', tipoEntidade: 'auth', ctx,
      detalhes: { via: 'link do e-mail' },
    });
    return { message: 'Senha alterada. Entre com a nova senha.' };
  }

  async logout(userId: string, ctx?: ContextoRequisicao): Promise<void> {
    // Invalidate refresh token by clearing it
    const user = await this.prisma.usuario.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
      select: { id: true, escritorioId: true, email: true },
    });
    await this.auditoria.registrar({
      escritorioId: user.escritorioId, usuarioId: user.id, acao: 'LOGOUT', tipoEntidade: 'auth', ctx,
      detalhes: { email: user.email },
    });
  }

  generateTokens(
    userId: string,
    email: string,
    roles: string[],
  ): TokenResponse {
    const access_token = this.jwtService.sign(
      {
        sub: userId,
        email,
        roles,
      },
      {
        secret: process.env.JWT_SECRET,
        expiresIn: '1h',
      },
    );

    const refresh_token = this.jwtService.sign(
      {
        sub: userId,
        email,
      },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      },
    );

    return {
      access_token,
      refresh_token,
    };
  }
}
