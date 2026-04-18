/**
 * JURYSONE — Root Controller
 *
 * Fornece a rota raiz "" com informações da aplicação.
 * Nota: O prefixo global 'api' é adicionado automaticamente (app.setGlobalPrefix('api')).
 */
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';

@Controller('')
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/db-check')
  async dbCheck() {
    const dbUrl = process.env.DATABASE_URL ?? 'NOT SET';
    const masked = dbUrl.replace(/:([^:@]+)@/, ':***@');
    let dbStatus = 'unknown';
    let dbError = null;
    try {
      await this.prisma.$queryRaw`SELECT 1 as ping`;
      dbStatus = 'connected';
    } catch (e: any) {
      dbStatus = 'error';
      dbError = e?.message ?? String(e);
    }
    return {
      db: dbStatus,
      error: dbError,
      url: masked,
      dbUser: process.env.DB_USER ?? 'NOT SET',
      dbHost: process.env.DB_HOST ?? 'NOT SET',
      dbPasswordSet: !!(process.env.DB_PASSWORD),
    };
  }
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
