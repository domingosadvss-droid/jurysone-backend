/**
 * JURYSONE — Bootstrap
 *
 * Ponto de entrada da aplicação NestJS.
 * Ao iniciar, o ScheduleModule (via AgendaModule) registra automaticamente
 * todos os @Cron decorators — incluindo o AgendaNotificacoesCronService
 * que dispara notificações a cada 5 minutos.
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ── Segurança ────────────────────────────────────────────────────────────
  app.use(helmet());
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = [
    ...(isProduction ? [] : ['http://localhost:3000']), // Remove localhost em prod
    'https://jurysone.com.br',
    'https://www.jurysone.com.br',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // ── Validação global ─────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // ── Servir Frontend (HTML estático) ──────────────────────────────────────
  const publicPath = path.join(__dirname, '..', 'public');

  // Redireciona a raiz "/" para o login (o cliente já logado é redirecionado ao dashboard pelo login.html)
  app.use((req: any, res: any, next: any) => {
    if (req.path === '/' && req.method === 'GET') {
      return res.redirect(302, '/login.html');
    }
    next();
  });

  app.use(express.static(publicPath));

  // ── Prefixo global da API ────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Swagger (documentação) ───────────────────────────────────────────────
  // Desabilitar Swagger em produção por segurança (não expor endpoints públicos)
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('JurysOne API')
      .setDescription('API do sistema jurídico JurysOne')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`📋 Documentação em http://localhost:${process.env.PORT ?? 3001}/api/docs`);
  }

  // ── Health Check (Render / Railway usam esse endpoint) ───────────────────
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
  });

  // ── Start ────────────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  logger.log(`🚀 JurysOne API rodando em http://localhost:${port}/api`);
  logger.log(`🔒 Ambiente: ${isProduction ? 'PRODUCTION (Swagger disabled)' : 'DEVELOPMENT'}`);
  logger.log(`⏰ Cron de notificações: ativo (a cada 5 min)`);
}

bootstrap().catch(err => {
  console.error('Erro ao iniciar o servidor:', err);
  process.exit(1);
});
