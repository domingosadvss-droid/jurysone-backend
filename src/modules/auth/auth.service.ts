import { Injectable, BadRequestException, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { enviarEmail } from '../../common/email';

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

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<TokenResponse & { user: any }> {
    const user = await this.prisma.usuario.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

    const passwordMatch = await argon2.verify(user.senha, dto.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Email ou senha inválidos');
    }

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

  /**
   * "Esqueceu a senha?": gera um código de uso único, guarda só o hash e envia o link por e-mail.
   * Responde sempre a mesma mensagem e não espera o envio, para não revelar quais e-mails existem.
   */
  async solicitarRedefinicaoSenha(emailInformado: string): Promise<{ message: string }> {
    const email = String(emailInformado ?? '').trim();
    if (!email) throw new BadRequestException('Informe o e-mail');

    const user = await this.prisma.usuario.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, ativo: true },
      select: { id: true, nome: true, email: true },
    });
    if (!user) return { message: RESET_MENSAGEM };

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
  async redefinirSenha(codigo: string, novaSenha: string): Promise<{ message: string }> {
    const senha = String(novaSenha ?? '');
    if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/[0-9]/.test(senha)) {
      throw new BadRequestException('A nova senha precisa ter pelo menos 8 caracteres, com letras e números.');
    }
    const invalido = new BadRequestException('Link inválido ou vencido. Peça um novo em "Esqueceu a senha?".');
    if (!codigo) throw invalido;

    const user = await this.prisma.usuario.findUnique({
      where: { resetSenhaHash: hashCodigo(String(codigo)) },
      select: { id: true, ativo: true, resetSenhaExpiraEm: true },
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
    return { message: 'Senha alterada. Entre com a nova senha.' };
  }

  async logout(userId: string): Promise<void> {
    // Invalidate refresh token by clearing it
    await this.prisma.usuario.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
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
