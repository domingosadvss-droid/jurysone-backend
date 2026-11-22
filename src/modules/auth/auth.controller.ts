import { RegisterDto } from './dto/register.dto';
import { Controller, Post, Get, Body, UseGuards, Query, Req, Res, HttpException, Logger } from '@nestjs/common';
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

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(@Body() body: { email: string; password: string }, @Req() req: any): Promise<any> {
    return this.authService.login(body, contextoDa(req));
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

  /** Botão "Entrar com Google": leva à tela de escolha de conta do Google */
  @Get('google')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  entrarComGoogle(@Res() res: Response) {
    try {
      return res.redirect(this.authService.urlLoginGoogle());
    } catch (e: any) {
      return res.redirect(`/login.html?erro=${encodeURIComponent(e?.response?.message ?? e?.message ?? 'Erro')}`);
    }
  }

  /** Volta do Google (este endereço é cadastrado no Google Cloud Console) */
  @Get('google/callback')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async callbackGoogle(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') erro: string,
    @Res() res: Response,
  ) {
    if (erro) return res.redirect(`/login.html?erro=${encodeURIComponent('Login com Google cancelado.')}`);
    try {
      const { redirecionar } = await this.authService.concluirLoginGoogle(code, state);
      return res.redirect(redirecionar);
    } catch (e: any) {
      const msg = e instanceof HttpException
        ? String((e.getResponse() as any)?.message ?? e.message)
        : 'Não foi possível entrar com o Google. Tente de novo.';
      if (!(e instanceof HttpException)) new Logger('AuthController').warn(`Login Google: ${e?.message ?? e}`);
      return res.redirect(`/login.html?erro=${encodeURIComponent(msg)}`);
    }
  }

  /** A tela de login troca o código de uso único (vale 2 min) pela sessão */
  @Post('google/trocar')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  trocarCodigoGoogle(@Body() body: { codigo: string }, @Req() req: any) {
    return this.authService.trocarCodigoGoogle(body?.codigo, contextoDa(req));
  }

  @Post('esqueci-senha')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async esqueciSenha(@Body() body: { email: string }, @Req() req: any): Promise<{ message: string }> {
    return this.authService.solicitarRedefinicaoSenha(body?.email, contextoDa(req));
  }

  @Post('redefinir-senha')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async redefinirSenha(@Body() body: { token: string; novaSenha: string }, @Req() req: any): Promise<{ message: string }> {
    return this.authService.redefinirSenha(body?.token, body?.novaSenha, contextoDa(req));
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
