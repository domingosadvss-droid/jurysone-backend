/**
 * JURYSONE — Root Controller
 *
 * Fornece as rotas raiz com informações da aplicação.
 * Nota: O prefixo global 'api' é adicionado automaticamente (app.setGlobalPrefix('api')).
 */
import { Controller, Get } from '@nestjs/common';

@Controller('')
export class AppController {
  @Get('/')
  root() {
    // Retorna informações da API quando acessar https://jurysone.com.br/api/
    return {
      name: 'JurysOne',
      description: 'Plataforma jurídica integrada com NestJS',
      version: '1.0.0',
      status: 'online',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      endpoints: {
        health: 'https://jurysone.com.br/api/health',
        docs: 'https://jurysone.com.br/api/docs',
        info: 'https://jurysone.com.br/api/',
      },
    };
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
