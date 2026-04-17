/**
 * JURYSONE — Root Controller
 *
 * Fornece a rota raiz "/" com informações da aplicação.
 */
import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('/')
  @Redirect('/api/docs', 301)
  root() {
    // Redireciona para a documentação Swagger
    return;
  }

  @Get('/info')
  getInfo() {
    return {
      name: 'JurysOne',
      description: 'Plataforma jurídica integrada',
      version: '1.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
      docs: 'https://jurysone.com.br/api/docs',
      health: 'https://jurysone.com.br/api/health',
    };
  }
}
