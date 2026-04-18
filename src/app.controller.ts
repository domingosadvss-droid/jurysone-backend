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
    const regions = [
      'aws-0-us-east-1', 'aws-0-us-east-2', 'aws-0-us-west-1', 'aws-0-us-west-2',
      'aws-0-sa-east-1', 'aws-1-sa-east-1',
      'aws-0-eu-west-1', 'aws-0-eu-west-2', 'aws-0-eu-central-1',
      'aws-0-ap-southeast-1', 'aws-0-ap-northeast-1',
    ];

    const tcpTest = (hostname: string, port: number, timeoutMs: number): Promise<string> =>
      new Promise(resolve => {
        const sock = new net.Socket();
        sock.setTimeout(timeoutMs);
        sock.on('connect', () => { sock.destroy(); resolve('open'); });
        sock.on('timeout', () => { sock.destroy(); resolve('timeout'); });
        sock.on('error', (e: any) => resolve(`err:${e.code}`));
        sock.connect(port, hostname);
      });

    const results: any[] = [];
    for (const region of regions) {
      const host = `${region}.pooler.supabase.com`;
      let ip = '';
      try {
        const addrs = await dns.resolve4(host);
        ip = addrs[0] ?? '?';
      } catch { ip = 'no-ipv4'; }
      const tcp = await tcpTest(host, 6543, 3000);
      results.push({ region, host, ip, tcp });
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
