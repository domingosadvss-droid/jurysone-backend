/**
 * JURYSONE — PrismaService
 *
 * O schema.prisma usa nomes PT-BR nativamente (Usuario, Processo, etc.).
 * Este arquivo expõe aliases em inglês para compatibilidade com módulos legados
 * que ainda referenciam os nomes originais em inglês.
 */

import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Builds a safe DATABASE_URL from individual env vars when DB_PASSWORD is set.
 * This avoids Render UI URL-decoding issues with special chars (%, ?) in passwords.
 */
/**
 * If DB_PASSWORD is set, build DATABASE_URL and DIRECT_URL programmatically
 * using encodeURIComponent so special chars (%, ?) are properly escaped.
 * Must run before PrismaClient is instantiated since schema uses env("DATABASE_URL").
 */
function patchDatabaseEnvVars(): void {
  const dbPassword = process.env.DB_PASSWORD;
  if (!dbPassword) return;

  const user    = process.env.DB_USER  || 'postgres.mqzovxyexgaovqauxqrr';
  const host    = process.env.DB_HOST  || 'aws-1-sa-east-1.pooler.supabase.com';
  const portTx  = process.env.DB_PORT  || '6543';
  const portDir = process.env.DB_PORT_DIRECT || '5432';
  const db      = process.env.DB_NAME  || 'postgres';
  const enc     = encodeURIComponent(dbPassword);

  process.env.DATABASE_URL = `postgresql://${user}:${enc}@${host}:${portTx}/${db}?pgbouncer=true`;
  process.env.DIRECT_URL   = `postgresql://${user}:${enc}@${host}:${portDir}/${db}`;
}

patchDatabaseEnvVars();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super();
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err: any) {
      // Não crashar na inicialização — o app sobe e serve o frontend mesmo sem DB.
      // Cada query vai falhar individualmente até a conexão ser estabelecida.
      console.error('[PrismaService] DB connection failed on startup:', err?.message ?? err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

}
