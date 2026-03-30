import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as argon2 from 'argon2';

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
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
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
    const hashedRefreshToken = await argon2.hash(tokens.refreshToken);
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
        roles: 'ADVOGADO',
        escritorioId: escritorio.id,
        ativo: true,
      },
    });

    const tokens = this.generateTokens(user.id, user.email, user.roles as any);

    // Store refresh token hash in DB
    const hashedRefreshToken = await argon2.hash(tokens.refreshToken);
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

      if (!user || !user.refreshTokenHash) {
        throw new UnauthorizedException('Token de refresh inválido');
      }

      const refreshTokenMatch = await argon2.verify(
        user.refreshTokenHash,
        token,
      );

      if (!refreshTokenMatch) {
        throw new UnauthorizedException('Token de refresh inválido');
      }

      const tokens = this.generateTokens(user.id, user.email, user.roles as any);

      // Update stored refresh token
      const hashedRefreshToken = await argon2.hash(tokens.refreshToken);
      await this.prisma.usuario.update({
        where: { id: user.id },
        data: { refreshTokenHash: hashedRefreshToken },
      });

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Token de refresh inválido');
    }
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
    const accessToken = this.jwtService.sign(
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

    const refreshToken = this.jwtService.sign(
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
      accessToken,
      refreshToken,
    };
  }
}
