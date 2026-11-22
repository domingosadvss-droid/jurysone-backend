import { RegisterDto } from './dto/register.dto';
import { Controller, Post, Get, Body, UseGuards, Req, Res, GoneException } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { contextoDa } from '../auditoria/auditoria.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermiteParceiro, PermiteSemTermo } from '../../common/decorators/perfis.decorator';

@UseGuards(JwtAuthGuard)
@PermiteParceiro()
@PermiteSemTermo()
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * Login pelo Better Auth (desde 22/11/2026): a tela entra por /api/ba/* (senha, Google, 2FA) e
   * depois chama esta rota, que troca a sessão do Better Auth pelo token interno do JurysOne.
   */
  @Post('sessao')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  sessao(@Req() req: any): Promise<any> {
    return this.authService.sessaoDoBetterAuth(req, contextoDa(req));
  }

  /** QR Code para cadastrar o JurysOne no app autenticador (gerado aqui, sem serviço externo) */
  @Post('dois-fatores/qr')
  qrDoisFatores(@Body() body: { uri: string }) {
    return this.authService.qrDoisFatores(body?.uri);
  }

  /** Rota antiga de login: desligada para não existir entrada sem a verificação em duas etapas */
  @Post('login')
  @Public()
  loginAntigo(): never {
    throw new GoneException('O login mudou: atualize a página (Ctrl+F5) e entre de novo.');
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async register(@Body() body: RegisterDto): Promise<any> {
    return this.authService.register(body);
  }

  @Post('refresh')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(@Body() body: { token: string }): Promise<any> {
    return this.authService.refreshToken(body.token);
  }

  // ── Entrar com Google ──────────────────────────────────────────────────────
  /** A tela de login só mostra o botão quando o servidor tem a credencial do Google */
  @Get('google/disponivel')
  @Public()
  googleDisponivel() {
    return { disponivel: AuthService.googleConfigurado() };
  }

  /** Login com Google, "esqueci a senha" e redefinição agora são do Better Auth (/api/ba/*) */
  @Get('google')
  @Public()
  googleAntigo(@Res() res: Response) {
    return res.redirect('/login.html');
  }

  @Get('google/callback')
  @Public()
  googleCallbackAntigo(@Res() res: Response) {
    return res.redirect(`/login.html?erro=${encodeURIComponent('O login com Google mudou: tente de novo.')}`);
  }

  @Post('google/trocar')
  @Public()
  googleTrocarAntigo(): never {
    throw new GoneException('O login mudou: atualize a página e entre de novo.');
  }

  @Post('esqueci-senha')
  @Public()
  esqueciSenhaAntigo(): never {
    throw new GoneException('Atualize a página (Ctrl+F5) e use "Esqueceu a senha?" de novo.');
  }

  @Post('redefinir-senha')
  @Public()
  redefinirSenhaAntigo(): never {
    throw new GoneException('Este link é do sistema antigo. Peça um novo em "Esqueceu a senha?".');
  }

  @Post('logout')
  async logout(@CurrentUser() user: any, @Req() req: any) {
    await this.authService.logout(user.sub ?? user.id, contextoDa(req));
    return { message: 'Logout realizado com sucesso' };
  }

  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return {
      id: user.sub,
      email: user.email,
      nome: user.nome,
      roles: user.roles,
      parceiroId: user.parceiroId ?? null,
      termoAceitoEm: user.termoAceitoEm ?? null,
    };
  }
}
