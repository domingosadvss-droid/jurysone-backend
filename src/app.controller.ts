/**
 * JURYSONE — Root Controller
 *
 * Fornece a rota raiz "" com informações da aplicação.
 * Nota: O prefixo global 'api' é adicionado automaticamente (app.setGlobalPrefix('api')).
 */
import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import * as net from 'net';
import * as dns from 'dns/promises';

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
    return { db: dbStatus, error: dbError, url: masked };
  }

  @Get('/pooler-scan')
  async poolerScan() {
    const ref = 'igeavulziixkvpldiviy';
    const pass = process.env.DB_RAW_PASS ?? '%6L3XBuskgN9?6a';
    const regions = [
      'aws-0-us-east-1', 'aws-0-us-east-2', 'aws-0-us-west-1', 'aws-0-us-west-2',
      'aws-0-sa-east-1', 'aws-1-sa-east-1',
      'aws-0-eu-west-1', 'aws-0-eu-central-1',
      'aws-0-ap-southeast-1', 'aws-0-ap-northeast-1',
    ];

    // Testa conexao Postgres real em cada regiao usando o modulo pg
    let Client: any;
    try { Client = require('pg').Client; } catch { return { error: 'pg not available' }; }

    const tryConnect = (host: string): Promise<string> =>
      new Promise(resolve => {
        const c = new Client({
          host, port: 6543, database: 'postgres',
          user: `postgres.${ref}`, password: pass,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 5000,
        });
        c.connect((err: any) => {
          if (!err) { c.end(); resolve('CONNECTED'); return; }
          const msg: string = err.message ?? String(err);
          if (msg.includes('Tenant') || msg.includes('not found')) resolve('tenant-not-found');
          else if (msg.includes('password') || msg.includes('auth')) resolve('wrong-password');
          else if (msg.includes('timeout') || msg.includes('ECONNREFUSED')) resolve('unreachable');
          else resolve(`err: ${msg.substring(0, 80)}`);
          try { c.end(); } catch {}
        });
      });

    const results: any[] = [];
    for (const region of regions) {
      const poolerHost = `${region}.pooler.supabase.com`;
      const result = await tryConnect(poolerHost);
      results.push({ region, result });
      if (result === 'CONNECTED' || result === 'wrong-password') break; // achou!
    }
    return results;
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
