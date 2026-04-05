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
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ── Segurança ────────────────────────────────────────────────────────────
  app.use(helmet());
  const allowedOrigins = [
    'http://localhost:3000',
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

  // ── Prefixo global da API ────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Swagger (documentação) ───────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('JurysOne API')
    .setDescription('API do sistema jurídico JurysOne')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // ── Health Check (Render / Railway usam esse endpoint) ───────────────────
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: any, res: any) => {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
  });

  // ── Start ────────────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  logger.log(`🚀 JurysOne API rodando em http://localhost:${port}/api`);
  logger.log(`📋 Documentação em http://localhost:${port}/api/docs`);
  logger.log(`⏰ Cron de notificações: ativo (a cada 5 min)`);
}

bootstrap().catch(err => {
  console.error('Erro ao iniciar o servidor:', err);
  process.exit(1);
});
