import { Controller, Post, Get, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @Public()
  async login(@Body() body: { email: string; password: string }): Promise<any> {
    return this.authService.login(body);
  }

  @Post('register')
  @Public()
  async register(
    @Body()
    body: {
      email: string;
      password: string;
      nome: string;
      nomeEscritorio: string;
    },
  ): Promise<any> {
    return this.authService.register(body);
  }

  @Post('refresh')
  @Public()
  async refresh(@Body() body: { token: string }): Promise<any> {
    return this.authService.refreshToken(body.token);
  }

  @Post('logout')
  async logout(@CurrentUser() user: any) {
    await this.authService.logout(user.sub);
    return { message: 'Logout realizado com sucesso' };
  }

  @Get('me')
  async getProfile(@CurrentUser() user: any) {
    return {
      id: user.sub,
      email: user.email,
      roles: user.roles,
    };
  }
}
